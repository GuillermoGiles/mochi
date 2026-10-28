// Ventanita de la extensión: guarda la pizarra de Excalidraw abierta (o cualquier archivo) en una materia de Mochi.
// Se conecta con el mismo inicio de sesión que los conectores de IA y sube directo a tu Google Drive.

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const chrome: any;

const MOCHI = 'https://mochi-facu.vercel.app';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER = 'application/vnd.google-apps.folder';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const show = (id: string, on = true) => ($(id).hidden = !on);

type User = { email: string; name: string };
type Materia = { id: string; name: string; year: string; order: number };
type FolderInfo = { id: string; name: string; path: string; materiaId: string };
type Scene = { elements: any[]; appState: any; files: Record<string, any>; name?: string };

const store = {
  get: (keys: string[]) => chrome.storage.local.get(keys) as Promise<Record<string, any>>,
  set: (v: Record<string, unknown>) => chrome.storage.local.set(v) as Promise<void>,
  clear: () => chrome.storage.local.clear() as Promise<void>,
};

// ---------------------------------------------------------------------------
// Conectar la cuenta (OAuth con PKCE contra Mochi; Mochi te manda a Google).

const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

async function connect() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(12)));
  const redirect = chrome.identity.getRedirectURL();
  const url =
    `${MOCHI}/api/authorize?` +
    new URLSearchParams({
      response_type: 'code',
      client_id: 'mochi-extension',
      redirect_uri: redirect,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
    });
  const back: string = await chrome.identity.launchWebAuthFlow({ url, interactive: true });
  const p = new URL(back).searchParams;
  if (p.get('error')) throw new Error(p.get('error_description') ?? 'No se pudo conectar.');
  if (p.get('state') !== state) throw new Error('La conexión no coincide. Probá de nuevo.');
  const r = await fetch(`${MOCHI}/api/oauth-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: p.get('code') ?? '', code_verifier: verifier, redirect_uri: redirect }),
  });
  const j = await r.json();
  if (!r.ok || !j.refresh_token) throw new Error(j.error_description ?? 'No se pudo conectar.');
  await store.set({ rt: j.refresh_token });
}

// Acceso a Drive de corta duración (se pide a Mochi con el permiso guardado).
let access: { token: string; until: number; user: User } | null = null;
async function drive(): Promise<{ token: string; user: User }> {
  if (access && access.until > Date.now()) return access;
  const { rt } = await store.get(['rt']);
  if (!rt) throw new Error('sin_sesion');
  const r = await fetch(`${MOCHI}/api/ext-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: rt }),
  });
  if (r.status === 401) {
    await store.clear();
    throw new Error('sin_sesion');
  }
  if (!r.ok) throw new Error('Mochi no respondió. Probá de nuevo en un rato.');
  const j = await r.json();
  access = { token: j.access_token, until: Date.now() + (j.expires_in - 120) * 1000, user: j.user };
  return access;
}

async function api(url: string, init: RequestInit = {}) {
  const { token } = await drive();
  const r = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Google Drive respondió ${r.status}`);
  return r;
}

// ---------------------------------------------------------------------------
// Tus materias y carpetas, igual que en Mochi.

async function loadTree() {
  const all: any[] = [];
  let pageToken = '';
  do {
    const p = new URLSearchParams({
      q: `mimeType='${FOLDER}' and trashed=false`,
      fields: 'nextPageToken,files(id,name,parents,appProperties)',
      pageSize: '1000',
    });
    if (pageToken) p.set('pageToken', pageToken);
    const j = await (await api(`${DRIVE}/files?${p}`)).json();
    all.push(...j.files);
    pageToken = j.nextPageToken ?? '';
  } while (pageToken);

  const byId = new Map(all.map((f) => [f.id, f]));
  const materias: Materia[] = [];
  for (const f of all) {
    if (f.appProperties?.facu !== 'materia') continue;
    const y = byId.get(f.parents?.[0]);
    materias.push({ id: f.id, name: f.name, year: y?.name ?? '', order: Number(y?.appProperties?.order ?? 99) });
  }
  const mIds = new Set(materias.map((m) => m.id));
  const folders: FolderInfo[] = [];
  const pathOf = (f: any, seen = new Set<string>()): { path: string; materiaId: string } | null => {
    const parent = f.parents?.[0];
    if (!parent || seen.has(f.id)) return null;
    seen.add(f.id);
    if (mIds.has(parent)) return { path: f.name, materiaId: parent };
    const pf = byId.get(parent);
    if (!pf || ['root', 'year', 'materia'].includes(pf.appProperties?.facu)) return null;
    const up = pathOf(pf, seen);
    return up ? { path: `${up.path} › ${f.name}`, materiaId: up.materiaId } : null;
  };
  for (const f of all) {
    if (['root', 'year', 'materia', 'datos'].includes(f.appProperties?.facu)) continue;
    const r = pathOf(f);
    if (r) folders.push({ id: f.id, name: f.name, ...r });
  }
  materias.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'es'));
  folders.sort((a, b) => a.path.localeCompare(b.path, 'es', { numeric: true }));
  return { materias, folders };
}

// ---------------------------------------------------------------------------
// Leer la pizarra de la pestaña de excalidraw.com (se ejecuta adentro de la página).

function readScene() {
  return new Promise((resolve) => {
    const elements = JSON.parse(localStorage.getItem('excalidraw') || '[]').filter((e: any) => !e.isDeleted);
    const state = JSON.parse(localStorage.getItem('excalidraw-state') || '{}');
    const want = new Set(elements.filter((e: any) => e.type === 'image' && e.fileId).map((e: any) => e.fileId));
    const done = (files: Record<string, unknown>) =>
      resolve({
        elements,
        appState: { viewBackgroundColor: state.viewBackgroundColor ?? '#ffffff', gridSize: state.gridSize ?? null, theme: state.theme },
        files,
        name: state.name,
      });
    if (!want.size) return done({});
    // Las imágenes pegadas en la pizarra están guardadas aparte, en la base de datos del navegador.
    const req = indexedDB.open('files-db');
    req.onerror = () => done({});
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('files-store')) return done({});
      const files: Record<string, unknown> = {};
      const cur = db.transaction('files-store', 'readonly').objectStore('files-store').openCursor();
      cur.onerror = () => done(files);
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c) return done(files);
        if (want.has(c.key)) files[String(c.key)] = c.value;
        c.continue();
      };
    };
  });
}

async function sceneFromTab(): Promise<Scene | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !/^https:\/\/(www\.)?excalidraw\.com\//.test(tab.url)) return null;
  const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readScene });
  return (res?.result as Scene) ?? null;
}

const toExcalidraw = (s: Scene) =>
  JSON.stringify({
    type: 'excalidraw',
    version: 2,
    source: 'https://excalidraw.com',
    elements: s.elements,
    appState: { gridSize: s.appState.gridSize, viewBackgroundColor: s.appState.viewBackgroundColor },
    files: s.files,
  });

async function toPng(s: Scene): Promise<Blob> {
  // La librería de Excalidraw es grande: se carga recién cuando hace falta.
  const { exportScene } = await import('@excalidraw/utils');
  return exportScene({
    type: 'png',
    data: { elements: s.elements, files: s.files, appState: { viewBackgroundColor: s.appState.viewBackgroundColor } },
    // embedScene: la pizarra queda adentro del PNG, así se puede volver a abrir y editar en Excalidraw.
    config: { theme: s.appState.theme === 'dark' ? 'dark' : 'light', padding: 24, scale: 2, embedScene: true },
  } as any) as Promise<Blob>;
}

// ---------------------------------------------------------------------------
// Subir a Drive (subida reanudable: sirve para archivos grandes).

async function upload(blob: Blob, name: string, mime: string, parent: string) {
  const { token } = await drive();
  const init = await fetch(`${UPLOAD}/files?uploadType=resumable&fields=id,name`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mime,
      'X-Upload-Content-Length': String(blob.size),
    },
    body: JSON.stringify({ name, parents: [parent] }),
  });
  const location = init.headers.get('Location');
  if (!init.ok || !location) throw new Error(`No se pudo empezar la subida de ${name}.`);
  const r = await fetch(location, { method: 'PUT', headers: { 'Content-Type': mime }, body: blob });
  if (!r.ok) throw new Error(`No se pudo subir ${name}.`);
  return r.json();
}

// ---------------------------------------------------------------------------
// Pantalla.

const status = (text: string, kind: '' | 'ok' | 'err' = '') => {
  const el = $('status');
  el.textContent = text;
  el.className = `status ${kind}`;
};

let tree: Awaited<ReturnType<typeof loadTree>> = { materias: [], folders: [] };
let scene: Scene | null = null;

function fillFolders(materiaId: string, keep?: string) {
  const sel = $<HTMLSelectElement>('folder');
  sel.innerHTML = '';
  sel.add(new Option('(Carpeta principal de la materia)', ''));
  for (const f of tree.folders.filter((x) => x.materiaId === materiaId)) sel.add(new Option(f.path, f.id));
  sel.value = keep && [...sel.options].some((o) => o.value === keep) ? keep : '';
}

function fillMaterias(keep?: string) {
  const sel = $<HTMLSelectElement>('materia');
  sel.innerHTML = '';
  const years = [...new Set(tree.materias.map((m) => m.year))];
  for (const y of years) {
    const g = document.createElement('optgroup');
    g.label = y;
    for (const m of tree.materias.filter((x) => x.year === y)) g.append(new Option(m.name, m.id));
    sel.append(g);
  }
  if (keep && tree.materias.some((m) => m.id === keep)) sel.value = keep;
}

function updateLink() {
  const m = $<HTMLSelectElement>('materia').value;
  const f = $<HTMLSelectElement>('folder').value;
  $<HTMLAnchorElement>('open').href = m ? `${MOCHI}/#/m/${m}${f ? `/${f}` : ''}` : MOCHI;
}

const destination = () => {
  const m = $<HTMLSelectElement>('materia').value;
  const f = $<HTMLSelectElement>('folder').value;
  if (!m) throw new Error('Elegí una materia.');
  const where = f ? tree.folders.find((x) => x.id === f)!.path : tree.materias.find((x) => x.id === m)!.name;
  return { parent: f || m, where };
};

const remember = () => store.set({ materia: $<HTMLSelectElement>('materia').value, folder: $<HTMLSelectElement>('folder').value });

function today() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function saveScene() {
  if (!scene) return;
  const btn = $<HTMLButtonElement>('save');
  btn.disabled = true;
  try {
    const { parent, where } = destination();
    const png = (document.querySelector('input[name="fmt"]:checked') as HTMLInputElement).value === 'png';
    let name = $<HTMLInputElement>('name').value.trim() || `Excalidraw ${today()}`;
    name = name.replace(/\.(excalidraw|png)$/i, '') + (png ? '.png' : '.excalidraw');
    status(png ? 'Generando la imagen…' : 'Guardando…');
    const blob = png ? await toPng(scene) : new Blob([toExcalidraw(scene)], { type: 'application/json' });
    status('Subiendo a Mochi…');
    await upload(blob, name, png ? 'image/png' : 'application/json', parent);
    await remember();
    status(`Guardado en ${where}`, 'ok');
  } catch (e) {
    status(e instanceof Error ? e.message : 'Algo salió mal', 'err');
  } finally {
    btn.disabled = false;
  }
}

async function uploadFiles(list: FileList | File[]) {
  const files = [...list];
  if (!files.length) return;
  try {
    const { parent, where } = destination();
    for (let i = 0; i < files.length; i++) {
      status(files.length > 1 ? `Subiendo ${i + 1} de ${files.length}…` : `Subiendo ${files[i].name}…`);
      await upload(files[i], files[i].name, files[i].type || 'application/octet-stream', parent);
    }
    await remember();
    status(files.length === 1 ? `Guardado en ${where}` : `${files.length} archivos guardados en ${where}`, 'ok');
  } catch (e) {
    status(e instanceof Error ? e.message : 'Algo salió mal', 'err');
  }
}

async function start() {
  show('loading');
  show('login', false);
  show('main', false);
  const { rt, materia, folder } = await store.get(['rt', 'materia', 'folder']);
  if (!rt) {
    show('loading', false);
    show('login');
    return;
  }
  try {
    const [{ user }, t, s] = await Promise.all([drive(), loadTree(), sceneFromTab().catch(() => null)]);
    tree = t;
    scene = s;
    $('who').textContent = `${user.name} (${user.email})`;
    fillMaterias(materia);
    fillFolders($<HTMLSelectElement>('materia').value, folder);
    updateLink();
    const hasScene = !!scene && scene.elements.length > 0;
    show('scene', hasScene);
    show('scene-fields', hasScene);
    show('save', hasScene);
    show('no-scene', !hasScene);
    if (hasScene) {
      const n = scene!.elements.length;
      $('scene-info').textContent = `Diagrama detectado en esta pestaña · ${n} ${n === 1 ? 'elemento' : 'elementos'}`;
      $<HTMLInputElement>('name').value = scene!.name?.trim() || `Excalidraw ${today()}`;
    }
    if (!tree.materias.length) status('Todavía no tenés materias en Mochi. Creá una en la app.', 'err');
    show('gear');
    show('loading', false);
    show('main');
  } catch (e) {
    show('loading', false);
    if (e instanceof Error && e.message === 'sin_sesion') return show('login');
    show('main');
    status(e instanceof Error ? e.message : 'Algo salió mal', 'err');
  }
}

$('connect').addEventListener('click', async () => {
  const b = $<HTMLButtonElement>('connect');
  b.disabled = true;
  b.textContent = 'Conectando…';
  try {
    await connect();
    await start();
  } catch (e) {
    b.textContent = 'Conectar con Mochi';
    const msg = e instanceof Error ? e.message : '';
    // Cerrar la ventana de Google no es un error.
    if (!/canceled|cancelled|did not approve/i.test(msg)) alert(msg || 'No se pudo conectar.');
  } finally {
    b.disabled = false;
  }
});
$('materia').addEventListener('change', () => {
  fillFolders($<HTMLSelectElement>('materia').value);
  updateLink();
});
$('folder').addEventListener('change', updateLink);
$('save').addEventListener('click', saveScene);
$('gear').addEventListener('click', () => ($('menu').hidden = !$('menu').hidden));
$('logout').addEventListener('click', async () => {
  await store.clear();
  access = null;
  $('menu').hidden = true;
  show('gear', false);
  start();
});

const drop = $('drop');
drop.addEventListener('click', () => $<HTMLInputElement>('file').click());
$<HTMLInputElement>('file').addEventListener('change', (e) => uploadFiles((e.target as HTMLInputElement).files ?? []));
drop.addEventListener('dragover', (e) => {
  e.preventDefault();
  drop.classList.add('over');
});
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  uploadFiles(e.dataTransfer?.files ?? []);
});

start();
