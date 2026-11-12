// Liga mensual y duelos: lo único de Mochi que se comparte entre personas.
//
// Liga: un grupo que arma alguien y al que se suman sus compañeros con un link. Cada repaso diario suma puntos
// (30 por terminarlo y 5 por cada respuesta correcta: premia la constancia,
// porque a cada uno le tocan preguntas distintas; los duelos son los que comparan las mismas preguntas). La liga dura un mes calendario (hora de Argentina);
// al empezar un mes nuevo, el que más sumó se lleva una medalla y los puntos vuelven a cero.
//
// Duelo: alguien comparte 5 preguntas de su repaso con un link; el otro las responde y se ve quién acertó más.
//
// Se guarda lo mínimo en la base de datos de Mochi (Redis de Upstash):
//  - de cada persona en una liga: su nombre de pila con la inicial del apellido, su foto de Google, puntos, racha y medallas;
//  - de cada duelo (se borra solo a los 14 días): las preguntas, el nombre y la foto de quienes jugaron y cuántas acertaron.
// La persona se identifica con un código sacado de su mail (no se guarda el mail).

import { SESSION, env, readCookie, redis, respond, unseal, type Session } from './_shared.js';

type Miembro = { n: string; f?: string; p: number; d?: string; r: number; m: number };
// s: el mes que se está jugando (AAAA-MM).
type Liga = { n: string; s: string; g?: { n: string; p: number } };
type PreguntaDuelo = { q: string; opciones: string[]; ok: number; por?: string };
type Jugador = { n: string; f?: string; a: number };
type Duelo = { de: string; materia: string; preguntas: PreguntaDuelo[]; jugadores: Record<string, Jugador> };

const MAX_MIEMBROS = 50;
const DUELO_TTL = 14 * 24 * 60 * 60;

async function uid(email: string) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`liga:${env('SESSION_SECRET')}:${email.toLowerCase()}`));
  return Buffer.from(h).toString('base64url').slice(0, 22);
}

// "Guillermo Giles" → "Guillermo G."
function nombreCorto(name: string) {
  const [a, ...resto] = name.trim().split(/\s+/);
  const ap = resto.at(-1);
  return (ap ? `${a} ${ap[0].toUpperCase()}.` : a || 'Alguien').slice(0, 30);
}

const diaAR = (d = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' });

// El mes de hoy (AAAA-MM), en Argentina.
export const mes = (hoy = diaAR()) => hoy.slice(0, 7);

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const codigo = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => CHARS[b % CHARS.length]).join('');

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function getJSON<T>(key: string): Promise<T | null> {
  const raw = await redis('GET', key);
  return raw ? (JSON.parse(raw) as T) : null;
}

async function miembros(code: string): Promise<Record<string, Miembro>> {
  const flat: string[] = (await redis('HGETALL', `liga:${code}:m`)) ?? [];
  const out: Record<string, Miembro> = {};
  for (let i = 0; i < flat.length; i += 2) out[flat[i]] = JSON.parse(flat[i + 1]);
  return out;
}

// Si empezó un mes nuevo: medalla para el que más sumó y los puntos a cero.
async function alDia(code: string, liga: Liga) {
  const ahora = mes();
  if (liga.s === ahora) return liga;
  const ms = await miembros(code);
  const [ganador] = Object.entries(ms)
    .filter(([, m]) => m.p > 0)
    .sort((a, b) => b[1].p - a[1].p);
  const cambios: string[] = [];
  for (const [id, m] of Object.entries(ms)) {
    const nuevo = { ...m, p: 0, m: m.m + (ganador?.[0] === id ? 1 : 0) };
    cambios.push(id, JSON.stringify(nuevo));
  }
  if (cambios.length) await redis('HSET', `liga:${code}:m`, ...cambios);
  const nueva: Liga = { ...liga, s: ahora, g: ganador ? { n: ganador[1].n, p: ganador[1].p } : undefined };
  await redis('SET', `liga:${code}`, JSON.stringify(nueva));
  return nueva;
}

async function verLiga(code: string, yo: string) {
  let liga = await getJSON<Liga>(`liga:${code}`);
  if (!liga) return null;
  liga = await alDia(code, liga);
  const ms = await miembros(code);
  const hoy = diaAR();
  const ayer = diaAR(new Date(Date.now() - 86_400_000));
  return {
    nombre: liga.n,
    codigo: code,
    mes: liga.s,
    ganadorAnterior: liga.g ?? null,
    miembros: Object.entries(ms)
      .map(([id, m]) => ({
        nombre: m.n,
        foto: m.f ?? null,
        puntos: m.p,
        // La racha que se ve: si no repasó ni hoy ni ayer, ya se cortó.
        racha: m.d === hoy || m.d === ayer ? m.r : 0,
        hoy: m.d === hoy,
        medallas: m.m,
        yo: id === yo,
      }))
      .sort((a, b) => b.puntos - a.puntos || b.racha - a.racha),
  };
}

function nuevoMiembro(s: Session): Miembro {
  return { n: nombreCorto(s.user.name), f: s.user.picture?.startsWith('https://') ? s.user.picture : undefined, p: 0, r: 0, m: 0 };
}

// POST /api/liga  { accion, ... }
export async function liga(req: Request) {
  const session = await unseal(readCookie(req, SESSION));
  if (!session) return respond(401, { error: 'sin_sesion' });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return respond(400, { error: 'pedido_invalido' });
  }
  const yo = await uid(session.user.email);
  const mia = async () => (await redis('GET', `ligade:${yo}`)) as string | null;

  switch (body.accion) {
    case 'ver': {
      const code = await mia();
      const l = code ? await verLiga(code, yo) : null;
      // La liga ya no existe (se fueron todos): se olvida.
      if (code && !l) await redis('DEL', `ligade:${yo}`);
      return respond(200, { liga: l });
    }

    // Antes de unirse: el nombre de la liga del link y cuántos son.
    case 'previa': {
      const code = str(body.codigo, 10).toUpperCase();
      const l = await getJSON<Liga>(`liga:${code}`);
      if (!l) return respond(404, { error: 'no_existe' });
      return respond(200, { nombre: l.n, miembros: Number(await redis('HLEN', `liga:${code}:m`)), yaEstas: (await mia()) === code });
    }

    case 'crear': {
      const nombre = str(body.nombre, 40);
      if (!nombre) return respond(400, { error: 'falta_nombre' });
      const anterior = await mia();
      if (anterior) await salir(anterior, yo);
      let code = codigo(6);
      while (await redis('EXISTS', `liga:${code}`)) code = codigo(6);
      await redis('SET', `liga:${code}`, JSON.stringify({ n: nombre, s: mes() } satisfies Liga));
      await redis('HSET', `liga:${code}:m`, yo, JSON.stringify(nuevoMiembro(session)));
      await redis('SET', `ligade:${yo}`, code);
      return respond(200, { liga: await verLiga(code, yo) });
    }

    case 'unirse': {
      const code = str(body.codigo, 10).toUpperCase();
      if (!(await redis('EXISTS', `liga:${code}`))) return respond(404, { error: 'no_existe' });
      const anterior = await mia();
      if (anterior !== code) {
        if (Number(await redis('HLEN', `liga:${code}:m`)) >= MAX_MIEMBROS) return respond(409, { error: 'llena' });
        if (anterior) await salir(anterior, yo);
        await redis('HSET', `liga:${code}:m`, yo, JSON.stringify(nuevoMiembro(session)));
        await redis('SET', `ligade:${yo}`, code);
      }
      return respond(200, { liga: await verLiga(code, yo) });
    }

    case 'salir': {
      const code = await mia();
      if (code) await salir(code, yo);
      return respond(200, { liga: null });
    }

    // Al terminar el repaso del día: suma los puntos (una sola vez por día).
    case 'sumar': {
      const code = await mia();
      if (!code) return respond(200, { liga: null });
      const l = await getJSON<Liga>(`liga:${code}`);
      if (!l) return respond(200, { liga: null });
      await alDia(code, l);
      const raw = await redis('HGET', `liga:${code}:m`, yo);
      const m: Miembro = raw ? JSON.parse(raw) : nuevoMiembro(session);
      const aciertos = Math.max(0, Math.min(10, Math.floor(Number(body.aciertos) || 0)));
      const racha = Math.max(0, Math.min(100_000, Math.floor(Number(body.racha) || 0)));
      const hoy = diaAR();
      if (m.d !== hoy) {
        m.p += 30 + aciertos * 5;
        m.d = hoy;
      }
      m.r = racha;
      // Por si cambió el nombre o la foto en Google.
      Object.assign(m, { n: nombreCorto(session.user.name), f: session.user.picture?.startsWith('https://') ? session.user.picture : m.f });
      await redis('HSET', `liga:${code}:m`, yo, JSON.stringify(m));
      return respond(200, { liga: await verLiga(code, yo) });
    }

    case 'duelo-crear': {
      const preguntas = (Array.isArray(body.preguntas) ? body.preguntas : [])
        .slice(0, 10)
        .map((p: Partial<PreguntaDuelo>) => ({
          q: str(p?.q, 300),
          opciones: (Array.isArray(p?.opciones) ? p.opciones : []).slice(0, 5).map((o) => str(o, 200)),
          ok: Number(p?.ok),
          por: str(p?.por, 400) || undefined,
        }))
        .filter((p) => p.q && p.opciones.length >= 2 && p.opciones.every(Boolean) && Number.isInteger(p.ok) && p.ok >= 0 && p.ok < p.opciones.length);
      if (preguntas.length < 3) return respond(400, { error: 'pocas_preguntas' });
      const respuestas = Array.isArray(body.respuestas) ? body.respuestas : [];
      const id = codigo(8);
      const d: Duelo = {
        de: yo,
        materia: str(body.materia, 80),
        preguntas,
        jugadores: { [yo]: { n: nombreCorto(session.user.name), f: session.user.picture, a: contar(preguntas, respuestas) } },
      };
      await redis('SET', `duelo:${id}`, JSON.stringify(d), 'EX', DUELO_TTL);
      await anotarDuelo(yo, id);
      return respond(200, { id });
    }

    case 'duelo-ver': {
      const id = str(body.id, 12);
      const d = await getJSON<Duelo>(`duelo:${id}`);
      if (!d) return respond(404, { error: 'no_existe' });
      return respond(200, { duelo: verDuelo(id, d, yo) });
    }

    case 'duelo-responder': {
      const id = str(body.id, 12);
      const d = await getJSON<Duelo>(`duelo:${id}`);
      if (!d) return respond(404, { error: 'no_existe' });
      // Se juega una sola vez.
      if (!d.jugadores[yo]) {
        d.jugadores[yo] = { n: nombreCorto(session.user.name), f: session.user.picture, a: contar(d.preguntas, Array.isArray(body.respuestas) ? body.respuestas : []) };
        // Que no crezca sin fin si el link circula por un grupo grande.
        if (Object.keys(d.jugadores).length <= 60) {
          const ttl = Number(await redis('TTL', `duelo:${id}`));
          await redis('SET', `duelo:${id}`, JSON.stringify(d), 'EX', ttl > 0 ? ttl : DUELO_TTL);
          await anotarDuelo(yo, id);
        }
      }
      return respond(200, { duelo: verDuelo(id, d, yo) });
    }

    case 'duelos': {
      const ids: string[] = (await redis('LRANGE', `duelos:${yo}`, 0, 19)) ?? [];
      const out = [];
      for (const id of ids) {
        const d = await getJSON<Duelo>(`duelo:${id}`);
        if (d) out.push(verDuelo(id, d, yo, false));
      }
      return respond(200, { duelos: out });
    }
  }
  return respond(400, { error: 'accion_desconocida' });
}

async function salir(code: string, yo: string) {
  await redis('HDEL', `liga:${code}:m`, yo);
  await redis('DEL', `ligade:${yo}`);
  // El último que se va borra la liga.
  if (!Number(await redis('HLEN', `liga:${code}:m`))) await redis('DEL', `liga:${code}`);
}

async function anotarDuelo(yo: string, id: string) {
  await redis('LREM', `duelos:${yo}`, 0, id);
  await redis('LPUSH', `duelos:${yo}`, id);
  await redis('LTRIM', `duelos:${yo}`, 0, 19);
  await redis('EXPIRE', `duelos:${yo}`, DUELO_TTL);
}

const contar = (preguntas: PreguntaDuelo[], respuestas: unknown[]) => preguntas.filter((p, i) => respuestas[i] === p.ok).length;

// Lo que ve cada uno. Las preguntas y los resultados de los demás, solo después de jugar (o si es el que lo armó).
function verDuelo(id: string, d: Duelo, yo: string, conPreguntas = true) {
  const jugo = !!d.jugadores[yo];
  return {
    id,
    materia: d.materia,
    total: d.preguntas.length,
    esMio: d.de === yo,
    jugaste: jugo,
    creador: { nombre: d.jugadores[d.de]?.n ?? 'Alguien', foto: d.jugadores[d.de]?.f ?? null },
    preguntas: conPreguntas && !jugo ? d.preguntas : undefined,
    jugadores: jugo
      ? Object.entries(d.jugadores)
          .map(([id, j]) => ({ nombre: j.n, foto: j.f ?? null, aciertos: j.a, yo: id === yo, creador: id === d.de }))
          .sort((a, b) => b.aciertos - a.aciertos)
      : [],
  };
}
