// La estructura de la facultad dentro de Drive:
//   Facultad / 3er año / Base de Datos / Trabajos prácticos / TP1 / ...
// Año y materia se marcan con appProperties (así no importa si se renombran).
// Adentro de la materia, las carpetas son libres y pueden tener subcarpetas.

import { cachedDatos, loadDatos, daysUntil, updateDatos, type Datos, type Entrega, type Exam, type Grade } from './datos';
import { planRows, type CarreraId, type PlanMark } from './plan';
import { cachedList, createFolder, DEMO, escapeQuery, FOLDER, folderChanges, list, rename, trash, update, type DFile } from './drive';

export const YEAR_NAMES = ['1er año', '2do año', '3er año', '4to año', '5to año', '6to año', '7mo año'];
export const COLORS = ['#4c6ef5', '#12b886', '#f59f00', '#e64980', '#7950f2', '#15aabf', '#fa5252', '#74b816'];

export type Folder = {
  id: string;
  name: string;
  parentId: string;
  parent?: Folder;
  materia: Materia;
  children: Folder[];
  // Compartida con link (solo lectura).
  compartido: boolean;
  // Lo que va en el link: el id de la carpeta, o el del índice si se compartió archivo por archivo.
  shareId?: string;
};
// Sin estado = materia que no estás cursando ni rendiste todavía.
export type Estado = 'cursando' | 'final' | 'aprobada';
export const ESTADOS: { key: Estado; label: string }[] = [
  { key: 'cursando', label: 'Cursando' },
  { key: 'final', label: 'Final pendiente' },
  { key: 'aprobada', label: 'Aprobada' },
];

export type Materia = {
  id: string;
  name: string;
  color: string;
  yearId: string;
  estado?: Estado;
  aprobada: boolean;
  // Nota final, si se cargó al aprobarla.
  nota?: number;
  // Ícono elegido a mano; si no hay, se elige solo por el nombre.
  icono?: string;
  compartido: boolean;
  // Lo que va en el link: el id de la carpeta, o el del índice si se compartió archivo por archivo.
  shareId?: string;
  folders: Folder[];
};
export type Year = { id: string; name: string; order: number; materias: Materia[] };
export type Tree = {
  rootId: string;
  rootLink?: string;
  years: Year[];
  materias: Map<string, Materia>;
  // Todas las carpetas que están adentro de alguna materia (a cualquier profundidad).
  folders: Map<string, Folder>;
  exams: Exam[];
  grades: Grade[];
  entregas: Entrega[];
  plan: Record<string, PlanMark>;
  carrera?: CarreraId;
};
// folder vacío = archivo suelto en la materia.
export type FileItem = DFile & { materia: Materia; folder?: Folder };

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, 'es', { numeric: true });

const FOLDERS_Q = `mimeType='${FOLDER}' and trashed=false`;
const isRoot = (f: DFile) => f.appProperties?.facu === 'root';
let folderCache: { all: DFile[]; version: number } | null = null;

// full: trae todo de nuevo de Drive (al abrir la app o al volver a ella, por si cambió algo en otro
// dispositivo). Si no, reutiliza lo que no se tocó desde la app: después de cargar una fecha o una
// nota no se vuelven a pedir las carpetas, y después de mover una carpeta no se vuelven a pedir las fechas.
export async function loadTree({ full = true } = {}): Promise<Tree> {
  const version = folderChanges;
  const all = !full && folderCache?.version === version ? folderCache.all : await list(FOLDERS_Q);
  folderCache = { all, version };
  const root = all.find(isRoot) ?? (await createFolder('Facultad', undefined, { facu: 'root' }));
  return buildTree(all, root, await loadDatos(root.id, !full));
}

// Lo último que se vio, guardado en el celu, para mostrarlo al instante mientras llega lo nuevo.
export async function cachedTree(): Promise<Tree | null> {
  if (DEMO) return null;
  const [all, datos] = await Promise.all([cachedList(FOLDERS_Q), cachedDatos()]);
  const root = all?.find(isRoot);
  if (!all || !root) return null;
  return buildTree(all, root, datos ?? { version: 1, exams: [], grades: [], entregas: [], plan: {} });
}

function buildTree(all: DFile[], root: DFile, datos: Datos): Tree {

  const years: Year[] = all
    .filter((f) => f.appProperties?.facu === 'year' && f.parents?.includes(root.id))
    .map((f) => ({ id: f.id, name: f.name, order: Number(f.appProperties?.order ?? 0), materias: [] }))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'es'));
  const yearById = new Map(years.map((y) => [y.id, y]));

  const materias = new Map<string, Materia>();
  for (const f of all) {
    if (f.appProperties?.facu !== 'materia') continue;
    const year = f.parents?.map((p) => yearById.get(p)).find(Boolean);
    if (!year) continue;
    const m: Materia = {
      id: f.id,
      name: f.name,
      color: f.appProperties.color ?? COLORS[0],
      yearId: year.id,
      estado: (['cursando', 'final', 'aprobada'] as const).find((e) => e === f.appProperties!.estado),
      aprobada: f.appProperties.estado === 'aprobada',
      nota: f.appProperties.nota ? Number(f.appProperties.nota) : undefined,
      icono: f.appProperties.icono,
      compartido: !!f.appProperties.compartido,
      shareId: f.appProperties.compartido === '1' ? f.id : f.appProperties.compartido || undefined,
      folders: [],
    };
    materias.set(m.id, m);
    year.materias.push(m);
  }
  for (const y of years) y.materias.sort(byName);

  // Arma el árbol de carpetas de cada materia subiendo por los padres.
  const raw = new Map(all.map((f) => [f.id, f]));
  const folders = new Map<string, Folder>();
  const structural = (f: DFile) => ['root', 'year', 'materia'].includes(f.appProperties?.facu ?? '');
  const resolve = (id: string, seen = new Set<string>()): Folder | Materia | null => {
    if (materias.has(id)) return materias.get(id)!;
    if (folders.has(id)) return folders.get(id)!;
    const f = raw.get(id);
    const parentId = f?.parents?.[0];
    if (!f || !parentId || seen.has(id) || structural(f)) return null;
    seen.add(id);
    const parent = resolve(parentId, seen);
    if (!parent) return null;
    const isFolder = 'materia' in parent;
    const folder: Folder = {
      id: f.id,
      name: f.name,
      parentId,
      compartido: !!f.appProperties?.compartido,
      shareId: f.appProperties?.compartido === '1' ? f.id : f.appProperties?.compartido || undefined,
      parent: isFolder ? parent : undefined,
      materia: isFolder ? parent.materia : parent,
      children: [],
    };
    folders.set(f.id, folder);
    (isFolder ? parent.children : parent.folders).push(folder);
    return folder;
  };
  // Incluye las viejas secciones (Teoría, Parciales…), que ahora son carpetas normales.
  for (const f of all) if (!structural(f)) resolve(f.id);
  for (const m of materias.values()) m.folders.sort(byName);
  for (const f of folders.values()) f.children.sort(byName);

  return { rootId: root.id, rootLink: root.webViewLink, years, materias, folders, exams: datos.exams, grades: datos.grades ?? [], entregas: datos.entregas ?? [], plan: datos.plan ?? {}, carrera: datos.carrera };
}

const yearName = (index: number) => YEAR_NAMES[index] ?? `Año ${index + 1}`;
export const nextYearName = (tree: Tree) => yearName(tree.years.length);

export async function addYear(tree: Tree, index = tree.years.length) {
  return createFolder(yearName(index), tree.rootId, { facu: 'year', order: String(index + 1) });
}

export async function addMateria(year: Year, name: string, color: string) {
  return createFolder(name.trim(), year.id, { facu: 'materia', color, estado: 'cursando' });
}

export const setEstado = (m: Materia, estado: Estado | null, nota?: number) =>
  update(m.id, {
    appProperties: { estado, nota: estado === 'aprobada' && nota !== undefined ? String(nota) : null },
  });

export const setCarrera = (tree: Tree, carrera: CarreraId) => updateDatos(tree.rootId, (d) => void (d.carrera = carrera));

export const setIcono =(m: Materia, icono: string | null) => update(m.id, { appProperties: { icono } });

export const setAprobada = (m: Materia, aprobada: boolean, nota?: number) =>
  setEstado(m, aprobada ? 'aprobada' : 'cursando', nota);

// Promedio de la carrera con las notas finales cargadas (en tus materias y en el plan de la carrera).
export function promedio(tree: Tree) {
  const notas = [...tree.materias.values()].filter((m) => m.aprobada && m.nota !== undefined).map((m) => m.nota!);
  for (const r of planRows(tree)) if (!r.materia?.estado && r.state === 'aprobada' && r.nota !== undefined) notas.push(r.nota);
  return notas.length ? { valor: notas.reduce((a, b) => a + b, 0) / notas.length, cantidad: notas.length } : null;
}

// Fechas que todavía no pasaron, de materias que se están cursando, la más cercana primero.
export function upcomingExams(tree: Tree, materiaId?: string) {
  return tree.exams
    .filter((e) => daysUntil(e.date) >= 0 && (!materiaId || e.materiaId === materiaId))
    .filter((e) => { const m = tree.materias.get(e.materiaId); return m && !m.aprobada; })
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Entregas sin entregar de materias que no están aprobadas: las atrasadas y la más cercana primero.
export function pendingEntregas(tree: Tree) {
  return tree.entregas
    .filter((e) => !e.done && !tree.materias.get(e.materiaId)?.aprobada && tree.materias.has(e.materiaId))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export const addFolder = (name: string, parentId: string) => createFolder(name.trim(), parentId, { facu: 'folder' });
export const renameFolder = rename;
export const trashFolder = trash;

// Camino desde la materia: [Trabajos prácticos, TP1]
export function folderPath(folder?: Folder): Folder[] {
  const out: Folder[] = [];
  for (let f = folder; f; f = f.parent) out.unshift(f);
  return out;
}

export function whereLabel(item: { materia: Materia; folder?: Folder }) {
  return [item.materia.name, ...folderPath(item.folder).map((f) => f.name)].join(' · ');
}

export function descendants(folder: Folder): Folder[] {
  return folder.children.flatMap((c) => [c, ...descendants(c)]);
}

export function materiaFolders(m: Materia): Folder[] {
  return m.folders.flatMap((f) => [f, ...descendants(f)]);
}

function toItems(tree: Tree, files: DFile[]): FileItem[] {
  const out: FileItem[] = [];
  for (const f of files) {
    for (const p of f.parents ?? []) {
      const folder = tree.folders.get(p);
      if (folder) {
        out.push({ ...f, materia: folder.materia, folder });
        break;
      }
      const materia = tree.materias.get(p);
      if (materia) {
        out.push({ ...f, materia });
        break;
      }
    }
  }
  return out;
}

export function itemOf(tree: Tree, f: DFile): FileItem | null {
  return toItems(tree, [f])[0] ?? null;
}

const notFolder = `mimeType!='${FOLDER}' and trashed=false`;

// Drive no acepta búsquedas muy largas: se piden de a 40 carpetas.
function materiaQueries(m: Materia) {
  const ids = [m.id, ...materiaFolders(m).map((f) => f.id)];
  const out: string[] = [];
  for (let i = 0; i < ids.length; i += 40)
    out.push(`(${ids.slice(i, i + 40).map((id) => `'${id}' in parents`).join(' or ')}) and ${notFolder}`);
  return out;
}

export async function materiaFiles(tree: Tree, m: Materia) {
  const parts = await Promise.all(materiaQueries(m).map((q) => list(q)));
  return toItems(tree, parts.flat());
}

// Los archivos de la materia como se vieron la última vez, para mostrarlos al instante.
// null si falta algo (por ejemplo, una carpeta nueva que todavía no se abrió).
export async function cachedMateriaFiles(tree: Tree, m: Materia) {
  if (DEMO) return null;
  const parts = await Promise.all(materiaQueries(m).map((q) => cachedList(q)));
  return parts.every(Boolean) ? toItems(tree, parts.flat() as DFile[]) : null;
}

// Busca adentro de los PDF y Word de una sola materia (Drive indexa el texto).
export async function searchInMateria(tree: Tree, m: Materia, text: string) {
  const ids = [m.id, ...materiaFolders(m).map((f) => f.id)];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 40) chunks.push(ids.slice(i, i + 40));
  const parts = await Promise.all(
    chunks.map((c) =>
      list(`fullText contains '${escapeQuery(text)}' and (${c.map((id) => `'${id}' in parents`).join(' or ')}) and ${notFolder}`, {
        pageSize: 100,
        firstPageOnly: true,
      }),
    ),
  );
  return toItems(tree, parts.flat());
}

const RECENT = { orderBy: 'modifiedTime desc', pageSize: 12, firstPageOnly: true };

export async function recentFiles(tree: Tree) {
  return toItems(tree, await list(notFolder, RECENT)).slice(0, 6);
}

export async function cachedRecentFiles(tree: Tree) {
  const saved = DEMO ? null : await cachedList(notFolder, RECENT);
  return saved ? toItems(tree, saved).slice(0, 6) : null;
}

// Busca en el nombre y también dentro del contenido (PDF, Word, etc.).
export async function searchFiles(tree: Tree, text: string) {
  return toItems(tree, await list(`fullText contains '${escapeQuery(text)}' and ${notFolder}`, { pageSize: 50, firstPageOnly: true }));
}

