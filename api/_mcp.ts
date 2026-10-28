// Conector de Mochi para Claude (MCP).
//
// Claude se conecta a https://mochi-facu.vercel.app/api/mcp. La primera vez te manda a entrar con
// Google (el mismo inicio de sesión de Mochi) y desde ahí puede ver tus materias, buscar y leer tus
// apuntes, ver tus fechas y entregas, y guardar archivos en Mochi.
//
// No se guarda nada en ningún servidor: los permisos viajan cifrados (AES-GCM) dentro de los tokens.

import { SCOPES, env, googleToken, seal, unseal } from './_shared.js';
import {
  Drive,
  containerIds,
  escapeQuery,
  filesIn,
  findFolder,
  findMateria,
  loadDatos,
  loadTree,
  readContent,
  where,
  type Content,
} from './_mochi.js';

type User = { email: string; name: string };
type Pending = { k: 'pend'; ru: string; st: string; cc: string; exp: number };
type Code = { k: 'code'; rt: string; user: User; ru: string; cc: string; exp: number };
type Access = { k: 'at'; rt: string; user: User; exp: number };
type Refresh = { k: 'rt'; rt: string; user: User };

const ORIGIN = 'https://mochi-facu.vercel.app';
const ACCESS_TTL = 60 * 60; // 1 hora; después Claude lo renueva solo.

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', ...headers },
  });

export const corsPreflight = () =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version',
      'Access-Control-Max-Age': '86400',
    },
  });

// Solo se aceptan las direcciones de vuelta de asistentes conocidos: Claude, Gemini (web), Antigravity, ChatGPT,
// programas en tu propia compu (Claude Code, Gemini CLI) y la extensión de Mochi para Chrome (*.chromiumapp.org). Así nadie puede usar el inicio de sesión de Mochi
// para mandar tus permisos a otro lado.
const TRUSTED = ['claude.ai', 'claude.com', 'antigravity.google', 'gemini.google.com', 'chatgpt.com', 'chat.openai.com'];
function allowedRedirect(uri: string) {
  try {
    const u = new URL(uri);
    if (u.protocol === 'https:')
      return TRUSTED.includes(u.hostname) || u.hostname.endsWith('.google.com') || u.hostname.endsWith('.chromiumapp.org');
    return u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname);
  } catch {
    return false;
  }
}

const b64url = (buf: ArrayBuffer) => Buffer.from(buf).toString('base64url');
const now = () => Math.floor(Date.now() / 1000);

// ---------------------------------------------------------------------------
// Datos que Claude lee para saber cómo conectarse.

export function metadata(origin: string, kind: string) {
  if (kind === 'oauth-protected-resource')
    return json(200, { resource: `${origin}/api/mcp`, authorization_servers: [origin], bearer_methods_supported: ['header'] });
  return json(200, {
    issuer: origin,
    authorization_endpoint: `${origin}/api/authorize`,
    token_endpoint: `${origin}/api/oauth-token`,
    registration_endpoint: `${origin}/api/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    scopes_supported: ['mochi'],
  });
}

// Registro del cliente (Claude). No hace falta guardarlo: lo que importa se controla al autorizar.
export async function register(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { redirect_uris?: string[]; client_name?: string };
  const uris = (body.redirect_uris ?? []).filter(allowedRedirect);
  if (!uris.length) return json(400, { error: 'invalid_redirect_uri', error_description: 'Solo se permite conectar desde asistentes conocidos (Claude, Gemini, Antigravity, ChatGPT).' });
  return json(201, {
    client_id: `mochi-${crypto.randomUUID()}`,
    client_name: body.client_name ?? 'Claude',
    redirect_uris: uris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    client_id_issued_at: now(),
  });
}

// Claude te manda acá; de acá vas a Google a entrar con tu cuenta.
export async function authorize(url: URL) {
  const p = url.searchParams;
  const ru = p.get('redirect_uri') ?? '';
  if (!allowedRedirect(ru)) return json(400, { error: 'invalid_request', error_description: 'Dirección de vuelta no permitida.' });
  // PKCE se usa si el asistente lo manda (Claude sí; Antigravity puede usar un id y una clave en su lugar).
  const cc = p.get('code_challenge') ?? '';
  if (p.get('response_type') !== 'code' || (cc && (p.get('code_challenge_method') ?? 'S256') !== 'S256'))
    return json(400, { error: 'invalid_request', error_description: 'Pedido inválido.' });
  const pending: Pending = { k: 'pend', ru, st: p.get('state') ?? '', cc, exp: now() + 15 * 60 };
  const g = new URLSearchParams({
    client_id: env('GOOGLE_CLIENT_ID'),
    redirect_uri: `${url.origin}/api/callback`,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    // "m." = este inicio de sesión es para el conector, no para la app.
    state: `m.${await seal(pending)}`,
  });
  return new Response(null, { status: 302, headers: { Location: `https://accounts.google.com/o/oauth2/v2/auth?${g}`, 'Cache-Control': 'no-store' } });
}

// Vuelta de Google (la recibe /api/callback cuando el state empieza con "m.").
export async function googleCallback(url: URL, state: string) {
  const pending = await unseal<Pending>(state.slice(2));
  if (!pending || pending.k !== 'pend' || pending.exp < now()) return new Response('El pedido venció. Volvé a conectar desde Claude.', { status: 400 });
  const back = new URL(pending.ru);
  if (pending.st) back.searchParams.set('state', pending.st);
  if (url.searchParams.get('error')) {
    back.searchParams.set('error', 'access_denied');
    return Response.redirect(back.toString(), 302);
  }
  const { ok, data } = await googleToken({
    code: url.searchParams.get('code') ?? '',
    redirect_uri: `${url.origin}/api/callback`,
    grant_type: 'authorization_code',
  });
  if (!ok || !data.refresh_token || !String(data.scope).includes('drive.file')) {
    back.searchParams.set('error', 'access_denied');
    back.searchParams.set('error_description', 'Hay que aceptar el permiso de Google Drive.');
    return Response.redirect(back.toString(), 302);
  }
  const claims = JSON.parse(Buffer.from(String(data.id_token).split('.')[1], 'base64url').toString());
  const code: Code = {
    k: 'code',
    rt: data.refresh_token,
    user: { email: claims.email, name: claims.name ?? claims.email },
    ru: pending.ru,
    cc: pending.cc,
    exp: now() + 5 * 60,
  };
  back.searchParams.set('code', await seal(code));
  return Response.redirect(back.toString(), 302);
}

async function issue(rt: string, user: User) {
  const access: Access = { k: 'at', rt, user, exp: now() + ACCESS_TTL };
  const refresh: Refresh = { k: 'rt', rt, user };
  return json(200, { access_token: await seal(access), token_type: 'Bearer', expires_in: ACCESS_TTL, refresh_token: await seal(refresh), scope: 'mochi' });
}

export async function token(req: Request) {
  const text = await req.text();
  const ct = req.headers.get('content-type') ?? '';
  const p = ct.includes('json') ? new URLSearchParams(JSON.parse(text || '{}')) : new URLSearchParams(text);
  const bad = (d: string) => json(400, { error: 'invalid_grant', error_description: d });

  if (p.get('grant_type') === 'authorization_code') {
    const code = await unseal<Code>(p.get('code'));
    if (!code || code.k !== 'code' || code.exp < now()) return bad('El código venció.');
    if (p.get('redirect_uri') && p.get('redirect_uri') !== code.ru) return bad('La dirección no coincide.');
    if (code.cc) {
      const verifier = p.get('code_verifier') ?? '';
      const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
      if (challenge !== code.cc) return bad('PKCE no coincide.');
    }
    return issue(code.rt, code.user);
  }
  if (p.get('grant_type') === 'refresh_token') {
    const r = await unseal<Refresh>(p.get('refresh_token'));
    if (!r || r.k !== 'rt') return bad('Volvé a conectar Mochi.');
    return issue(r.rt, r.user);
  }
  return json(400, { error: 'unsupported_grant_type' });
}

// ---------------------------------------------------------------------------
// El conector en sí: protocolo MCP sobre HTTP (sin sesiones, cada pedido se responde solo).

const TOOLS = [
  {
    name: 'ver_materias',
    description:
      'Lista las materias del estudiante en Mochi, agrupadas por año, con su estado (cursando, final pendiente, aprobada) y las carpetas de cada una. Usalo primero para ubicarte.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { title: 'Ver materias', readOnlyHint: true },
  },
  {
    name: 'ver_archivos',
    description: 'Lista los archivos de una materia (o de una carpeta de esa materia), con su id, carpeta y fecha. Para leer uno, usá leer_archivo con su id.',
    inputSchema: {
      type: 'object',
      properties: {
        materia: { type: 'string', description: 'Nombre o id de la materia (por ejemplo "Diseño de Sistemas")' },
        carpeta: { type: 'string', description: 'Opcional: nombre o id de una carpeta adentro de la materia (por ejemplo "TP Final")' },
      },
      required: ['materia'],
    },
    annotations: { title: 'Ver archivos', readOnlyHint: true },
  },
  {
    name: 'buscar',
    description: 'Busca archivos en Mochi por nombre y también por contenido (texto adentro de PDF y Word). Opcionalmente solo en una materia.',
    inputSchema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Qué buscar' },
        materia: { type: 'string', description: 'Opcional: nombre o id de la materia' },
      },
      required: ['texto'],
    },
    annotations: { title: 'Buscar', readOnlyHint: true },
  },
  {
    name: 'leer_archivo',
    description: 'Devuelve el contenido de un archivo de Mochi: el texto de PDF, Word, Excel, documentos de Google y archivos de texto, o la imagen si es una foto.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Id del archivo (de ver_archivos o buscar)' } },
      required: ['id'],
    },
    annotations: { title: 'Leer archivo', readOnlyHint: true },
  },
  {
    name: 'ver_agenda',
    description: 'Devuelve las próximas fechas de parciales y finales, las entregas (TPs, actividades) pendientes y entregadas, y las notas cargadas en Mochi.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { title: 'Ver agenda', readOnlyHint: true },
  },
  {
    name: 'guardar_archivo',
    description:
      'Guarda un archivo de texto nuevo en Mochi, adentro de una materia (y opcionalmente de una carpeta, que se crea si no existe). Sirve para dejar resúmenes, borradores del TP o respuestas. Usá formato Markdown (.md) salvo que pidan otro.',
    inputSchema: {
      type: 'object',
      properties: {
        materia: { type: 'string', description: 'Nombre o id de la materia' },
        carpeta: { type: 'string', description: 'Opcional: carpeta donde guardarlo (se crea si no existe)' },
        nombre: { type: 'string', description: 'Nombre del archivo, con extensión (por ejemplo "Resumen Unidad 3.md")' },
        contenido: { type: 'string', description: 'Contenido del archivo' },
      },
      required: ['materia', 'nombre', 'contenido'],
    },
    annotations: { title: 'Guardar archivo', readOnlyHint: false, destructiveHint: false },
  },
];

const INSTRUCTIONS =
  'Mochi es la app donde el estudiante guarda los apuntes de la facultad (Ingeniería en Sistemas, UTN FRLP), ordenados por año, materia y carpetas. ' +
  'Para encontrar algo, empezá con ver_materias o buscar, y después leé los archivos con leer_archivo. Citá de qué archivo sale cada cosa. ' +
  'Para fechas de parciales, entregas y notas usá ver_agenda. No inventes contenido que no esté en los apuntes.';

const text = (t: string): Content[] => [{ type: 'text', text: t }];

async function callTool(d: Drive, name: string, a: Record<string, string>): Promise<Content[]> {
  const t = await loadTree(d);
  const needMateria = () => {
    const m = findMateria(t, a.materia ?? '');
    if (!m) throw new Error(`No encontré la materia "${a.materia}". Las materias son: ${[...t.materias.values()].map((x) => x.name).join(', ')}.`);
    return m;
  };
  const line = (f: { id: string; name: string; parents?: string[]; modifiedTime: string }) =>
    `- ${f.name} — ${where(t, f.parents?.[0])} — ${f.modifiedTime.slice(0, 10)} — id: ${f.id}`;

  switch (name) {
    case 'ver_materias': {
      const byYear = new Map<string, string[]>();
      for (const m of t.materias.values()) {
        const folders = [...t.folders.values()].filter((f) => f.materiaId === m.id).map((f) => f.path.split(' › ').slice(1).join(' › '));
        const estado = { cursando: 'cursando', final: 'final pendiente', aprobada: `aprobada${m.nota ? ` (${m.nota})` : ''}` }[m.estado ?? ''] ?? '';
        const row = `- ${m.name}${estado ? ` [${estado}]` : ''} (id: ${m.id})${folders.length ? `\n  Carpetas: ${folders.join('; ')}` : ''}`;
        byYear.set(m.year, [...(byYear.get(m.year) ?? []), row]);
      }
      return text([...byYear].map(([y, rows]) => `## ${y}\n${rows.join('\n')}`).join('\n\n') || 'Todavía no hay materias en Mochi.');
    }
    case 'ver_archivos': {
      const m = needMateria();
      let ids = containerIds(t, m.id);
      if (a.carpeta) {
        const f = findFolder(t, m.id, a.carpeta);
        if (!f) throw new Error(`No encontré la carpeta "${a.carpeta}" en ${m.name}.`);
        ids = [f.id, ...[...t.folders.entries()].filter(([, x]) => x.path.startsWith(`${f.path} › `)).map(([id]) => id)];
      }
      const files = await filesIn(d, ids);
      return text(files.length ? `${files.length} archivos:\n${files.map(line).join('\n')}` : 'No hay archivos ahí.');
    }
    case 'buscar': {
      const q = (a.texto ?? '').trim();
      if (!q) throw new Error('Falta qué buscar.');
      const m = a.materia ? needMateria() : null;
      const ids = containerIds(t, m?.id);
      const e = escapeQuery(q);
      const byName = await filesIn(d, ids, ` and name contains '${e}'`);
      const byContent = (await filesIn(d, ids, ` and fullText contains '${e}'`)).filter((f) => !byName.some((x) => x.id === f.id));
      if (!byName.length && !byContent.length) return text(`No encontré nada con "${q}".`);
      return text(
        [
          byName.length ? `Por nombre:\n${byName.slice(0, 40).map(line).join('\n')}` : '',
          byContent.length ? `Lo mencionan adentro:\n${byContent.slice(0, 40).map(line).join('\n')}` : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
      );
    }
    case 'leer_archivo': {
      const f = await d.get(a.id ?? '');
      return readContent(d, f);
    }
    case 'ver_agenda': {
      const datos = await loadDatos(d, t);
      const mat = (id: string) => t.materias.get(id)?.name ?? '?';
      const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' });
      const exams = datos.exams.filter((x) => x.date >= hoy).sort((x, y) => x.date.localeCompare(y.date));
      const pend = datos.entregas.filter((x) => !x.done).sort((x, y) => x.date.localeCompare(y.date));
      const done = datos.entregas.filter((x) => x.done).slice(-15);
      return text(
        [
          `Hoy es ${hoy}.`,
          `## Próximos parciales y finales\n${exams.map((x) => `- ${x.date}: ${x.title} — ${mat(x.materiaId)}`).join('\n') || 'Ninguno cargado.'}`,
          `## Entregas pendientes\n${pend.map((x) => `- ${x.date}${x.date < hoy ? ' (ATRASADA)' : ''}: ${x.title}${x.desc ? ` (${x.desc})` : ''} — ${mat(x.materiaId)}`).join('\n') || 'Ninguna.'}`,
          `## Entregadas (últimas)\n${done.map((x) => `- ${x.date}: ${x.title} — ${mat(x.materiaId)}`).join('\n') || 'Ninguna.'}`,
          `## Notas\n${datos.grades.map((x) => `- ${mat(x.materiaId)}: ${x.title} = ${x.nota}`).join('\n') || 'Ninguna.'}`,
        ].join('\n\n'),
      );
    }
    case 'guardar_archivo': {
      const m = needMateria();
      let parent = m.id;
      let place = m.name;
      if (a.carpeta?.trim()) {
        const f = findFolder(t, m.id, a.carpeta);
        if (f) {
          parent = f.id;
          place = f.path;
        } else {
          parent = (await d.createFolder(a.carpeta.trim(), m.id)).id;
          place = `${m.name} › ${a.carpeta.trim()}`;
        }
      }
      const nombre = (a.nombre ?? 'Notas.md').trim();
      const e = nombre.split('.').pop()?.toLowerCase();
      const mime = e === 'md' ? 'text/markdown' : e === 'html' ? 'text/html' : e === 'csv' ? 'text/csv' : 'text/plain';
      const f = await d.create(nombre, parent, a.contenido ?? '', mime);
      return text(`Guardado "${f.name}" en ${place}. Ya aparece en Mochi.`);
    }
  }
  throw new Error(`Herramienta desconocida: ${name}`);
}

type Rpc = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: Record<string, unknown> };

async function handle(msg: Rpc, auth: Access): Promise<unknown | undefined> {
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id: msg.id, result });
  switch (msg.method) {
    case 'initialize':
      return ok({
        protocolVersion: (msg.params?.protocolVersion as string) ?? '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: 'Mochi',
          title: 'Mochi',
          version: '1.0.0',
          websiteUrl: ORIGIN,
          // El logo de Mochi, para que Claude lo muestre al lado del conector.
          icons: [
            { src: `${ORIGIN}/pwa-192x192.png`, mimeType: 'image/png', sizes: ['192x192'] },
            { src: `${ORIGIN}/pwa-512x512.png`, mimeType: 'image/png', sizes: ['512x512'] },
            { src: `${ORIGIN}/icon.svg`, mimeType: 'image/svg+xml', sizes: ['any'] },
          ],
        },
        instructions: INSTRUCTIONS,
      });
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: TOOLS });
    case 'tools/call': {
      const name = String(msg.params?.name ?? '');
      const args = (msg.params?.arguments ?? {}) as Record<string, string>;
      try {
        const { ok: good, data } = await googleToken({ refresh_token: auth.rt, grant_type: 'refresh_token' });
        if (!good) throw new Error('Se cerró tu sesión de Google. Desconectá y volvé a conectar Mochi en Claude.');
        return ok({ content: await callTool(new Drive(data.access_token), name, args) });
      } catch (e) {
        return ok({ content: text(e instanceof Error ? e.message : 'Algo salió mal'), isError: true });
      }
    }
    default:
      if (msg.id === undefined || msg.id === null) return undefined; // notificaciones: no llevan respuesta
      return { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `Método no soportado: ${msg.method}` } };
  }
}

export async function mcp(req: Request) {
  const origin = new URL(req.url).origin;
  const unauthorized = () =>
    json(401, { error: 'invalid_token' }, { 'WWW-Authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"` });
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const auth = await unseal<Access>(bearer);
  if (!auth || auth.k !== 'at' || auth.exp < now()) return unauthorized();

  const body = (await req.json().catch(() => null)) as Rpc | Rpc[] | null;
  if (!body) return json(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido' } });
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handle(m, auth)))).filter((x) => x !== undefined);
    return out.length ? json(200, out) : new Response(null, { status: 202 });
  }
  const r = await handle(body, auth);
  return r === undefined ? new Response(null, { status: 202 }) : json(200, r);
}

// Que la clave de la sesión exista (si no, nada de esto funciona).
export const mcpReady = () => !!process.env.SESSION_SECRET && !!process.env.GOOGLE_CLIENT_ID;

// ---------------------------------------------------------------------------
// Extensión de Chrome: con el permiso guardado (el mismo de los conectores), devuelve un acceso a Drive
// de corta duración. La extensión sube los archivos directo a Drive, como la app.
export async function extToken(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { refresh_token?: string };
  const r = await unseal<Refresh>(body.refresh_token);
  if (!r || r.k !== 'rt') return json(401, { error: 'sin_sesion' });
  const { ok, data } = await googleToken({ refresh_token: r.rt, grant_type: 'refresh_token' });
  if (!ok) return json(401, { error: 'sin_sesion' });
  return json(200, { access_token: data.access_token, expires_in: data.expires_in, user: r.user });
}
