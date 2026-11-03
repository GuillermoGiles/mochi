// Datos chicos de la app (fechas de parciales, notas y entregas) en un archivo JSON dentro de la carpeta Facultad.
// Así se ven igual en la compu y en el celu.

import type { CarreraId, PlanMark } from './plan';
import { DEMO, createTextFile, download, list, saveContent } from './drive';
import { getList, isNetworkError, putList } from './offline';

export type Exam = { id: string; materiaId: string; title: string; date: string /* AAAA-MM-DD */ };
export type Grade = { id: string; materiaId: string; title: string; nota: number };
// Una tarea para entregar (TP, actividad, informe). "done" = ya entregada.
export type Entrega = { id: string; materiaId: string; title: string; desc?: string; date: string; done: boolean };
// plan: estado de las materias del plan que no tienen carpeta (por código del plan).
// carrera: la que eligió al empezar; sin carrera es Sistemas.
export type Datos = { version: 1; carrera?: CarreraId; exams: Exam[]; grades: Grade[]; entregas: Entrega[]; plan: Record<string, PlanMark> };

const empty = (): Datos => ({ version: 1, exams: [], grades: [], entregas: [], plan: {} });
let fileId: string | null = null;
let demoDatos: Datos | null = null;

function demoSample(): Datos {
  const inDays = (n: number) => toISO(new Date(Date.now() + n * 86_400_000));
  return {
    version: 1,
    exams: [
      { id: 'e1', materiaId: 'm1', title: 'Parcial 1', date: inDays(2) },
      { id: 'e2', materiaId: 'm2', title: 'Entrega TP', date: inDays(9) },
      { id: 'e3', materiaId: 'm1', title: 'Final', date: inDays(40) },
    ],
    grades: [{ id: 'g1', materiaId: 'm1', title: 'TP 1', nota: 9 }],
    plan: { '1': { estado: 'aprobada', nota: 7 }, '2': { estado: 'aprobada', nota: 9 }, '4': { estado: 'aprobada' }, '6': { estado: 'aprobada', nota: 8 }, '8': { estado: 'final' }, '5': { estado: 'aprobada', nota: 6 }, '14': { estado: 'final' }, '16': { estado: 'final' }, '13': { estado: 'aprobada', nota: 8 } },
    entregas: [
      { id: 't1', materiaId: 'm1', title: 'Actividad grupal de la semana', desc: 'Layout + navegación del TP', date: inDays(1), done: false },
      { id: 't2', materiaId: 'm4', title: 'TP Individual', desc: 'Red neuronal simple', date: inDays(6), done: false },
      { id: 't3', materiaId: 'm5', title: 'Informe de laboratorio', date: inDays(-2), done: false },
      { id: 't4', materiaId: 'm1', title: 'Actividad individual de la semana', desc: 'Librería en React', date: inDays(-5), done: true },
    ],
  };
}

async function read(rootId: string): Promise<Datos> {
  if (DEMO) return (demoDatos ??= demoSample());
  const f = (await list(`'${rootId}' in parents and appProperties has { key='facu' and value='datos' } and trashed=false`))[0];
  if (!f) return empty();
  fileId = f.id;
  let text: string;
  try {
    text = await (await download(f.id)).text();
  } catch (e) {
    // Sin internet: la última copia que se leyó.
    if (isNetworkError(e)) return (await getList<Datos>('datos')) ?? empty();
    throw e;
  }
  try {
    const d: Datos = { ...empty(), ...JSON.parse(text) };
    putList('datos', d);
    return d;
  } catch {
    return empty();
  }
}

export const loadDatos = read;

// Lee la última versión antes de guardar, para no pisar cambios hechos desde otro dispositivo.
export async function updateDatos(rootId: string, change: (d: Datos) => void) {
  const d = await read(rootId);
  change(d);
  if (DEMO) return;
  const text = JSON.stringify(d, null, 1);
  if (fileId) await saveContent(fileId, new Blob([text], { type: 'application/json' }));
  else fileId = (await createTextFile('Mochi - fechas.json', rootId, text, 'application/json', { facu: 'datos' })).id;
}

export function toISO(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function daysUntil(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(y, m - 1, d).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / 86_400_000);
}

export function whenLabel(iso: string) {
  const n = daysUntil(iso);
  if (n === 0) return '¡Hoy!';
  if (n === 1) return 'Mañana';
  return `En ${n} días`;
}

export function dateLabel(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const weekday = new Date(y, m - 1, d).toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '');
  return `${weekday} ${d}/${m}`;
}

// Link para agregar la fecha a Google Calendar (evento de todo el día). No necesita permisos:
// se abre Calendar con todo completo y se guarda con un clic.
export function calendarLink(e: Exam, materiaName: string) {
  const [y, m, d] = e.date.split('-').map(Number);
  const start = e.date.replace(/-/g, '');
  const end = toISO(new Date(y, m - 1, d + 1)).replace(/-/g, '');
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${e.title} · ${materiaName}`,
    dates: `${start}/${end}`,
    details: 'Cargado desde Mochi · https://mochi-facu.vercel.app',
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

export const fmtNota = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

// Los promedios siempre con 2 decimales: "8,50".
export const fmtPromedio = (n: number) => n.toFixed(2).replace('.', ',');
