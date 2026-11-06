// Avisos de parciales y entregas: una notificación en el celu el día antes y el mismo día,
// aunque la app esté cerrada.
//
// Solo para quien los activa. Se guarda lo mínimo en una base de datos chica (Redis de Upstash):
//  - a qué dispositivos avisarle (la "suscripción" que da el navegador),
//  - las próximas fechas: título, nombre de la materia y día.
// No se guarda el correo (se usa un código sacado de él) ni nada de Drive.
// La app manda las fechas cada vez que cambian; una tarea diaria (vercel.json → crons) manda los avisos.

import webpush from 'web-push';
import { SESSION, env, readCookie, respond, unseal } from './_shared.js';

type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };
// t = título, m = materia, d = día (AAAA-MM-DD), e = es una entrega (si no, parcial o final).
type Evento = { t: string; m: string; d: string; e: boolean };
type Guardado = { subs: Sub[]; eventos: Evento[] };

const USERS = 'avisos';

// Redis por HTTP: Vercel crea estas variables al conectar la base de Upstash al proyecto.
async function redis(...cmd: (string | number)[]) {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Falta conectar la base de datos de los avisos (ver docs/CONFIGURACION.md)');
  const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(cmd) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`Redis: ${j.error ?? r.status}`);
  return j.result;
}

async function userKey(email: string) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${env('SESSION_SECRET')}:${email.toLowerCase()}`));
  return `avisos:${Buffer.from(h).toString('base64url')}`;
}

async function load(key: string): Promise<Guardado | null> {
  const raw = await redis('GET', key);
  return raw ? JSON.parse(raw) : null;
}

async function save(key: string, g: Guardado) {
  if (!g.subs.length) {
    await redis('DEL', key);
    await redis('SREM', USERS, key);
    return;
  }
  await redis('SET', key, JSON.stringify(g));
  await redis('SADD', USERS, key);
}

function vapid(origin: string) {
  webpush.setVapidDetails(origin.startsWith('https:') ? origin : 'https://mochi-facu.vercel.app', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
}

type Mensaje = { title: string; body: string; url: string };

// Manda a todos los dispositivos; devuelve los que siguen funcionando (los dados de baja se descartan).
async function enviar(subs: Sub[], m: Mensaje) {
  const vivos: Sub[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(s, JSON.stringify(m), { TTL: 12 * 60 * 60 });
        vivos.push(s);
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code !== 404 && code !== 410) vivos.push(s);
      }
    }),
  );
  return vivos;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const isSub = (s: unknown): s is Sub => {
  const x = s as Sub;
  return !!x && typeof x.endpoint === 'string' && x.endpoint.startsWith('https://') && typeof x.keys?.p256dh === 'string' && typeof x.keys?.auth === 'string';
};

// La clave pública que el navegador necesita para suscribirse.
export const clave = () => respond(200, { clave: env('VAPID_PUBLIC_KEY') });

// POST /api/avisos
//   { sub, eventos }  activa los avisos en este dispositivo (y manda uno de prueba)
//   { eventos }       actualiza las fechas (si no tiene avisos activados, no se guarda nada)
//   { quitar }        desactiva los avisos en el dispositivo con ese endpoint
export async function avisos(req: Request) {
  const session = await unseal(readCookie(req, SESSION));
  if (!session) return respond(401, { error: 'sin_sesion' });
  let body: { sub?: unknown; eventos?: unknown; quitar?: unknown };
  try {
    body = await req.json();
  } catch {
    return respond(400, { error: 'pedido_invalido' });
  }

  const key = await userKey(session.user.email);
  const g = (await load(key)) ?? { subs: [], eventos: [] };
  const nuevo = isSub(body.sub) && !g.subs.some((s) => s.endpoint === (body.sub as Sub).endpoint);

  if (!g.subs.length && !isSub(body.sub)) return respond(200, { activos: false });
  if (isSub(body.sub)) {
    const s = body.sub;
    g.subs = [...g.subs.filter((x) => x.endpoint !== s.endpoint), { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } }].slice(-5);
  }
  if (typeof body.quitar === 'string') g.subs = g.subs.filter((x) => x.endpoint !== body.quitar);
  if (Array.isArray(body.eventos))
    g.eventos = body.eventos
      .slice(0, 100)
      .map((e: Partial<Evento>) => ({ t: str(e?.t, 120), m: str(e?.m, 120), d: str(e?.d, 10), e: e?.e === true }))
      .filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.d) && e.t);

  if (nuevo) {
    vapid(new URL(req.url).origin);
    const s = g.subs.at(-1)!;
    const ok = await enviar([s], { title: 'Listo, avisos activados', body: 'Te vamos a avisar el día antes de cada parcial y entrega.', url: '/' });
    if (!ok.length) return respond(502, { error: 'no_llego' });
  }
  await save(key, g);
  return respond(200, { activos: g.subs.length > 0 });
}

// Día en Argentina, corrido n días.
function dia(n: number) {
  const d = new Date(Date.now() + n * 86_400_000);
  return d.toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' });
}

export function mensaje(eventos: Evento[], hoy: string, manana: string): Mensaje | null {
  const lineas = [
    ...eventos.filter((e) => e.d === hoy).map((e) => `${e.e ? 'Hoy vence' : 'Hoy'}: ${e.t} · ${e.m}`),
    ...eventos.filter((e) => e.d === manana).map((e) => `${e.e ? 'Mañana vence' : 'Mañana'}: ${e.t} · ${e.m}`),
  ];
  if (!lineas.length) return null;
  const soloEntregas = eventos.filter((e) => e.d === hoy || e.d === manana).every((e) => e.e);
  return lineas.length === 1
    ? { title: lineas[0], body: 'Tocá para verlo en Mochi', url: soloEntregas ? '/#/entregas' : '/#/fechas' }
    : { title: `Tenés ${lineas.length} cosas entre hoy y mañana`, body: lineas.join('\n'), url: soloEntregas ? '/#/entregas' : '/#/fechas' };
}

// GET /api/cron-avisos: lo llama Vercel una vez por día (a la mañana).
export async function cron(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${env('CRON_SECRET')}`) return respond(401, { error: 'no' });
  vapid(new URL(req.url).origin);
  const hoy = dia(0);
  const manana = dia(1);
  const keys: string[] = (await redis('SMEMBERS', USERS)) ?? [];
  let enviados = 0;
  for (const key of keys) {
    const g = await load(key);
    if (!g) {
      await redis('SREM', USERS, key);
      continue;
    }
    // Las fechas que ya pasaron no hacen falta más.
    g.eventos = g.eventos.filter((e) => e.d >= hoy);
    const m = mensaje(g.eventos, hoy, manana);
    if (m) {
      g.subs = await enviar(g.subs, m);
      enviados++;
    }
    await save(key, g);
  }
  return respond(200, { usuarios: keys.length, enviados });
}
