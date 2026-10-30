// Acceso a Google Drive. Solo ve los archivos que creó esta app (permiso drive.file).

import { getList, isNetworkError, putList } from './offline';

export const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
export const FOLDER = 'application/vnd.google-apps.folder';
const FIELDS = 'id,name,mimeType,modifiedTime,size,parents,appProperties,webViewLink,thumbnailLink';

export type DFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
  parents?: string[];
  appProperties?: Record<string, string>;
  webViewLink?: string;
  thumbnailLink?: string;
};

export type User = { email: string; name: string; picture?: string };

export class AuthError extends Error {}

let cached: { token: string; exp: number } | null = null;
let pending: Promise<string> | null = null;
export let currentUser: User | null = (() => {
  try {
    return JSON.parse(localStorage.getItem('mochi:user') ?? 'null');
  } catch {
    return null;
  }
})();

// true cuando se está mostrando lo guardado porque no hay internet.
export let offlineMode = false;
function setOffline(v: boolean) {
  if (v === offlineMode) return;
  offlineMode = v;
  dispatchEvent(new Event('mochi:offline'));
}

// Archivos ya vistos, para abrirlos al instante en el visor.
export const fileCache = new Map<string, DFile>();

export function getToken(): Promise<string> {
  if (cached && Date.now() < cached.exp - 60_000) return Promise.resolve(cached.token);
  pending ??= (async () => {
    const r = await fetch('/api/token', { credentials: 'same-origin' });
    if (r.status === 401) throw new AuthError('Sin sesión');
    if (!r.ok) throw new Error('No se pudo conectar con Google. Revisá tu conexión.');
    const j = await r.json();
    cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
    currentUser = j.user;
    try {
      localStorage.setItem('mochi:user', JSON.stringify(j.user));
    } catch {}
    return cached.token;
  })().finally(() => (pending = null));
  return pending;
}

export async function req(url: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const token = await getToken();
  const r = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
  if (r.status === 401 && retry) {
    cached = null;
    return req(url, init, false);
  }
  if (!r.ok) {
    const text = await r.text();
    if (/accessNotConfigured|SERVICE_DISABLED|has not been used/.test(text))
      throw new Error('Falta habilitar la Google Drive API en Google Cloud (ver docs/CONFIGURACION.md, paso 3). Si recién la habilitaste, esperá un minuto.');
    if (r.status === 403 && /storageQuotaExceeded/.test(text)) throw new Error('Tu Google Drive está lleno.');
    throw new Error(`Error de Drive (${r.status}): ${text.slice(0, 200)}`);
  }
  return r;
}

function remember<T extends DFile | DFile[]>(f: T): T {
  for (const x of Array.isArray(f) ? f : [f]) fileCache.set(x.id, x);
  return f;
}

export const DEMO = import.meta.env.DEV && new URLSearchParams(location.search).has('demo');

export async function list(q: string, opts: { orderBy?: string; pageSize?: number; firstPageOnly?: boolean } = {}) {
  if (DEMO) {
    currentUser = { email: 'demo@demo', name: 'Demo' };
    return remember((await import('./demo')).demoList(q));
  }
  const key = JSON.stringify([q, opts.orderBy ?? '', opts.pageSize ?? 0]);
  try {
    const out: DFile[] = [];
    let pageToken: string | undefined;
    do {
      const p = new URLSearchParams({
        q,
        fields: `nextPageToken,files(${FIELDS})`,
        pageSize: String(opts.pageSize ?? 1000),
        spaces: 'drive',
      });
      if (opts.orderBy) p.set('orderBy', opts.orderBy);
      if (pageToken) p.set('pageToken', pageToken);
      const r: { files: DFile[]; nextPageToken?: string } = await (await req(`${API}/files?${p}`)).json();
      out.push(...r.files);
      pageToken = opts.firstPageOnly ? undefined : r.nextPageToken;
    } while (pageToken);
    setOffline(false);
    putList(key, out);
    return remember(out);
  } catch (e) {
    // Sin internet: se usa lo último que se vio.
    if (!(e instanceof AuthError) && isNetworkError(e)) {
      const saved = await getList<DFile[]>(key);
      setOffline(true);
      if (saved) return remember(saved);
      throw new Error('Sin conexión. Esto todavía no se abrió con internet, así que no está guardado.');
    }
    throw e;
  }
}

export async function getFile(id: string) {
  if (DEMO) {
    const { demoFiles } = await import('./demo');
    const f = demoFiles.find((x) => x.id === id);
    if (f) return remember(f);
  }
  return remember((await (await req(`${API}/files/${id}?fields=${FIELDS}`)).json()) as DFile);
}

export async function createFolder(name: string, parent: string | undefined, appProperties: Record<string, string>) {
  if (DEMO) return remember((await import('./demo')).demoCreateFolder(name, parent, appProperties));
  const r = await req(`${API}/files?fields=${FIELDS}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER, parents: parent ? [parent] : undefined, appProperties }),
  });
  return remember((await r.json()) as DFile);
}

export async function update(
  id: string,
  body: Partial<Omit<DFile, 'appProperties'>> & { trashed?: boolean; appProperties?: Record<string, string | null> },
  params: Record<string, string> = {}) {
  if (DEMO) return remember((await import('./demo')).demoUpdate(id, body as never, params));
  const p = new URLSearchParams({ fields: FIELDS, ...params });
  const r = await req(`${API}/files/${id}?${p}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return remember((await r.json()) as DFile);
}

export const rename = (id: string, name: string) => update(id, { name });
export const trash = (id: string) => update(id, { trashed: true });
export const move = (id: string, from: string[], to: string) =>
  update(id, {}, { addParents: to, removeParents: from.join(',') });

export async function download(id: string) {
  if (DEMO) return (await import('./demo')).demoBlob(id);
  return (await req(`${API}/files/${id}?alt=media`)).blob();
}

// Presentaciones (.pptx): Drive hace una copia convertida a Google Slides, la exporta a PDF y la borra.
// La copia va a la raíz de Mi unidad para que no aparezca un instante en la carpeta de la materia.
export async function slidesPdf(id: string) {
  if (DEMO) return (await import('./demo')).demoBlob(id);
  const r = await req(`${API}/files/${id}/copy?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Mochi (temporal, se borra solo)', mimeType: 'application/vnd.google-apps.presentation', parents: ['root'] }),
  });
  const copy: { id: string } = await r.json();
  try {
    return await (await req(`${API}/files/${copy.id}/export?mimeType=application/pdf`)).blob();
  } finally {
    req(`${API}/files/${copy.id}`, { method: 'DELETE' }).catch(() => {});
  }
}

export async function saveContent(id: string, content: Blob) {
  const r = await req(`${UPLOAD}/files/${id}?uploadType=media&fields=${FIELDS}`, { method: 'PATCH', body: content });
  return remember((await r.json()) as DFile);
}

export async function createTextFile(
  name: string,
  parent: string,
  content: string,
  mimeType: string,
  appProperties?: Record<string, string>,
) {
  const boundary = 'facu' + Math.random().toString(36).slice(2);
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name, parents: [parent], mimeType, appProperties }) +
    `\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n${content}\r\n--${boundary}--`;
  const r = await req(`${UPLOAD}/files?uploadType=multipart&fields=${FIELDS}`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  return remember((await r.json()) as DFile);
}

// Subida "reanudable": sirve para archivos grandes y permite mostrar el progreso.
export async function upload(file: File, parent: string, onProgress?: (fraction: number) => void): Promise<DFile> {
  const token = await getToken();
  const init = await fetch(`${UPLOAD}/files?uploadType=resumable&fields=${FIELDS}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': file.type || 'application/octet-stream',
      'X-Upload-Content-Length': String(file.size),
    },
    body: JSON.stringify({ name: file.name, parents: [parent] }),
  });
  const location = init.headers.get('Location');
  if (!init.ok || !location) throw new Error(`No se pudo empezar la subida de ${file.name}`);

  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', location);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    x.onload = () =>
      x.status < 300 ? resolve(remember(JSON.parse(x.responseText))) : reject(new Error(`Falló la subida de ${file.name}`));
    x.onerror = () => reject(new Error('Se cortó la conexión'));
    x.send(file);
  });
}

export function escapeQuery(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// Compartir una carpeta "con cualquiera que tenga el link" (solo lectura).
// Lo de adentro hereda el permiso, incluso lo que se agregue después.
