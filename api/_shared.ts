// Partes comunes del servidor: variables, cifrado de sesiones, cookies, respuestas y tokens de Google.

export const SCOPES = 'openid email profile https://www.googleapis.com/auth/drive.file';
export const SESSION = 'facu_session';
export const STATE = 'facu_state';
export const MAX_AGE = 400 * 24 * 60 * 60;

// ia: cuántas preguntas a la IA hizo hoy con la clave compartida (d = día, n = cantidad).
export type Session = { rt: string; user: { email: string; name: string; picture?: string }; ia?: { d: string; n: number } };

const enc = new TextEncoder();
const dec = new TextDecoder();

export function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable ${name} (ver docs/CONFIGURACION.md)`);
  return v;
}

async function key() {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(env('SESSION_SECRET')));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

// Guarda datos cifrados (AES-GCM) en un texto: sesiones, permisos del conector, etc.
export async function seal(data: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), enc.encode(JSON.stringify(data))),
  );
  return Buffer.concat([iv, ct]).toString('base64url');
}

export async function unseal<T = Session>(value: string | null | undefined): Promise<T | null> {
  if (!value) return null;
  try {
    const buf = new Uint8Array(Buffer.from(value, 'base64url'));
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, await key(), buf.slice(12));
    return JSON.parse(dec.decode(pt));
  } catch {
    return null;
  }
}

export function readCookie(req: Request, name: string) {
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function cookie(name: string, value: string, maxAge: number, secure: boolean) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export function respond(status: number, body: unknown, cookies: string[] = [], location?: string) {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  if (location) headers.set('Location', location);
  else headers.set('Content-Type', 'application/json');
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(location ? null : JSON.stringify(body), { status, headers });
}

export async function googleToken(params: Record<string, string>) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('GOOGLE_CLIENT_ID'),
      client_secret: env('GOOGLE_CLIENT_SECRET'),
      ...params,
    }),
  });
  return { ok: r.ok, data: await r.json() };
}

// Base de datos chica (Redis de Upstash) por HTTP, para los avisos y la liga: Vercel crea estas variables al conectar la base de Upstash al proyecto.
export async function redis(...cmd: (string | number)[]) {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Falta conectar la base de datos de los avisos (ver docs/CONFIGURACION.md)');
  const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(cmd) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`Redis: ${j.error ?? r.status}`);
  return j.result;
}
