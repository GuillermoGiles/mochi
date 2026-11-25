// Vistas previas hechas en la compu: cuando Drive no da miniatura (o no se puede cargar porque
// pide estar logueado en Google en el navegador), se arma acá según el tipo de archivo:
//  - PDF: la primera página.
//  - Presentaciones, Word y Excel: Drive las convierte a PDF y se dibuja la primera página.
//  - Imágenes (también SVG): achicadas.
//  - Videos: un cuadro del principio.
//  - Dibujos de Excalidraw: el dibujo.
//  - Texto y código: las primeras líneas.
// Queda guardada, así la próxima vez aparece al instante y también sin internet.
// Lo que no tiene nada para mostrar (un .zip, un audio) devuelve null y se muestra una tarjeta con el tipo.

import { extOf, kindOf } from './files';
import { DEMO, getToken, type DFile, type GoogleKind } from './drive';
import { convertedBlob, fileBlob } from './fileBlob';
import { getList, getOffline, putList } from './offline';

const WIDTH = 480;
// Para no bajar archivos enormes solo por la vista previa (salvo que ya estén guardados).
const MAX_BYTES = 50 * 1024 * 1024;

const TEXT_EXT = new Set(
  'txt md markdown csv tsv json log ini cfg conf yml yaml toml xml html htm css scss js jsx ts tsx mjs py java c h cpp hpp cc cs go rs kt kts swift php rb sql sh bat ps1 r m tex bib vb pas asm lua dart scala hs'.split(' '),
);
const CONVERT: Record<string, GoogleKind> = {
  ppt: 'presentation', pptx: 'presentation', odp: 'presentation', pps: 'presentation', ppsx: 'presentation',
  doc: 'document', docx: 'document', odt: 'document', rtf: 'document',
  xls: 'spreadsheet', xlsx: 'spreadsheet', ods: 'spreadsheet',
};

type How = 'pdf' | 'convert' | 'image' | 'video' | 'excalidraw' | 'text';

function howOf(f: DFile): How | null {
  const e = extOf(f.name);
  const k = kindOf(f);
  if (k === 'pdf') return 'pdf';
  if (k === 'excalidraw') return 'excalidraw';
  if (CONVERT[e]) return 'convert';
  if (k === 'image') return 'image';
  if (f.mimeType.startsWith('video/') || ['mp4', 'webm', 'mov', 'm4v', 'ogv'].includes(e)) return 'video';
  if (TEXT_EXT.has(e) || f.mimeType.startsWith('text/')) return 'text';
  return null;
}

export const canThumb = (f: DFile) => howOf(f) !== null || !!f.thumbnailLink;

type Cached = { modifiedTime: string; blob: Blob | null };
const urls = new Map<string, Promise<string | null>>();

// Devuelve una URL para usar en <img>, o null si el archivo no tiene nada para mostrar.
export function localThumb(f: DFile): Promise<string | null> {
  const key = `${f.id}:${f.modifiedTime}`;
  let p = urls.get(key);
  if (!p) {
    p = make(f).catch(() => {
      urls.delete(key); // Si falló por la conexión, se reintenta la próxima vez que se vea.
      return null;
    });
    urls.set(key, p);
  }
  return p;
}

async function make(f: DFile): Promise<string | null> {
  const key = `thumb:${f.id}`;
  const saved = await getList<Cached>(key);
  if (saved && saved.modifiedTime === f.modifiedTime) return saved.blob && URL.createObjectURL(saved.blob);

  const blob = await queue(async () => (await driveThumb(f)) ?? (await render(f)));
  if (blob !== undefined) await putList(key, { modifiedTime: f.modifiedTime, blob } satisfies Cached);
  return blob ? URL.createObjectURL(blob) : null;
}

// La miniatura de Drive pedida con el permiso de la app (el <img> directo falla si el navegador
// no tiene la sesión de Google abierta). Sirve para los archivos grandes sin bajarlos enteros.
async function driveThumb(f: DFile): Promise<Blob | null> {
  if (!f.thumbnailLink || DEMO) return null;
  try {
    const r = await fetch(f.thumbnailLink.replace(/=s\d+$/, '=s480'), {
      headers: { Authorization: `Bearer ${await getToken()}` },
      referrerPolicy: 'no-referrer',
    });
    const b = await r.blob();
    return r.ok && b.type.startsWith('image/') ? b : null;
  } catch {
    return null;
  }
}

// null: no hay nada para mostrar. undefined: ahora no se puede (archivo muy grande); no se guarda.
async function render(f: DFile): Promise<Blob | null | undefined> {
  const how = howOf(f);
  if (!how) return null;
  const e = extOf(f.name);
  if (how === 'convert') {
    // Si Drive no lo puede convertir (archivo dañado o con contraseña) no hay vista previa.
    const pdf = await convertedBlob(f, CONVERT[e]).catch((err) => {
      if (!navigator.onLine) throw err;
      return null;
    });
    return pdf ? toBlob(await drawPdf(pdf)) : null;
  }
  if (Number(f.size) > MAX_BYTES && !(await getOffline(f.id))) return undefined;
  const src = await fileBlob(f);
  try {
    if (how === 'pdf') return await toBlob(await drawPdf(src));
    if (how === 'image') return await toBlob(await drawImage(src));
    if (how === 'video') return await toBlob(await drawVideo(src));
    if (how === 'excalidraw') return await toBlob(drawExcalidraw(JSON.parse(await src.text())));
    return await toBlob(drawText(await src.slice(0, 8000).text(), e));
  } catch {
    return null; // El archivo no se pudo leer (dañado, o un formato que el navegador no entiende).
  }
}

const toBlob = (c: HTMLCanvasElement | null) =>
  c ? new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/webp', 0.8)) : Promise.resolve(null);

function page(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

async function drawPdf(blob: Blob) {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
  try {
    const doc = await task.promise;
    const pg = await doc.getPage(1);
    const vp = pg.getViewport({ scale: WIDTH / pg.getViewport({ scale: 1 }).width });
    const { canvas, ctx } = page(vp.width, Math.min(vp.height, vp.width * 1.5));
    await pg.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
    return canvas;
  } finally {
    task.destroy();
  }
}

async function drawImage(blob: Blob) {
  // createImageBitmap no abre los SVG; con un <img> sí.
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((ok, err) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = err;
      i.src = url;
    });
    const w = img.naturalWidth || WIDTH;
    const h = img.naturalHeight || (WIDTH * 3) / 4;
    const scale = Math.min(1, WIDTH / w);
    const { canvas, ctx } = page(w * scale, h * scale);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function drawVideo(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const v = document.createElement('video');
  v.muted = true;
  v.preload = 'auto';
  v.src = url;
  try {
    await new Promise((ok, err) => {
      v.onloadeddata = ok;
      v.onerror = err;
    });
    // Un poco después del principio, que suele ser negro.
    const seeked = new Promise((ok) => (v.onseeked = ok));
    v.currentTime = Math.min(1, (v.duration || 0) / 3);
    await seeked;
    const { canvas, ctx } = page(WIDTH, (v.videoHeight * WIDTH) / v.videoWidth);
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    v.removeAttribute('src');
    v.load();
    URL.revokeObjectURL(url);
  }
}

// Las primeras líneas, como una hoja impresa.
function drawText(text: string, ext: string) {
  const { canvas, ctx } = page(WIDTH, WIDTH * 0.75);
  const mono = !['txt', 'md', 'markdown'].includes(ext);
  const size = 14;
  ctx.font = `${size}px ${mono ? 'ui-monospace, Menlo, Consolas, monospace' : 'Inter, system-ui, sans-serif'}`;
  ctx.fillStyle = '#333';
  ctx.textBaseline = 'top';
  const pad = 22;
  const max = WIDTH - pad * 2;
  let y = pad;
  for (const raw of text.replace(/\r/g, '').replace(/\t/g, '  ').split('\n')) {
    // Las líneas largas siguen abajo.
    let line = raw;
    do {
      let n = line.length;
      while (n > 1 && ctx.measureText(line.slice(0, n)).width > max) n--;
      // Corta en el último espacio para no partir palabras.
      const sp = n < line.length ? line.lastIndexOf(' ', n) : -1;
      if (sp > 0) n = sp + 1;
      ctx.fillText(line.slice(0, n).trimEnd(), pad, y);
      line = line.slice(n);
      y += size * 1.45;
    } while (line && y < canvas.height);
    if (y >= canvas.height) break;
  }
  return canvas;
}

type ExEl = {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  strokeColor?: string;
  backgroundColor?: string;
  strokeWidth?: number;
  isDeleted?: boolean;
  points?: [number, number][];
  text?: string;
  fontSize?: number;
};

// Versión simple del dibujo: formas, flechas, trazos a mano y textos.
function drawExcalidraw(data: { elements?: ExEl[]; appState?: { viewBackgroundColor?: string } }) {
  const els = (data.elements ?? []).filter((e) => !e.isDeleted);
  if (!els.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const e of els) {
    const pts = e.points?.length
      ? e.points.map(([px, py]) => [e.x + px, e.y + py])
      : [[e.x, e.y], [e.x + e.width, e.y + e.height]];
    for (const [px, py] of pts) {
      x0 = Math.min(x0, px);
      y0 = Math.min(y0, py);
      x1 = Math.max(x1, px);
      y1 = Math.max(y1, py);
    }
  }
  const pad = 20;
  const H = WIDTH * 0.75;
  const scale = Math.min((WIDTH - pad * 2) / Math.max(x1 - x0, 1), (H - pad * 2) / Math.max(y1 - y0, 1), 2);
  const { canvas, ctx } = page(WIDTH, H);
  const bg = data.appState?.viewBackgroundColor;
  if (bg && bg !== 'transparent') {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WIDTH, H);
  }
  const ox = (WIDTH - (x1 - x0) * scale) / 2 - x0 * scale;
  const oy = (H - (y1 - y0) * scale) / 2 - y0 * scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const e of els) {
    ctx.save();
    // Cada elemento se dibuja desde su esquina, girado sobre su centro.
    ctx.translate(ox + (e.x + e.width / 2) * scale, oy + (e.y + e.height / 2) * scale);
    ctx.rotate(e.angle ?? 0);
    ctx.scale(scale, scale);
    ctx.translate(-e.width / 2, -e.height / 2);
    ctx.strokeStyle = e.strokeColor ?? '#1e1e1e';
    ctx.lineWidth = e.strokeWidth ?? 1;
    const fill = e.backgroundColor && e.backgroundColor !== 'transparent' ? e.backgroundColor : null;
    ctx.beginPath();
    if (e.type === 'rectangle') ctx.rect(0, 0, e.width, e.height);
    else if (e.type === 'ellipse')
      ctx.ellipse(e.width / 2, e.height / 2, Math.abs(e.width / 2), Math.abs(e.height / 2), 0, 0, Math.PI * 2);
    else if (e.type === 'diamond') {
      ctx.moveTo(e.width / 2, 0);
      ctx.lineTo(e.width, e.height / 2);
      ctx.lineTo(e.width / 2, e.height);
      ctx.lineTo(0, e.height / 2);
      ctx.closePath();
    } else if (e.points?.length) {
      // Líneas, flechas y trazos a mano: los puntos son relativos a la esquina del elemento.
      e.points.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    } else if (e.type === 'text' && e.text) {
      const fs = e.fontSize ?? 20;
      ctx.fillStyle = e.strokeColor ?? '#1e1e1e';
      ctx.font = `${fs}px Virgil, 'Comic Sans MS', sans-serif`;
      ctx.textBaseline = 'top';
      e.text.split('\n').forEach((l, i) => ctx.fillText(l, 0, i * fs * 1.25));
    }
    if (e.type !== 'text') {
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  return canvas;
}

// De a dos por vez, para no trabar la app con una carpeta llena de archivos.
let running = 0;
const waiting: (() => void)[] = [];
async function queue<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= 2) await new Promise<void>((ok) => waiting.push(ok));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}
