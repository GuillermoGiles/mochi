// Datos falsos para revisar la interfaz en desarrollo: http://localhost:5173/?demo
// No se incluye en la versión publicada.
import type { DFile } from './drive';

const F = 'application/vnd.google-apps.folder';
const now = new Date().toISOString();
const folder = (id: string, name: string, parent: string, appProperties: Record<string, string>): DFile => ({
  id, name, mimeType: F, modifiedTime: now, parents: [parent], appProperties,
});

const temas = ['Introducción', 'Requerimientos', 'UML', 'Patrones de Diseño', 'Arquitectura', 'Bases de Datos', 'APIs REST',
  'Persistencia de Datos (2)', 'Relaciones y Validaciones', 'Seguridad en Aplicaciones Web', 'Integración Front - Back', 'Introducción al Testing'];

export const demoFolders: DFile[] = [
  folder('root', 'Facultad', 'x', { facu: 'root' }),
  folder('y3', '3er año', 'root', { facu: 'year', order: '3' }),
  folder('m1', 'Desarrollo de Software', 'y3', { facu: 'materia', color: '#4c6ef5', estado: 'cursando' }),
  folder('y4', '4to año', 'root', { facu: 'year', order: '4' }),
  folder('m4', 'Inteligencia Artificial', 'y4', { facu: 'materia', color: '#7950f2', estado: 'cursando' }),
  folder('m5', 'Redes de Datos', 'y4', { facu: 'materia', color: '#15aabf', estado: 'final' }),
  folder('m2', 'Análisis Matemático II', 'y3', { facu: 'materia', color: '#12b886', estado: 'aprobada', nota: '8.5' }),
  folder('m3', 'Sistemas Operativos', 'y3', { facu: 'materia', color: '#f59f00' }),
  folder('c-teo', 'Presentaciones dadas en clase', 'm1', { facu: 'cat', cat: 'teoria' }),
  folder('c-par', 'Promoción', 'm1', { facu: 'cat', cat: 'parciales' }),
  folder('c-bib', 'Bibliografía', 'm1', {}),
  folder('c-tp', 'Trabajos prácticos', 'm1', { facu: 'folder' }),
  folder('c-tp1', 'TP1', 'c-tp', { facu: 'folder' }),
  folder('c-tp2', 'TP2', 'c-tp', { facu: 'folder' }),
  folder('c-ent', 'Entrega', 'm1', { facu: 'folder' }),
];

export const demoFiles: DFile[] = [
  ...temas.map((t, i) => ({
    id: `f${i}`, name: `UTN DS26 - C${i + 1} - ${t}.pdf`, mimeType: 'application/pdf',
    modifiedTime: new Date(Date.now() - i * 86_400_000).toISOString(), size: '450000', parents: ['c-teo'],
  })),
  { id: 'p1', name: 'Parcial 1 2025.pdf', mimeType: 'application/pdf', modifiedTime: now, parents: ['c-par'] },
  { id: 'p2', name: 'Final resuelto.docx', mimeType: 'application/octet-stream', modifiedTime: now, parents: ['c-par'] },
  { id: 'p3', name: 'Foto pizarrón.jpg', mimeType: 'image/jpeg', modifiedTime: now, parents: ['c-par'] },
  { id: 't1', name: 'Consigna TP1.pdf', mimeType: 'application/pdf', modifiedTime: now, parents: ['c-tp1'] },
  { id: 't2', name: 'Modelo ER.excalidraw', mimeType: 'application/json', modifiedTime: now, parents: ['c-tp1'] },
  { id: 't3', name: 'Consigna TP2.pdf', mimeType: 'application/pdf', modifiedTime: now, parents: ['c-tp2'] },
  { id: 't4', name: 'Rúbrica de TPs.xlsx', mimeType: 'application/octet-stream', modifiedTime: now, parents: ['c-tp'] },
  { id: 'ppt1', name: 'Presentación final (Grupo 4).pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', modifiedTime: now, parents: ['c-ent'] },
  { id: 's1', name: 'Programa de la materia.pdf', mimeType: 'application/pdf', modifiedTime: now, parents: ['m1'] },
];

export function demoList(q: string): DFile[] {
  const alive = (l: DFile[]) => l.filter((f) => !demoTrashed(f));
  const ids = [...q.matchAll(/'([^']+)' in parents/g)].map((m) => m[1]);
  const inIds = (l: DFile[]) => (ids.length ? l.filter((f) => f.parents!.some((p) => ids.includes(p))) : l);
  if (q.includes(`mimeType='${F}'`)) return alive(demoFolders);
  // Sin filtro de tipo (por ejemplo, "qué hay adentro de esta carpeta"): carpetas y archivos.
  if (!q.includes('mimeType')) return alive(inIds([...demoFolders, ...demoFiles]));
  return alive(inIds(demoFiles));
}

// Un PDF chiquito de 3 páginas armado a mano, para probar el lector sin cuenta.
export async function demoBlob(id: string): Promise<Blob> {
  const f = demoFiles.find((x) => x.id === id);
  // Las imágenes de prueba son una foto dibujada en el momento (como una foto real del celu).
  if (f && /.(jpe?g|png)$/i.test(f.name)) {
    const c = new OffscreenCanvas(1600, 1200);
    const g = c.getContext('2d')!;
    g.fillStyle = '#2f4f3a';
    g.fillRect(0, 0, 1600, 1200);
    g.fillStyle = '#f5f5f0';
    g.font = 'bold 90px sans-serif';
    g.fillText('Pizarrón de prueba', 120, 300);
    g.font = '60px sans-serif';
    g.fillText('SELECT * FROM alumnos;', 120, 500);
    return c.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  }
  const title = (f?.name ?? 'Demo').replace(/[()\\]/g, '').normalize('NFD').replace(/[^\x20-\x7e]/g, '');
  const objs: string[] = ['<< /Type /Catalog /Pages 2 0 R >>', ''];
  const kids: string[] = [];
  for (let i = 0; i < 3; i++) {
    const pageNum = 3 + i * 2;
    kids.push(`${pageNum} 0 R`);
    const text = `BT /F1 28 Tf 60 700 Td (${title}) Tj 0 -50 Td /F1 20 Tf (Pagina ${i + 1} de 3) Tj ET`;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${pageNum + 1} 0 R /Resources << /Font << /F1 9 0 R >> >> >>`);
    objs.push(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`);
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count 3 >>`;
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([out], { type: 'application/pdf' });
}

// Cambios en modo demo (mover, renombrar, borrar, copiar, crear carpetas), solo en memoria.
type Body = { name?: string; trashed?: boolean; appProperties?: Record<string, string | null> };
const trashed = new Set<string>();
const all = () => [...demoFolders, ...demoFiles];

export function demoUpdate(id: string, body: Body, params: Record<string, string> = {}): DFile {
  const f = all().find((x) => x.id === id);
  if (!f) throw new Error('No existe');
  if (body.name) f.name = body.name;
  if (body.trashed) trashed.add(id);
  if (body.trashed === false) trashed.delete(id);
  if (body.appProperties)
    for (const [k, v] of Object.entries(body.appProperties)) {
      f.appProperties ??= {};
      if (v === null) delete f.appProperties[k];
      else f.appProperties[k] = v;
    }
  if (params.addParents) f.parents = [...(f.parents ?? []).filter((p) => !params.removeParents?.split(',').includes(p)), params.addParents];
  f.modifiedTime = new Date().toISOString();
  return f;
}

export function demoCreateFolder(name: string, parent: string | undefined, appProperties: Record<string, string>): DFile {
  const f = folder(`d${Math.random().toString(36).slice(2, 8)}`, name, parent ?? 'root', appProperties);
  demoFolders.push(f);
  return f;
}

export function demoCopy(id: string, name: string, parent: string) {
  const src = demoFiles.find((x) => x.id === id)!;
  const f = { ...src, id: `c${Math.random().toString(36).slice(2, 8)}`, name, parents: [parent], modifiedTime: new Date().toISOString() };
  demoFiles.push(f);
  // El PDF de prueba se arma con el nombre del original.
  return f;
}

export const demoTrashed = (f: DFile) => trashed.has(f.id) || (f.parents ?? []).some((p) => trashed.has(p));
