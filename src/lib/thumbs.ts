// Vistas previas hechas en la compu: cuando Drive no da miniatura (o no se puede cargar porque
// pide estar logueado en Google en el navegador), se dibuja la primera página del PDF o se achica
// la imagen. Queda guardada, así la próxima vez aparece al instante y también sin internet.

import { kindOf } from './files';
import type { DFile } from './drive';
import { fileBlob } from './fileBlob';
import { getList, getOffline, putList } from './offline';

const WIDTH = 480;
// Para no bajar archivos enormes solo por la vista previa (salvo que ya estén guardados).
const MAX_BYTES = 30 * 1024 * 1024;

type Cached = { modifiedTime: string; blob: Blob };

export function canThumb(f: DFile) {
  const k = kindOf(f);
  return k === 'pdf' || (k === 'image' && !/\.(heic|svg)$/i.test(f.name));
}

const urls = new Map<string, Promise<string | null>>();

// Devuelve una URL para usar en <img>, o null si no se pudo.
export function localThumb(f: DFile): Promise<string | null> {
  const key = `${f.id}:${f.modifiedTime}`;
  let p = urls.get(key);
  if (!p) {
    p = make(f).catch(() => null);
    urls.set(key, p);
  }
  return p;
}

async function make(f: DFile): Promise<string | null> {
  const key = `thumb:${f.id}`;
  const saved = await getList<Cached>(key);
  if (saved && saved.modifiedTime === f.modifiedTime) return URL.createObjectURL(saved.blob);

  const blob = await queue(() => render(f));
  if (!blob) return null;
  await putList(key, { modifiedTime: f.modifiedTime, blob } satisfies Cached);
  return URL.createObjectURL(blob);
}

async function render(f: DFile): Promise<Blob | null> {
  const k = kindOf(f);
  const tooBig = Number(f.size) > MAX_BYTES && !(await getOffline(f.id));
  if (tooBig) return null;
  const src = await fileBlob(f);
  const canvas = k === 'image' ? await drawImage(src) : await drawPdf(src);
  return canvas ? new Promise((ok) => canvas.toBlob(ok, 'image/webp', 0.8)) : null;
}

async function drawPdf(blob: Blob) {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale: WIDTH / page.getViewport({ scale: 1 }).width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(Math.min(vp.height, vp.width * 1.5));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
    return canvas;
  } finally {
    task.destroy();
  }
}

async function drawImage(blob: Blob) {
  const img = await createImageBitmap(blob);
  const scale = Math.min(1, WIDTH / img.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  img.close();
  return canvas;
}

// De a dos por vez, para no trabar la app con una carpeta llena de PDFs.
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
