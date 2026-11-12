// Liga mensual y duelos con compañeros. Lo que hace el servidor está en api/_liga.ts.

import type { Pregunta } from './datos';
import { DEMO } from './drive';

export type MiembroLiga = { nombre: string; foto: string | null; puntos: number; racha: number; hoy: boolean; medallas: number; yo: boolean };
export type Liga = {
  nombre: string;
  codigo: string;
  // El mes que se está jugando (AAAA-MM).
  mes: string;
  ganadorAnterior: { n: string; p: number } | null;
  miembros: MiembroLiga[];
};
export type JugadorDuelo = { nombre: string; foto: string | null; aciertos: number; yo: boolean; creador: boolean };
export type PreguntaDuelo = { q: string; opciones: string[]; ok: number; por?: string };
export type Duelo = {
  id: string;
  materia: string;
  total: number;
  esMio: boolean;
  jugaste: boolean;
  creador: { nombre: string; foto: string | null };
  preguntas?: PreguntaDuelo[];
  jugadores: JugadorDuelo[];
};

export class LigaError extends Error {}

async function post<T>(body: Record<string, unknown>): Promise<T> {
  if (DEMO) return demo(body) as T;
  const r = await fetch('/api/liga', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 404) throw new LigaError(body.accion === 'previa' || body.accion === 'unirse' ? 'Esa liga ya no existe.' : 'Ese duelo ya no existe (duran 14 días).');
  if (r.status === 409) throw new LigaError('Esa liga está llena (50 personas).');
  if (r.status === 401) throw new LigaError('Se cerró tu sesión. Volvé a entrar.');
  if (!r.ok) throw new LigaError('No se pudo conectar con la liga. Probá de nuevo en un rato.');
  return j as T;
}

// Lo último que se vio de la liga, para mostrarlo en Inicio sin esperar.
const CACHE = 'mochi:liga';
export function ligaGuardada(): Liga | null {
  try {
    return JSON.parse(localStorage.getItem(CACHE) ?? 'null');
  } catch {
    return null;
  }
}
function guardar(l: Liga | null) {
  try {
    if (l) localStorage.setItem(CACHE, JSON.stringify(l));
    else localStorage.removeItem(CACHE);
  } catch {}
  dispatchEvent(new Event('mochi:liga'));
  return l;
}

export const verLiga = async () => guardar((await post<{ liga: Liga | null }>({ accion: 'ver' })).liga);
export const crearLiga = async (nombre: string) => guardar((await post<{ liga: Liga }>({ accion: 'crear', nombre })).liga);
export const unirseLiga = async (codigo: string) => guardar((await post<{ liga: Liga }>({ accion: 'unirse', codigo })).liga);
export const salirLiga = async () => guardar((await post<{ liga: null }>({ accion: 'salir' })).liga);
export const previaLiga = (codigo: string) => post<{ nombre: string; miembros: number; yaEstas: boolean }>({ accion: 'previa', codigo });
// Al terminar el repaso del día. Si no estás en una liga no hace nada.
export const sumarLiga = async (aciertos: number, racha: number) =>
  guardar((await post<{ liga: Liga | null }>({ accion: 'sumar', aciertos, racha })).liga);

export async function crearDuelo(materia: string, preguntas: Pregunta[], respuestas: number[]) {
  const ps: PreguntaDuelo[] = preguntas.map((p) => ({ q: p.q, opciones: p.opciones, ok: p.ok, por: p.por }));
  return (await post<{ id: string }>({ accion: 'duelo-crear', materia, preguntas: ps, respuestas })).id;
}
export const verDuelo = async (id: string) => (await post<{ duelo: Duelo }>({ accion: 'duelo-ver', id })).duelo;
export const responderDuelo = async (id: string, respuestas: number[]) =>
  (await post<{ duelo: Duelo }>({ accion: 'duelo-responder', id, respuestas })).duelo;
export const misDuelos = async () => (await post<{ duelos: Duelo[] }>({ accion: 'duelos' })).duelos;

export const linkLiga = (codigo: string) => `${location.origin}/#/liga/${codigo}`;
export const linkDuelo = (id: string) => `${location.origin}/#/duelo/${id}`;

// Mandar un link: en el celu con el menú de compartir (WhatsApp, etc.); si no, se copia.
export async function compartir(texto: string, url: string): Promise<'compartido' | 'copiado' | 'cancelado'> {
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ text: texto, url });
      return 'compartido';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelado';
    }
  }
  await navigator.clipboard.writeText(`${texto} ${url}`);
  return 'copiado';
}

// ---------------------------------------------------------------------------
// Modo demo (sin cuenta): todo en memoria, para probar las pantallas.

let demoLiga: Liga | null = null;
const demoDuelos = new Map<string, Duelo & { preguntas: PreguntaDuelo[] }>();
function demo(b: Record<string, unknown>): unknown {
  const yo = { nombre: 'Demo D.', foto: null, puntos: 0, racha: 0, hoy: false, medallas: 0, yo: true };
  switch (b.accion) {
    case 'ver':
      return { liga: demoLiga };
    case 'previa':
      return { nombre: 'Los de Sistemas', miembros: 4, yaEstas: demoLiga?.codigo === b.codigo };
    case 'crear':
    case 'unirse':
      demoLiga = {
        nombre: b.accion === 'crear' ? String(b.nombre) : 'Los de Sistemas',
        codigo: b.accion === 'crear' ? 'DEMO42' : String(b.codigo),
        mes: '2026-11',
        ganadorAnterior: { n: 'Ana P.', p: 280 },
        miembros: [
          { nombre: 'Ana P.', foto: null, puntos: 180, racha: 9, hoy: true, medallas: 2, yo: false },
          { nombre: 'Lucas M.', foto: null, puntos: 120, racha: 4, hoy: false, medallas: 0, yo: false },
          yo,
          { nombre: 'Sofi R.', foto: null, puntos: 0, racha: 0, hoy: false, medallas: 1, yo: false },
        ],
      };
      return { liga: demoLiga };
    case 'salir':
      demoLiga = null;
      return { liga: null };
    case 'sumar': {
      if (!demoLiga) return { liga: null };
      const m = demoLiga.miembros.find((x) => x.yo)!;
      if (!m.hoy) m.puntos += 30 + Number(b.aciertos) * 5;
      Object.assign(m, { hoy: true, racha: Number(b.racha) });
      demoLiga.miembros.sort((x, y) => y.puntos - x.puntos);
      return { liga: demoLiga };
    }
    case 'duelo-crear': {
      const id = 'D' + Math.random().toString(36).slice(2, 8);
      const preguntas = b.preguntas as PreguntaDuelo[];
      const a = preguntas.filter((p, i) => (b.respuestas as number[])[i] === p.ok).length;
      demoDuelos.set(id, {
        id,
        materia: String(b.materia),
        total: preguntas.length,
        esMio: true,
        jugaste: true,
        creador: { nombre: 'Demo D.', foto: null },
        preguntas,
        jugadores: [{ nombre: 'Demo D.', foto: null, aciertos: a, yo: true, creador: true }],
      });
      return { id };
    }
    case 'duelo-ver': {
      const d = demoDuelos.get(String(b.id));
      if (d) return { duelo: { ...d, preguntas: d.jugaste ? undefined : d.preguntas } };
      // Un duelo que "te mandó" otra persona.
      const preguntas = [0, 1, 2, 3, 4].map((i) => ({ q: `¿Pregunta de prueba ${i + 1}?`, opciones: ['Correcta', 'Otra', 'Otra más', 'Ninguna'], ok: 0, por: 'Es la de prueba.' }));
      const ajeno: Duelo & { preguntas: PreguntaDuelo[] } = {
        id: String(b.id),
        materia: 'Bases de Datos',
        total: 5,
        esMio: false,
        jugaste: false,
        creador: { nombre: 'Ana P.', foto: null },
        preguntas,
        jugadores: [],
      };
      demoDuelos.set(ajeno.id, ajeno);
      return { duelo: ajeno };
    }
    case 'duelo-responder': {
      const d = demoDuelos.get(String(b.id))!;
      const a = d.preguntas.filter((p, i) => (b.respuestas as number[])[i] === p.ok).length;
      Object.assign(d, {
        jugaste: true,
        jugadores: [
          { nombre: 'Ana P.', foto: null, aciertos: 4, yo: false, creador: true },
          { nombre: 'Demo D.', foto: null, aciertos: a, yo: true, creador: false },
        ].sort((x, y) => y.aciertos - x.aciertos),
      });
      return { duelo: { ...d, preguntas: undefined } };
    }
    case 'duelos':
      return { duelos: [...demoDuelos.values()].filter((d) => d.jugaste).map((d) => ({ ...d, preguntas: undefined })) };
  }
  return {};
}
