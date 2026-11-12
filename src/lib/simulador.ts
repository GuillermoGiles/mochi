// Simulador de cursada: si cursás tantas materias por año y aprobás todo, ¿qué cursás cada año y cuándo terminás?
//
// Supuestos (los mismos que se le muestran al usuario):
//  - Lo que estás cursando ahora lo regularizás este año.
//  - Los finales los rendís en diciembre o febrero, antes de la próxima inscripción. O sea: lo que cursás
//    un año ya cuenta como aprobado para anotarte al año siguiente (también los finales que hoy debés).
//  - Cada año te anotás en lo que te dejan las correlativas, primero lo de los niveles más bajos.
//    Las electivas se suman cuando hacen falta horas de electivas de ese nivel.

import { regular, done, planRows, planOf, type PlanRow } from './plan';
import type { Tree } from './facu';

export type AnioSim = { anio: number; materias: PlanRow[] };
export type Simulacion = {
  anios: AnioSim[];
  // Último año de cursada (null si con estas reglas no se llega: no debería pasar).
  termina: number | null;
  yaTermino: boolean;
};

type S = PlanRow['state'];

// Cuántas materias por año propone de entrada: las que estás cursando ahora (entre 3 y 8), o 6.
export function ritmoInicial(tree: Tree) {
  const n = planRows(tree).filter((r) => r.state === 'cursando').length;
  return n ? Math.min(8, Math.max(3, n)) : 6;
}

// Año de la primera cursada simulada: en enero y febrero, este año; si no, el que viene.
export function primerAnio(now = new Date()) {
  return now.getMonth() < 2 ? now.getFullYear() : now.getFullYear() + 1;
}

export function simular(tree: Tree, ritmo: number, desde = primerAnio()): Simulacion {
  const plan = planOf(tree);
  const rows = planRows(tree);
  const state = new Map<string, S>(rows.map((r) => [r.code, r.state]));
  // Lo que estás cursando y los finales que debés: aprobados antes de la próxima inscripción.
  for (const [c, s] of state) if (s === 'cursando' || s === 'final') state.set(c, 'aprobada');

  const obligatorias = rows.filter((r) => !r.electiva);
  const electivas = rows.filter((r) => r.electiva);
  const puede = (r: PlanRow) => !state.get(r.code) && r.cursar.every((c) => regular(state.get(c) ?? null)) && r.aprobar.every((c) => done(state.get(c) ?? null));
  const horasFaltan = (nivel?: number) => {
    const pide = plan.electivas.find((x) => x.nivel === nivel)?.pide ?? 0;
    const hechas = electivas.filter((r) => (!nivel || r.nivel === nivel) && state.get(r.code)).reduce((a, r) => a + r.horas, 0);
    return Math.max(0, pide - hechas);
  };
  const faltaAlgo = () => obligatorias.some((r) => !state.get(r.code)) || plan.electivas.some((x) => horasFaltan(x.nivel) > 0);

  const yaTermino = !faltaAlgo();
  const anios: AnioSim[] = [];
  for (let anio = desde; faltaAlgo() && anios.length < 15; anio++) {
    const elegidas: PlanRow[] = [];
    // Nivel por nivel: primero las obligatorias y después las electivas que falten de ese nivel
    // (las de más horas primero, así se completa lo que pide el nivel con menos materias).
    const falta = new Map(plan.electivas.map((x) => [x.nivel, horasFaltan(x.nivel)]));
    for (let nivel = 1; nivel <= 5; nivel++) {
      for (const r of obligatorias) if (r.nivel === nivel && elegidas.length < ritmo && puede(r)) elegidas.push(r);
      const opciones = electivas.filter((r) => r.nivel === nivel && puede(r)).sort((a, b) => b.horas - a.horas);
      for (const r of opciones) {
        // Las horas que pide su nivel, o las del plan entero si el plan no las separa por nivel.
        const k = falta.has(nivel) ? nivel : undefined;
        if (elegidas.length >= ritmo || !((falta.get(k) ?? 0) > 0)) continue;
        elegidas.push(r);
        falta.set(k, (falta.get(k) ?? 0) - r.horas);
      }
    }
    // Sin nada para cursar: algo no se puede (no debería pasar con los planes cargados).
    if (!elegidas.length) return { anios, termina: null, yaTermino };
    for (const r of elegidas) state.set(r.code, 'aprobada');
    anios.push({ anio, materias: elegidas });
  }
  return { anios, termina: faltaAlgo() ? null : (anios.at(-1)?.anio ?? null), yaTermino };
}
