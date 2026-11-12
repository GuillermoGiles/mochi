// Asistente con IA: las herramientas que puede usar (se ejecutan acá, con tu Drive)
// y la conversación con Gemini a través de /api/ia.

import { daysUntil, fmtNota, updateDatos } from './datos';
import { DEMO, fileCache, getFile, move, rename, type DFile } from './drive';
import {
  addFolder,
  folderPath,
  materiaFiles,
  materiaFolders,
  searchFiles,
  searchInMateria,
  setEstado,
  upcomingExams,
  type Estado,
  type FileItem,
  type Tree,
} from './facu';
import { fileBlob } from './fileBlob';
import { electivasHoras, missing, progress } from './plan';
import { baseName, extOf, kindOf } from './files';

export type Part = {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: unknown };
  [k: string]: unknown;
};
export type Content = { role: 'user' | 'model'; parts: Part[] };
export type Call = { name: string; args: Record<string, unknown> };

// Las que cambian algo: la app pide confirmación antes de aplicarlas.
export const CHANGES = new Set(['crear_carpeta', 'mover_archivos', 'renombrar', 'agregar_fecha', 'agregar_nota', 'cambiar_estado', 'agregar_entrega', 'marcar_entregada']);

export class IaError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

const OWN_KEY = 'mochi:gemini';
export function ownKey() {
  try {
    return localStorage.getItem(OWN_KEY) ?? '';
  } catch {
    return '';
  }
}
export function setOwnKey(k: string) {
  try {
    if (k.trim()) localStorage.setItem(OWN_KEY, k.trim());
    else localStorage.removeItem(OWN_KEY);
  } catch {}
}

export async function ask(contents: Content[], contexto: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const k = ownKey();
  if (k) headers['x-gemini-key'] = k;
  const r = await fetch('/api/ia', { method: 'POST', headers, body: JSON.stringify({ contents, contexto }) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 429)
    throw new IaError(`Llegaste al límite de ${j.limite ?? ''} preguntas de hoy. Mañana se renueva, o cargá tu propia clave de Gemini en Vos.`, 'limite');
  if (r.status === 401) throw new IaError('Se cerró tu sesión. Volvé a entrar.', 'sesion');
  if (r.status === 400 || r.status === 413)
    throw new IaError('No se pudo mandar la pregunta (puede ser un archivo muy largo). Recargá la página y probá de nuevo.', 'gemini');
  if (!r.ok) throw new IaError('Gemini no respondió. Puede estar saturado: probá de nuevo en un rato.', 'gemini');
  return j as { content: Content | null; restantes: number | null; limite: number };
}

export type PreguntaIA = { pregunta: string; opciones: string[]; correcta: number; explicacion: string };

// Repaso diario: 5 preguntas de opción múltiple sobre un apunte (texto, o una foto chica).
export async function pedirPreguntas(materia: string, archivo: string, apunte: { texto?: string; foto?: { mimeType: string; data: string } }) {
  if (DEMO)
    return Array.from({ length: 5 }, (_, n) => ({
      pregunta: `Pregunta de prueba ${n + 1} sobre ${materia}: ¿qué es una clave primaria?`,
      opciones: ['Identifica cada fila', 'Ordena la tabla', 'Borra duplicados', 'Une dos tablas'],
      correcta: 0,
      explicacion: 'La clave primaria identifica de forma única cada fila de la tabla.',
    }));
  const parts: Part[] = [{ text: `Materia: ${materia}\nApunte: ${archivo}\n\n${apunte.texto ?? '(está adjunto: miralo)'}` }];
  if (apunte.foto) parts.push({ inlineData: apunte.foto });
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const k = ownKey();
  if (k) headers['x-gemini-key'] = k;
  const r = await fetch('/api/ia', { method: 'POST', headers, body: JSON.stringify({ modo: 'preguntas', contents: [{ role: 'user', parts }] }) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 429) throw new IaError('Por hoy se terminaron las preguntas de la IA. Mañana se renueva.', 'limite');
  if (r.status === 401) throw new IaError('Se cerró tu sesión. Volvé a entrar.', 'sesion');
  if (!r.ok) throw new IaError('La IA no respondió. Probá de nuevo en un rato.', 'gemini');
  const text = (j.content?.parts as Part[] | undefined)?.map((p) => p.text ?? '').join('') ?? '';
  let out: PreguntaIA[] = [];
  try {
    out = JSON.parse(text);
  } catch {
    return [];
  }
  // Solo las que vienen bien armadas.
  return (Array.isArray(out) ? out : []).filter(
    (p) =>
      typeof p?.pregunta === 'string' &&
      Array.isArray(p.opciones) &&
      p.opciones.length >= 2 &&
      p.opciones.length <= 5 &&
      p.opciones.every((o) => typeof o === 'string' && o.trim()) &&
      Number.isInteger(p.correcta) &&
      p.correcta >= 0 &&
      p.correcta < p.opciones.length,
  );
}

// Lo que la IA necesita saber de entrada: la fecha, las materias y dónde estás.
export function contexto(tree: Tree, userName: string | undefined, materiaActual?: string) {
  const hoy = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const iso = new Date().toLocaleDateString('sv-SE');
  const materias = tree.years
    .map((y) => `${y.name}: ${y.materias.map((m) => `${m.name} [id ${m.id}${m.estado ? `, ${m.estado}` : ''}]`).join('; ')}`)
    .join('\n');
  const actual = materiaActual && tree.materias.get(materiaActual);
  return [
    `Hoy es ${hoy} (${iso}).`,
    userName ? `El usuario se llama ${userName.split(' ')[0]}.` : '',
    `Materias:\n${materias}`,
    actual ? `El usuario viene de la materia "${actual.name}" [id ${actual.id}]; si no aclara, probablemente se refiere a esa.` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

const fileInfo = (f: FileItem) => ({
  id: f.id,
  nombre: f.name,
  materia: f.materia.name,
  materia_id: f.materia.id,
  carpeta: folderPath(f.folder).map((x) => x.name).join(' / ') || '(suelto en la materia)',
});

const str = (v: unknown) => (typeof v === 'string' ? v : String(v ?? ''));

// Texto de lo que se va a hacer, para la tarjeta de confirmación.
export function describe(tree: Tree, c: Call): string {
  const m = tree.materias.get(str(c.args.materia_id));
  const where = (id: string) => tree.folders.get(id)?.name ?? tree.materias.get(id)?.name ?? 'otra carpeta';
  switch (c.name) {
    case 'crear_carpeta':
      return `Crear la carpeta **${str(c.args.nombre)}** en ${c.args.dentro_de_carpeta_id ? where(str(c.args.dentro_de_carpeta_id)) : (m?.name ?? 'la materia')}`;
    case 'mover_archivos': {
      const ids = (c.args.archivo_ids as string[]) ?? [];
      const names = ids.map((id) => baseName(fileCache.get(id)?.name ?? 'archivo'));
      return `Mover ${ids.length === 1 ? `**${names[0]}**` : `**${ids.length} archivos** (${names.slice(0, 3).join(', ')}${ids.length > 3 ? '…' : ''})`} a **${where(str(c.args.destino_id))}**`;
    }
    case 'renombrar': {
      const id = str(c.args.id);
      const before = fileCache.get(id)?.name ?? tree.folders.get(id)?.name ?? tree.materias.get(id)?.name ?? 'el archivo';
      return `Cambiar el nombre de **${before}** a **${str(c.args.nombre)}**`;
    }
    case 'agregar_fecha':
      return `Agregar **${str(c.args.titulo)}** de ${m?.name ?? 'la materia'} el **${str(c.args.fecha).split('-').reverse().join('/')}**`;
    case 'agregar_entrega':
      return `Anotar la entrega **${str(c.args.titulo)}** de ${m?.name ?? 'la materia'} para el **${str(c.args.fecha).split('-').reverse().join('/')}**`;
    case 'marcar_entregada':
      return `Marcar **${tree.entregas.find((e) => e.id === str(c.args.entrega_id))?.title ?? 'la entrega'}** como ${c.args.entregada === false ? 'pendiente' : 'entregada'}`;
    case 'agregar_nota':
      return `Cargar **${str(c.args.titulo)}: ${fmtNota(Number(c.args.nota))}** en ${m?.name ?? 'la materia'}`;
    case 'cambiar_estado': {
      const label = { cursando: 'Cursando', final: 'Final pendiente', aprobada: 'Aprobada', ninguno: 'Sin cursar' }[str(c.args.estado)];
      const nota = c.args.nota_final !== undefined ? ` con ${fmtNota(Number(c.args.nota_final))}` : '';
      return `Marcar ${m?.name ?? 'la materia'} como **${label}${nota}**`;
    }
  }
  return c.name;
}

// Cartelito de qué está haciendo mientras usa una herramienta de consulta.
export function activity(c: Call) {
  switch (c.name) {
    case 'buscar_archivos':
      return `Buscando “${str(c.args.texto)}”`;
    case 'leer_archivo':
      return `Leyendo ${baseName(fileCache.get(str(c.args.archivo_id))?.name ?? 'el archivo')}`;
    case 'listar_archivos':
      return 'Mirando los archivos';
    case 'listar_materias':
      return 'Mirando tus materias';
    case 'ver_carrera':
      return 'Mirando tu plan de estudios';
    case 'ver_fechas_y_notas':
      return 'Mirando tus fechas y notas';
  }
  return 'Trabajando';
}

const MAX_TEXT = 60_000;

// Los dibujos de Excalidraw son un JSON enorme: solo interesa lo escrito.
function excalidrawText(json: string) {
  try {
    const els: { type?: string; text?: string; isDeleted?: boolean }[] = JSON.parse(json).elements ?? [];
    return els
      .filter((x) => x.type === 'text' && x.text && !x.isDeleted)
      .map((x) => x.text!.trim())
      .join('\n');
  } catch {
    return '';
  }
}

export async function readText(f: DFile): Promise<string> {
  const blob = await fileBlob(f);
  const k = kindOf(f);
  const e = extOf(f.name);
  if (e === 'excalidraw') return excalidrawText(await blob.text()) || 'El dibujo no tiene texto escrito.';
  if (k === 'pdf') {
    const pdfjs = await import('pdfjs-dist');
    const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = worker;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    let out = '';
    for (let i = 1; i <= doc.numPages && out.length < MAX_TEXT; i++) {
      const t = await (await doc.getPage(i)).getTextContent();
      out += `\n[Página ${i}]\n` + t.items.map((x) => ('str' in x ? x.str : '')).join(' ');
    }
    await doc.cleanup();
    return out.trim() || 'El PDF no tiene texto (parece escaneado o son imágenes).';
  }
  if (k === 'word' && e === 'docx') {
    const mammoth = (await import('mammoth/mammoth.browser.js')).default;
    return (await mammoth.extractRawText({ arrayBuffer: await blob.arrayBuffer() })).value;
  }
  if (k === 'excel') {
    const XLSX = await import('xlsx');
    const book = XLSX.read(await blob.arrayBuffer(), { type: 'array' });
    return book.SheetNames.map((n) => `[Hoja ${n}]\n${XLSX.utils.sheet_to_csv(book.Sheets[n])}`).join('\n\n');
  }
  if (['txt', 'md', 'csv', 'json', 'excalidraw'].includes(e)) return blob.text();
  return `No puedo leer el contenido de este tipo de archivo (.${e}).`;
}

const findMateria = (tree: Tree, id: unknown) => {
  const m = tree.materias.get(str(id));
  if (!m) throw new Error(`No existe la materia con id ${str(id)}. Usá listar_materias para ver los ids.`);
  return m;
};

// Ejecuta una herramienta y devuelve el resultado para la IA.
export async function runTool(tree: Tree, c: Call): Promise<unknown> {
  const a = c.args;
  switch (c.name) {
    case 'listar_materias':
      return {
        materias: tree.years.flatMap((y) =>
          y.materias.map((m) => ({
            id: m.id,
            nombre: m.name,
            anio: y.name,
            estado: m.estado ?? 'sin cursar',
            nota_final: m.nota,
            carpetas: materiaFolders(m).map((f) => ({ id: f.id, ruta: folderPath(f).map((x) => x.name).join(' / ') })),
          })),
        ),
      };
    case 'buscar_archivos': {
      const text = str(a.texto).trim();
      if (!text) return { archivos: [] };
      const found = a.materia_id
        ? await searchInMateria(tree, findMateria(tree, a.materia_id), text)
        : await searchFiles(tree, text);
      return { archivos: found.slice(0, 20).map(fileInfo) };
    }
    case 'listar_archivos': {
      const m = findMateria(tree, a.materia_id);
      const folderId = a.carpeta_id ? str(a.carpeta_id) : undefined;
      const files = (await materiaFiles(tree, m)).filter((f) => (folderId ? f.folder?.id === folderId : true));
      const sub = folderId ? (tree.folders.get(folderId)?.children ?? []) : m.folders;
      return {
        carpetas: sub.map((f) => ({ id: f.id, nombre: f.name })),
        archivos: files.slice(0, 80).map(fileInfo),
        total: files.length,
      };
    }
    case 'leer_archivo': {
      const id = str(a.archivo_id);
      const f = fileCache.get(id) ?? (await getFile(id));
      const text = await readText(f);
      return {
        nombre: f.name,
        texto: text.slice(0, MAX_TEXT),
        recortado: text.length > MAX_TEXT ? 'El archivo es largo: se muestran solo las primeras partes.' : undefined,
      };
    }
    case 'ver_fechas_y_notas':
      return {
        fechas: upcomingExams(tree).map((e) => ({
          materia: tree.materias.get(e.materiaId)?.name,
          titulo: e.title,
          fecha: e.date,
          faltan_dias: daysUntil(e.date),
        })),
        entregas: tree.entregas
          .filter((e) => !e.done || daysUntil(e.date) > -30)
          .map((e) => ({
            id: e.id,
            materia: tree.materias.get(e.materiaId)?.name,
            titulo: e.title,
            detalle: e.desc,
            fecha: e.date,
            faltan_dias: daysUntil(e.date),
            entregada: e.done,
          })),
        notas: tree.grades.map((g) => ({ materia: tree.materias.get(g.materiaId)?.name, titulo: g.title, nota: g.nota })),
      };
    case 'ver_carrera': {
      const p = progress(tree);
      const byCode = new Map(p.rows.map((r) => [r.code, r]));
      return {
        carrera: `${p.plan.carrera} (${p.plan.nombre})`,
        porcentaje: p.porcentaje,
        aprobadas: `${p.aprobadas} de ${p.obligatorias} obligatorias`,
        electivas_horas: `${p.horasElectivas} de ${electivasHoras(p.plan)}`,
        // No hay que hacer todas las electivas: alcanza con sumar las horas que pide cada nivel (sin nivel = todo el plan).
        electivas_por_nivel: p.electivasPorNivel.map((x) => ({ nivel: x.nivel, horas_que_pide: x.pide, horas_hechas: x.hechas })),
        pps_hecha: p.pps,
        materias: p.rows.map((r) => ({
          nombre: r.name,
          nivel: r.nivel,
          electiva: r.electiva || undefined,
          estado: r.state === 'final' ? 'regular (falta final)' : (r.state ?? 'sin hacer'),
          nota: r.nota,
          le_falta_para_cursar: r.state ? undefined : missing(r, byCode).map((x) => `${x.row.name} (${x.need === 'regular' ? 'cursada' : 'aprobada'})`),
        })),
      };
    }
    case 'crear_carpeta': {
      const m = findMateria(tree, a.materia_id);
      const parent = a.dentro_de_carpeta_id ? str(a.dentro_de_carpeta_id) : m.id;
      const f = await addFolder(str(a.nombre), parent);
      return { ok: true, carpeta_id: f.id };
    }
    case 'mover_archivos': {
      const to = str(a.destino_id);
      if (!tree.folders.has(to) && !tree.materias.has(to)) throw new Error('El destino no es una carpeta ni una materia válida.');
      const ids = (a.archivo_ids as string[]) ?? [];
      for (const id of ids) {
        const f = fileCache.get(id) ?? (await getFile(id));
        if (!f.parents?.includes(to)) await move(id, f.parents ?? [], to);
      }
      return { ok: true, movidos: ids.length };
    }
    case 'renombrar': {
      const id = str(a.id);
      let name = str(a.nombre).trim();
      const old = fileCache.get(id)?.name;
      // Si se olvidó la extensión del archivo, se mantiene la que tenía.
      if (old && extOf(old) && !extOf(name)) name = `${name}.${extOf(old)}`;
      await rename(id, name);
      return { ok: true, nombre: name };
    }
    case 'agregar_fecha': {
      const m = findMateria(tree, a.materia_id);
      const fecha = str(a.fecha);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('La fecha tiene que tener el formato AAAA-MM-DD.');
      await updateDatos(tree.rootId, (d) => {
        d.exams.push({ id: crypto.randomUUID(), materiaId: m.id, title: str(a.titulo), date: fecha });
      });
      return { ok: true };
    }
    case 'agregar_entrega': {
      const m = findMateria(tree, a.materia_id);
      const fecha = str(a.fecha);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('La fecha tiene que tener el formato AAAA-MM-DD.');
      await updateDatos(tree.rootId, (d) => {
        d.entregas.push({ id: crypto.randomUUID(), materiaId: m.id, title: str(a.titulo), desc: a.detalle ? str(a.detalle) : undefined, date: fecha, done: false });
      });
      return { ok: true };
    }
    case 'marcar_entregada': {
      const id = str(a.entrega_id);
      if (!tree.entregas.some((e) => e.id === id)) throw new Error('No existe esa entrega. Usá ver_fechas_y_notas para ver los ids.');
      await updateDatos(tree.rootId, (d) => {
        const e = d.entregas.find((x) => x.id === id);
        if (e) e.done = a.entregada !== false;
      });
      return { ok: true };
    }
    case 'agregar_nota': {
      const m = findMateria(tree, a.materia_id);
      const nota = Number(a.nota);
      if (!(nota >= 0 && nota <= 10)) throw new Error('La nota tiene que ser de 0 a 10.');
      await updateDatos(tree.rootId, (d) => {
        d.grades = d.grades ?? [];
        d.grades.push({ id: crypto.randomUUID(), materiaId: m.id, title: str(a.titulo), nota });
      });
      return { ok: true };
    }
    case 'cambiar_estado': {
      const m = findMateria(tree, a.materia_id);
      const e = str(a.estado);
      const estado = (e === 'ninguno' ? null : e) as Estado | null;
      await setEstado(m, estado, a.nota_final !== undefined ? Number(a.nota_final) : undefined);
      return { ok: true };
    }
  }
  throw new Error(`Herramienta desconocida: ${c.name}`);
}
