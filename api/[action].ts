// Login con Google. Guarda el "refresh token" cifrado en una cookie para que
// la sesión quede abierta, y le entrega a la app tokens de acceso a Drive.

import {
  MAX_AGE,
  SCOPES,
  SESSION,
  STATE,
  type Session,
  cookie,
  env,
  googleToken,
  readCookie,
  respond,
  seal,
  unseal,
} from './_shared.js';
import { authorize, corsPreflight, extToken, googleCallback, mcp, metadata, register, token } from './_mcp.js';

// Pedidos previos de navegadores (CORS) para el conector de Claude.
export const OPTIONS = () => corsPreflight();

export async function GET(req: Request) {
  const url = new URL(req.url);
  const action = url.pathname.split('/').pop();
  const secure = url.protocol === 'https:';
  const redirectUri = `${url.origin}/api/callback`;

  if (action === 'login') {
    const state = crypto.randomUUID();
    const p = new URLSearchParams({
      client_id: env('GOOGLE_CLIENT_ID'),
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return respond(302, null, [cookie(STATE, state, 600, secure)], `https://accounts.google.com/o/oauth2/v2/auth?${p}`);
  }

  // Conector de Claude: datos para conectarse y entrada con Google.
  // En Vercel llega la dirección original (/.well-known/...), en la compu la reescrita (/api/wk-...).
  if (action === 'wk-as' || url.pathname.startsWith('/.well-known/oauth-authorization-server'))
    return metadata(url.origin, 'oauth-authorization-server');
  if (action === 'wk-pr' || url.pathname.startsWith('/.well-known/oauth-protected-resource'))
    return metadata(url.origin, 'oauth-protected-resource');
  if (action === 'authorize') return authorize(url);
  if (action === 'mcp') return new Response(null, { status: 405, headers: { Allow: 'POST' } });

  if (action === 'callback') {
    // Si viene del conector de Claude, sigue por otro camino.
    const st = url.searchParams.get('state') ?? '';
    if (st.startsWith('m.')) return googleCallback(url, st);
    const clearState = cookie(STATE, '', 0, secure);
    if (url.searchParams.get('error')) return respond(302, null, [clearState], '/?error=cancelado');
    const state = url.searchParams.get('state');
    if (!state || state !== readCookie(req, STATE)) return respond(302, null, [clearState], '/?error=reintentar');

    const { ok, data } = await googleToken({
      code: url.searchParams.get('code') ?? '',
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });
    if (!ok || !data.refresh_token) return respond(302, null, [clearState], '/?error=reintentar');
    if (!String(data.scope).includes('drive.file')) return respond(302, null, [clearState], '/?error=falta_drive');

    const claims = JSON.parse(Buffer.from(String(data.id_token).split('.')[1], 'base64url').toString());
    const session = await seal({
      rt: data.refresh_token,
      user: { email: claims.email, name: claims.name ?? claims.email, picture: claims.picture },
    });
    return respond(302, null, [clearState, cookie(SESSION, session, MAX_AGE, secure)], '/');
  }

  if (action === 'token') {
    const raw = readCookie(req, SESSION);
    const session = await unseal(raw);
    if (!session) return respond(401, { error: 'sin_sesion' });
    const { ok, data } = await googleToken({ refresh_token: session.rt, grant_type: 'refresh_token' });
    if (!ok) {
      const expired = data.error === 'invalid_grant';
      return respond(expired ? 401 : 502, { error: data.error }, expired ? [cookie(SESSION, '', 0, secure)] : []);
    }
    // Renueva la cookie para que la sesión no venza mientras se use la app.
    return respond(200, { access_token: data.access_token, expires_in: data.expires_in, user: session.user }, [
      cookie(SESSION, raw!, MAX_AGE, secure),
    ]);
  }

  if (action === 'logout') return respond(302, null, [cookie(SESSION, '', 0, secure)], '/');

  return respond(404, { error: 'no_existe' });
}

// ---------------------------------------------------------------------------
// Asistente con IA (Gemini). La app ejecuta las herramientas en el navegador
// (porque ahí tiene acceso a Drive); acá solo se habla con Gemini.

const IA_LIMIT = 20; // preguntas por día y por persona con la clave compartida
const IA_COOKIE = 'mochi_ia';
// Se prueban en orden: si uno está saturado o sin cupo, se usa el siguiente.
const IA_MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite'];

const IA_SYSTEM = `Sos Mochi, el asistente de una app de apuntes de la facultad. Hablás en español rioplatense (vos), claro y breve.
Ayudás a encontrar, entender y ordenar los apuntes del usuario, y a manejar sus fechas de parciales, entregas (TPs, actividades), notas y materias.

Cómo trabajar:
- Para responder sobre los apuntes, primero buscalos o abrilos con las herramientas. No inventes contenido: si no está en los apuntes, decilo.
- Cuando uses información de un archivo, mencioná de qué archivo sale.
- Para cambiar algo (crear carpetas, mover, renombrar, cargar fechas, entregas o notas, marcar entregas como entregadas, cambiar el estado de una materia) usá la herramienta correspondiente. La app le pide confirmación al usuario antes de aplicarlo, así que no hace falta que preguntes antes.
- No podés borrar nada. Si te lo piden, explicá que se borra desde la app (menú de tres puntos → Eliminar).
- Usá los ids que devuelven las herramientas; nunca los inventes. Si hay varias materias o carpetas posibles, preguntá cuál.
- Para fechas, usá el formato AAAA-MM-DD. Tené en cuenta la fecha de hoy que figura en el contexto.
- Respuestas cortas, con listas cuando ayuden. Podés usar **negrita**.`;

const prop = (type: string, description: string) => ({ type, description });
const IA_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'listar_materias',
        description: 'Lista todas las materias del usuario por año, con su id, estado y carpetas.',
        parameters: { type: 'object', properties: {} },
      },
      {
        name: 'buscar_archivos',
        description: 'Busca archivos por nombre y por contenido (adentro de PDFs y Word). Opcionalmente solo en una materia.',
        parameters: {
          type: 'object',
          properties: { texto: prop('string', 'Palabras a buscar'), materia_id: prop('string', 'Opcional: id de la materia') },
          required: ['texto'],
        },
      },
      {
        name: 'listar_archivos',
        description: 'Lista los archivos de una materia, o de una carpeta de esa materia.',
        parameters: {
          type: 'object',
          properties: { materia_id: prop('string', 'Id de la materia'), carpeta_id: prop('string', 'Opcional: id de la carpeta') },
          required: ['materia_id'],
        },
      },
      {
        name: 'leer_archivo',
        description: 'Devuelve el texto de un archivo (PDF, Word, Excel) para poder resumirlo, explicarlo o tomar preguntas.',
        parameters: { type: 'object', properties: { archivo_id: prop('string', 'Id del archivo') }, required: ['archivo_id'] },
      },
      {
        name: 'ver_fechas_y_notas',
        description: 'Devuelve las próximas fechas de parciales y finales, las entregas (TPs, actividades; pendientes y entregadas, con su id) y las notas cargadas.',
        parameters: { type: 'object', properties: {} },
      },
      {
        name: 'ver_carrera',
        description: 'Devuelve el plan de estudios (Ingeniería en Sistemas, UTN FRLP, plan 2023): porcentaje de la carrera, estado de cada materia y qué correlativas le faltan para cursar cada una.',
        parameters: { type: 'object', properties: {} },
      },
      {
        name: 'crear_carpeta',
        description: 'Crea una carpeta dentro de una materia, o dentro de otra carpeta.',
        parameters: {
          type: 'object',
          properties: {
            materia_id: prop('string', 'Id de la materia'),
            nombre: prop('string', 'Nombre de la carpeta nueva'),
            dentro_de_carpeta_id: prop('string', 'Opcional: id de la carpeta donde crearla'),
          },
          required: ['materia_id', 'nombre'],
        },
      },
      {
        name: 'mover_archivos',
        description: 'Mueve uno o varios archivos a una carpeta, o sueltos a una materia.',
        parameters: {
          type: 'object',
          properties: {
            archivo_ids: { type: 'array', items: { type: 'string' }, description: 'Ids de los archivos' },
            destino_id: prop('string', 'Id de la carpeta o de la materia de destino'),
          },
          required: ['archivo_ids', 'destino_id'],
        },
      },
      {
        name: 'renombrar',
        description: 'Cambia el nombre de un archivo o carpeta. Para archivos, mantené la extensión.',
        parameters: {
          type: 'object',
          properties: { id: prop('string', 'Id del archivo o carpeta'), nombre: prop('string', 'Nombre nuevo') },
          required: ['id', 'nombre'],
        },
      },
      {
        name: 'agregar_fecha',
        description: 'Carga una fecha de parcial, recuperatorio o final en una materia.',
        parameters: {
          type: 'object',
          properties: {
            materia_id: prop('string', 'Id de la materia'),
            titulo: prop('string', 'Ej: Parcial 1, Final, Entrega TP 2'),
            fecha: prop('string', 'Fecha en formato AAAA-MM-DD'),
          },
          required: ['materia_id', 'titulo', 'fecha'],
        },
      },
      {
        name: 'agregar_entrega',
        description: 'Anota algo para entregar (TP, actividad, informe) en una materia. Usalo para entregas; agregar_fecha es para parciales y finales.',
        parameters: {
          type: 'object',
          properties: {
            materia_id: prop('string', 'Id de la materia'),
            titulo: prop('string', 'Ej: TP 2, Actividad grupal de la semana'),
            detalle: prop('string', 'Opcional: de qué se trata'),
            fecha: prop('string', 'Fecha de entrega en formato AAAA-MM-DD'),
          },
          required: ['materia_id', 'titulo', 'fecha'],
        },
      },
      {
        name: 'marcar_entregada',
        description: 'Marca una entrega como entregada (o de nuevo como pendiente).',
        parameters: {
          type: 'object',
          properties: {
            entrega_id: prop('string', 'Id de la entrega (de ver_fechas_y_notas)'),
            entregada: prop('boolean', 'true = entregada (por defecto), false = pendiente'),
          },
          required: ['entrega_id'],
        },
      },
      {
        name: 'agregar_nota',
        description: 'Carga la nota de un parcial, TP o final en una materia.',
        parameters: {
          type: 'object',
          properties: {
            materia_id: prop('string', 'Id de la materia'),
            titulo: prop('string', 'Ej: Parcial 1, TP 2'),
            nota: prop('number', 'Nota de 0 a 10'),
          },
          required: ['materia_id', 'titulo', 'nota'],
        },
      },
      {
        name: 'cambiar_estado',
        description: 'Cambia el estado de una materia: cursando, final (final pendiente), aprobada o ninguno.',
        parameters: {
          type: 'object',
          properties: {
            materia_id: prop('string', 'Id de la materia'),
            estado: { type: 'string', enum: ['cursando', 'final', 'aprobada', 'ninguno'] },
            nota_final: prop('number', 'Opcional, solo si está aprobada'),
          },
          required: ['materia_id', 'estado'],
        },
      },
    ],
  },
];

type IaUse = { d: string; n: number };

export async function POST(req: Request) {
  const url = new URL(req.url);
  const secure = url.protocol === 'https:';
  const action = url.pathname.split('/').pop();
  if (action === 'mcp') return mcp(req);
  if (action === 'register') return register(req);
  if (action === 'oauth-token') return token(req);
  if (action === 'ext-token') return extToken(req);
  if (action !== 'ia') return respond(404, { error: 'no_existe' });

  const session = await unseal(readCookie(req, SESSION));
  if (!session) return respond(401, { error: 'sin_sesion' });

  const raw = await req.text();
  if (raw.length > 2_000_000) return respond(413, { error: 'muy_largo' });
  const body = JSON.parse(raw) as { contents: { role: string; parts: { text?: string }[] }[]; contexto?: string };
  // Solo cuenta como pregunta nueva cuando lo último es un mensaje escrito por el usuario
  // (no los pasos intermedios en los que la app le devuelve resultados de herramientas).
  const lastMsg = body.contents.at(-1);
  const isNew = lastMsg?.role === 'user' && lastMsg.parts.some((x) => typeof x.text === 'string');

  // Con clave propia no hay límite; con la compartida, IA_LIMIT por día.
  const ownKey = req.headers.get('x-gemini-key')?.trim();
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' });
  const prev = (await unseal(readCookie(req, IA_COOKIE))) as unknown as IaUse | null;
  const use: IaUse = prev && prev.d === today ? prev : { d: today, n: 0 };
  if (!ownKey && isNew && use.n >= IA_LIMIT) return respond(429, { error: 'limite', restantes: 0, limite: IA_LIMIT });

  const key = ownKey || env('GEMINI_API_KEY');
  const payload = JSON.stringify({
    systemInstruction: { parts: [{ text: `${IA_SYSTEM}\n\nContexto:\n${body.contexto ?? ''}` }] },
    contents: body.contents,
    tools: IA_TOOLS,
    generationConfig: { temperature: 0.4 },
  });

  let last = '';
  for (const model of IA_MODELS) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: payload,
    });
    const data = await r.json();
    if (r.ok) {
      if (!ownKey && isNew) use.n++;
      const restantes = ownKey ? null : IA_LIMIT - use.n;
      return respond(
        200,
        { content: data.candidates?.[0]?.content ?? null, finish: data.candidates?.[0]?.finishReason, restantes, limite: IA_LIMIT },
        ownKey ? [] : [cookie(IA_COOKIE, await seal(use as unknown as Session), 2 * 24 * 60 * 60, secure)],
      );
    }
    last = `${r.status} ${data.error?.status ?? ''}`;
    // Saturado o sin cupo: se prueba el siguiente modelo. Otro error: se corta.
    if (![429, 500, 503].includes(r.status)) break;
  }
  return respond(502, { error: 'gemini', detalle: last });
}
