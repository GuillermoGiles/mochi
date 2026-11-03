// Leer una carpeta que otra persona compartió con link, para copiarla a tu Mochi.
// Con el permiso drive.file la app no puede ver archivos ajenos, así que se leen como
// "públicos" con una clave de API (restringida a este sitio en Google Cloud).

import { FOLDER, type DFile } from './drive';
import type { ShareManifest } from './share';

const KEY = import.meta.env.VITE_GOOGLE_API_KEY as string | undefined;
const API = 'https://www.googleapis.com/drive/v3';

export const sharingReady = () => !!KEY;

async function get(url: string) {
  if (!KEY) throw new Error('Falta configurar la clave de API de Google (ver docs/CONFIGURACION.md).');
  const r = await fetch(`${url}${url.includes('?') ? '&' : '?'}key=${KEY}`);
  if (r.status === 404 || r.status === 403)
    throw new Error('No se pudo abrir. Puede que la dejaron de compartir o que el link esté mal.');
  if (!r.ok) throw new Error(`Error de Drive (${r.status})`);
  return r;
}

export type SharedInfo = { id: string; name: string; owner?: string };
export type SharedEntry = { file: DFile; dirs: string[] };

// Si se compartió archivo por archivo, el link apunta a un índice con la lista.
const manifests = new Map<string, ShareManifest>();

export async function sharedInfo(id: string): Promise<SharedInfo> {
  const f = await (await get(`${API}/files/${id}?fields=id,name,mimeType,owners(displayName)`)).json();
  const owner = f.owners?.[0]?.displayName;
  if (f.mimeType === FOLDER) return { id: f.id, name: f.name, owner };
  if (f.mimeType === 'application/json') {
    const m = (await (await get(`${API}/files/${id}?alt=media`)).json().catch(() => null)) as ShareManifest | null;
    if (m?.mochi === 'share') {
      manifests.set(id, m);
      return { id, name: m.name, owner };
    }
  }
  throw new Error('El link no es de algo compartido desde Mochi.');
}

// Todos los archivos de la carpeta compartida, con el camino de subcarpetas.
export async function sharedFiles(id: string, dirs: string[] = []): Promise<SharedEntry[]> {
  const m = manifests.get(id);
  if (m) return m.files.map((f) => ({ file: { id: f.id, name: f.name, mimeType: f.mimeType, size: f.size, modifiedTime: '' }, dirs: f.dirs }));
  const out: SharedEntry[] = [];
  let pageToken = '';
  do {
    const p = new URLSearchParams({
      q: `'${id}' in parents and trashed=false`,
      fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,size)',
      pageSize: '1000',
    });
    if (pageToken) p.set('pageToken', pageToken);
    const r: { files: DFile[]; nextPageToken?: string } = await (await get(`${API}/files?${p}`)).json();
    for (const f of r.files) {
      if (f.mimeType === FOLDER) out.push(...(await sharedFiles(f.id, [...dirs, f.name])));
      // Los documentos nativos de Google (Docs, Sheets) no se pueden descargar tal cual.
      else if (!f.mimeType.startsWith('application/vnd.google-apps.')) out.push({ file: f, dirs });
    }
    pageToken = r.nextPageToken ?? '';
  } while (pageToken);
  return out;
}

export async function sharedDownload(id: string) {
  return (await get(`${API}/files/${id}?alt=media`)).blob();
}

// WhatsApp ignora lo que va después del # y guarda la vista previa por link: con "?c=" cada link es distinto
// y siempre muestra el logo, en vez de una vista previa vieja de la página principal.
export const shareLink = (folderId: string) => `${location.origin}/?c=${folderId}#/importar/${folderId}`;
