export type Kind = 'pdf' | 'word' | 'excel' | 'image' | 'excalidraw' | 'slides' | 'other';

export const KIND_STYLE: Record<Kind, { label: string; color: string }> = {
  pdf: { label: 'PDF', color: '#e03131' },
  word: { label: 'DOC', color: '#1c7ed6' },
  excel: { label: 'XLS', color: '#2f9e44' },
  image: { label: 'IMG', color: '#ae3ec9' },
  excalidraw: { label: 'DIB', color: '#6741d9' },
  slides: { label: 'PPT', color: '#e8590c' },
  other: { label: 'ARCH', color: '#868e96' },
};

export function extOf(name: string) {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

export function baseName(name: string) {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

export function kindOf(f: { name: string; mimeType: string }): Kind {
  const e = extOf(f.name);
  if (e === 'excalidraw') return 'excalidraw';
  if (e === 'pdf' || f.mimeType === 'application/pdf') return 'pdf';
  if (['doc', 'docx', 'odt', 'rtf'].includes(e)) return 'word';
  if (['xls', 'xlsx', 'ods', 'csv'].includes(e)) return 'excel';
  if (['ppt', 'pptx', 'odp', 'key'].includes(e)) return 'slides';
  if (f.mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'svg', 'bmp'].includes(e))
    return 'image';
  return 'other';
}

export function canPreview(f: { name: string; mimeType: string }) {
  const k = kindOf(f);
  const e = extOf(f.name);
  if (k === 'word') return e === 'docx';
  if (k === 'image') return true;
  // Drive no sabe convertir las de Keynote.
  if (k === 'slides') return e !== 'key';
  return k === 'pdf' || k === 'excel';
}

export function fmtSize(size?: string) {
  if (!size) return '';
  const b = Number(size);
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

export function fmtDate(iso: string) {
  const d = new Date(iso);
  const days = Math.floor((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  return d.toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// Ordena como una persona: "C2" antes que "C10".
export const naturalCompare = (a: string, b: string) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });

const SEP = /^[\s\-–—_.:|·]+/;
const CODE = /^((?:c|clase|u|unidad|tp|t\.p\.|cap(?:itulo)?|tema|guia|gu[ií]a|ej(?:ercicio)?|parcial|semana)\s*\.?\s*\d+[a-z]?)\s*[-–—_.:|·]\s*(.+)$/i;

// Un número o una fecha suelta: "10", "27-10", "27/10/2026".
const DATE_LIKE = /^\d{1,4}([-/._ ]\d{1,4})*$/;

// Saca lo que se repite al principio de todos los nombres ("UTN DS26 - ")
// y separa el número de clase ("C21") del título.
export function cleanNames(files: { id: string; name: string }[]) {
  const bases = files.map((f) => baseName(f.name));
  let prefix = '';
  if (bases.length >= 2) {
    prefix = bases.reduce((p, b) => {
      let i = 0;
      while (i < p.length && i < b.length && p[i].toLowerCase() === b[i].toLowerCase()) i++;
      return p.slice(0, i);
    });
    // Cortar en el último separador para no partir una palabra.
    const cut = Math.max(...[' ', '-', '–', '_', '.', ':', '|', '·'].map((s) => prefix.lastIndexOf(s)));
    prefix = cut >= 2 ? prefix.slice(0, cut + 1) : '';
  }
  const out = new Map<string, { code?: string; title: string }>();
  files.forEach((f, i) => {
    let rest = bases[i].slice(prefix.length).replace(SEP, '') || bases[i];
    // Si lo que queda es solo un número o una fecha ("10", "27-10"), el nombre no se corta.
    if (DATE_LIKE.test(rest)) rest = bases[i];
    const m = rest.match(CODE);
    out.set(f.id, m && !DATE_LIKE.test(m[2].trim()) ? { code: m[1].replace(/\s+/g, ' ').toUpperCase(), title: m[2] } : { title: rest });
  });
  return out;
}

export async function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
