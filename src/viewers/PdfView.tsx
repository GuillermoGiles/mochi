import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import FindBar from './FindBar';
import { findAll, scrollToRect } from './find';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const ZOOMS = [0.75, 1, 1.25, 1.5, 2, 2.5, 3];

// Dibuja cada página recién cuando está por aparecer en pantalla.
// Abajo muestra en qué página estás y botones de zoom.
type Box = { l: number; t: number; w: number; h: number };
type PageText = { text: string; segs: { start: number; item: TextItem }[]; vw: number; vh: number };
type Match = { page: number; boxes: Box[] };

export default function PdfView({ blob, find, onCloseFind }: { blob: Blob; find?: boolean; onCloseFind?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const renderObs = useRef<IntersectionObserver | null>(null);
  const [error, setError] = useState('');
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const texts = useRef(new Map<number, PageText>());
  const findSeq = useRef(0);
  const [matches, setMatches] = useState<Match[]>([]);
  const [current, setCurrent] = useState(0);
  const [busy, setBusy] = useState(false);

  // Carga el documento y arma un lugar vacío por página.
  useEffect(() => {
    const container = ref.current!;
    let cancelled = false;
    let pageObs: IntersectionObserver | undefined;
    const task = (async () => pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }))();

    task
      .then(async (loading) => {
        const doc = await loading.promise;
        if (cancelled) return;
        docRef.current = doc;
        const vp = (await doc.getPage(1)).getViewport({ scale: 1 });
        const root = container.closest('[data-scroll]');
        renderObs.current = new IntersectionObserver(
          (entries) => {
            for (const e of entries) {
              if (!e.isIntersecting) continue;
              renderObs.current!.unobserve(e.target);
              renderPage(doc, e.target as HTMLDivElement).catch(() => {});
            }
          },
          { root, rootMargin: '1200px 0px' },
        );
        // Página actual: la que ocupa el centro de la pantalla.
        pageObs = new IntersectionObserver(
          (entries) => {
            for (const e of entries) if (e.isIntersecting) setPage(Number((e.target as HTMLElement).dataset.page));
          },
          { root, rootMargin: '-50% 0px -50% 0px' },
        );
        for (let i = 1; i <= doc.numPages; i++) {
          const el = document.createElement('div');
          el.className = 'pdf-page';
          el.dataset.page = String(i);
          el.style.aspectRatio = `${vp.width} / ${vp.height}`;
          container.appendChild(el);
          renderObs.current.observe(el);
          pageObs.observe(el);
        }
        setPages(doc.numPages);
      })
      .catch(() => !cancelled && setError('No se pudo abrir este PDF.'));

    return () => {
      cancelled = true;
      renderObs.current?.disconnect();
      pageObs?.disconnect();
      task.then((l) => l.destroy()).catch(() => {});
      container.replaceChildren();
      docRef.current = null;
      texts.current.clear();
    };
  }, [blob]);

  // Al cambiar el zoom se vuelven a dibujar las páginas con más resolución.
  useEffect(() => {
    const container = ref.current;
    if (!container || !renderObs.current) return;
    for (const el of container.children as HTMLCollectionOf<HTMLDivElement>) {
      el.querySelector('canvas')?.remove();
      renderObs.current.observe(el);
    }
  }, [zoom]);

  // Busca en todas las páginas. Si se escribe otra cosa mientras busca, la búsqueda vieja se descarta.
  async function onQuery(q: string) {
    const seq = ++findSeq.current;
    const doc = docRef.current;
    if (!doc || !q.trim()) {
      setMatches([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    const found: Match[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const t = await pageText(doc, n, texts.current).catch(() => null);
      if (seq !== findSeq.current) return;
      if (!t) continue;
      for (const [a, b] of findAll(t.text, q)) found.push({ page: n, boxes: boxesFor(t, a, b) });
    }
    setBusy(false);
    setMatches(found);
    // Arranca por la primera coincidencia desde la página que se está viendo.
    const i = found.findIndex((m) => m.page >= page);
    setCurrent(i === -1 ? 0 : i);
  }

  const step = (dir: 1 | -1) => matches.length && setCurrent((c) => (c + dir + matches.length) % matches.length);

  // Dibuja los resaltados arriba de cada página y lleva la pantalla a la coincidencia actual.
  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    for (const l of container.querySelectorAll('.pdf-hl')) l.remove();
    let target: HTMLElement | null = null;
    matches.forEach((m, i) => {
      const el = container.children[m.page - 1] as HTMLElement | undefined;
      if (!el) return;
      let layer = el.querySelector<HTMLElement>('.pdf-hl');
      if (!layer) {
        layer = document.createElement('div');
        layer.className = 'pdf-hl';
        el.appendChild(layer);
      }
      for (const b of m.boxes) {
        const box = document.createElement('i');
        Object.assign(box.style, { left: `${b.l}%`, top: `${b.t}%`, width: `${b.w}%`, height: `${b.h}%` });
        if (i === current) {
          box.className = 'on';
          target ??= box;
        }
        layer.appendChild(box);
      }
    });
    if (target) scrollToRect(container, (target as HTMLElement).getBoundingClientRect());
  }, [matches, current, zoom]);

  useEffect(() => {
    if (!find) {
      findSeq.current++;
      setMatches([]);
      setBusy(false);
    }
  }, [find]);

  const zi = ZOOMS.indexOf(zoom);

  return (
    <div className="px-2 sm:px-6 py-4 pb-24">
      {error && <p className="text-center text-muted py-10">{error}</p>}
      {find && pages > 0 && (
        <FindBar
          count={matches.length}
          current={current}
          busy={busy}
          onQuery={onQuery}
          onStep={step}
          onClose={() => onCloseFind?.()}
        />
      )}
      <div
        ref={ref}
        className="mx-auto flex flex-col gap-3"
        style={{ width: `calc(min(100%, 900px) * ${zoom})` }}
      />
      {pages > 0 && (
        <div className="fixed bottom-5 inset-x-0 z-10 flex justify-center pointer-events-none safe-bottom">
          <div className="pointer-events-auto flex items-center gap-1 bg-ink/90 text-bg rounded-full shadow-lg px-1.5 h-11 backdrop-blur">
            <button
              onClick={() => setZoom(ZOOMS[Math.max(0, zi - 1)])}
              disabled={zi <= 0}
              aria-label="Alejar"
              className="size-9 rounded-full grid place-items-center text-lg font-bold hover:bg-white/15 disabled:opacity-40"
            >
              −
            </button>
            <span className="text-sm font-semibold tabular-nums px-2 min-w-20 text-center">
              {page} / {pages}
            </span>
            <button
              onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, zi + 1)])}
              disabled={zi >= ZOOMS.length - 1}
              aria-label="Acercar"
              className="size-9 rounded-full grid place-items-center text-lg font-bold hover:bg-white/15 disabled:opacity-40"
            >
              +
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

async function renderPage(doc: PDFDocumentProxy, el: HTMLDivElement) {
  const page = await doc.getPage(Number(el.dataset.page));
  const base = page.getViewport({ scale: 1 });
  el.style.aspectRatio = `${base.width} / ${base.height}`;
  const scale = (el.clientWidth / base.width) * Math.min(devicePixelRatio || 1, 2) * 1.25;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = '100%';
  canvas.style.display = 'block';
  await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise;
  const hl = el.querySelector('.pdf-hl');
  el.replaceChildren(canvas, ...(hl ? [hl] : []));
}

// Texto de una página, guardando de qué pedazo del PDF sale cada letra.
async function pageText(doc: PDFDocumentProxy, n: number, cache: Map<number, PageText>) {
  const hit = cache.get(n);
  if (hit) return hit;
  const page = await doc.getPage(n);
  const vp = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  let text = '';
  const segs: PageText['segs'] = [];
  for (const it of content.items) {
    if (!('str' in it)) continue;
    segs.push({ start: text.length, item: it });
    text += it.str;
    if (it.hasEOL && !/\s$/.test(text)) text += ' ';
  }
  const t: PageText = { text, segs, vw: vp.width, vh: vp.height };
  // Las posiciones se pasan a la escala de la página para dibujar los resaltados.
  for (const s of segs) {
    const [, , c, d, e, f] = pdfjs.Util.transform(vp.transform, s.item.transform);
    const family = content.styles[s.item.fontName]?.fontFamily ?? 'sans-serif';
    (s as Seg).geo = { x: e, y: f, h: Math.hypot(c, d), w: s.item.width, font: `100px ${family}` };
  }
  cache.set(n, t);
  return t;
}

type Seg = PageText['segs'][number] & { geo?: { x: number; y: number; h: number; w: number; font: string } };

// Qué fracción del ancho de un pedazo de texto ocupan sus primeras letras.
// Se mide con una letra parecida, porque no todas las letras tienen el mismo ancho.
let measurer: CanvasRenderingContext2D | null = null;
function fraction(str: string, chars: number, font: string) {
  if (chars <= 0) return 0;
  if (chars >= str.length) return 1;
  measurer ??= document.createElement('canvas').getContext('2d');
  if (!measurer) return chars / str.length;
  measurer.font = font;
  const total = measurer.measureText(str).width;
  return total ? measurer.measureText(str.slice(0, chars)).width / total : chars / str.length;
}

// Rectángulos (en % de la página) que ocupa el texto entre las posiciones a y b.
function boxesFor(t: PageText, a: number, b: number): Box[] {
  const out: Box[] = [];
  for (const s of t.segs as Seg[]) {
    const len = s.item.str.length;
    const from = Math.max(a, s.start);
    const to = Math.min(b, s.start + len);
    if (to <= from || !s.geo || !len) continue;
    const { x, y, h, w, font } = s.geo;
    const l = x + w * fraction(s.item.str, from - s.start, font);
    const r = x + w * fraction(s.item.str, to - s.start, font);
    out.push({
      l: (l / t.vw) * 100,
      t: ((y - h * 0.95) / t.vh) * 100,
      w: ((r - l) / t.vw) * 100,
      h: ((h * 1.2) / t.vh) * 100,
    });
  }
  return out;
}
