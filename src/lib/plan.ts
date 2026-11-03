// Planes de estudio de las carreras de la UTN FRLP que usan Mochi, con sus correlativas.
//   cursar: las que tenés que tener regularizadas (cursadas) para poder cursarla.
//   aprobar: las que tenés que tener aprobadas (con final) para poder cursarla.
// Las horas son las anuales del plan; se usan para el porcentaje de la carrera.

import type { Estado, Materia, Tree } from './facu';

export type PlanItem = {
  code: string;
  name: string;
  nivel: number;
  horas: number;
  cursar: string[];
  aprobar: string[];
  electiva?: boolean;
  // Otros nombres con los que puede estar tu carpeta.
  alias?: string[];
};

const m = (code: string, nivel: number, name: string, horas: number, cursar = '', aprobar = '', alias?: string[]): PlanItem => ({
  code,
  name,
  nivel,
  horas,
  cursar: cursar ? cursar.split('-') : [],
  aprobar: aprobar ? aprobar.split('-') : [],
  alias,
});
const e = (code: string, nivel: number, name: string, horas: number, cursar = '', aprobar = '', alias?: string[]): PlanItem => ({
  ...m(code, nivel, name, horas, cursar, aprobar, alias),
  electiva: true,
});

// Plan 2023 de Ingeniería en Sistemas de Información.
const SISTEMAS: PlanItem[] = [
  m('1', 1, 'Análisis Matemático I', 5, '', '', ['am1', 'analisis 1']),
  m('2', 1, 'Álgebra y Geometría Analítica', 5, '', '', ['algebra', 'aga']),
  m('3', 1, 'Física I', 5, '', '', ['fisica 1']),
  m('4', 1, 'Inglés I', 2, '', '', ['ingles 1']),
  m('5', 1, 'Lógica y Estructuras Discretas', 3, '', '', ['matematica discreta', 'discreta']),
  m('6', 1, 'Algoritmos y Estructuras de Datos', 5, '', '', ['algoritmos', 'aed']),
  m('7', 1, 'Arquitectura de Computadoras', 4, '', '', ['arquitecturas de computadoras', 'arquitectura']),
  m('8', 1, 'Sistemas y Procesos de Negocio', 3, '', '', ['sistemas y organizaciones', 'spn']),
  m('9', 2, 'Análisis Matemático II', 5, '1-2', '', ['am2', 'analisis 2']),
  m('10', 2, 'Física II', 5, '1-3', '', ['fisica 2']),
  m('11', 2, 'Ingeniería y Sociedad', 2),
  m('12', 2, 'Inglés II', 2, '4', '', ['ingles 2']),
  m('13', 2, 'Sintaxis y Semántica del Lenguaje', 4, '5-6', '', ['sintaxis', 'ssl']),
  m('14', 2, 'Paradigmas de Programación', 4, '5-6', '', ['paradigmas', 'pdp']),
  m('15', 2, 'Sistemas Operativos', 4, '7', '', ['so']),
  m('16', 2, 'Análisis de Sistemas de Información', 6, '6-8', '', ['analisis de sistemas', 'asi']),
  m('17', 3, 'Probabilidades y Estadística', 3, '1-2', '', ['probabilidad y estadistica', 'estadistica']),
  m('18', 3, 'Economía', 3, '', '1-2'),
  m('19', 3, 'Bases de Datos', 4, '13-16', '5-6', ['base de datos', 'bdd']),
  m('20', 3, 'Desarrollo de Software', 4, '14-16', '5-6', ['dds']),
  m('21', 3, 'Comunicación de Datos', 4, '', '3-7', ['comunicaciones de datos']),
  m('22', 3, 'Análisis Numérico', 3, '9', '1-2', ['calculo numerico']),
  m('23', 3, 'Diseño de Sistemas de Información', 6, '14-16', '4-6-8', ['diseno de sistemas', 'dsi']),
  m('24', 4, 'Legislación', 2, '11'),
  m('25', 4, 'Ingeniería y Calidad de Software', 3, '19-20-23', '13-14', ['ingenieria de software', 'calidad de software']),
  m('26', 4, 'Redes de Datos', 4, '15-21', '', ['redes']),
  m('27', 4, 'Investigación Operativa', 4, '17-22', '', ['io']),
  m('28', 4, 'Simulación', 3, '17', '9'),
  m('29', 4, 'Tecnologías para la Automatización', 3, '10-22', '9', ['automatizacion']),
  m('30', 4, 'Administración de Sistemas de Información', 6, '18-23', '16', ['administracion de sistemas']),
  m('31', 5, 'Inteligencia Artificial', 3, '28', '17-22', ['ia']),
  m('32', 5, 'Ciencia de Datos', 3, '28', '17-19'),
  m('33', 5, 'Sistemas de Gestión', 4, '18-27', '23'),
  m('34', 5, 'Gestión Gerencial', 3, '24-30', '18'),
  m('35', 5, 'Seguridad en los Sistemas de Información', 3, '26-30', '20-21', ['seguridad']),
  m('36', 5, 'Proyecto Final', 6, '25-26-30', '12-20-23'),
  e('E1', 3, 'Programación Concurrente', 2, '14-15'),
  e('E2', 3, 'Sistemas de Tiempo Real', 3, '15', '7'),
  e('E3', 3, 'Tecnología y Gestión Web', 2, '13-15', '6', ['tec y gestion web', 'tecnologias y gestion web']),
  e('E4', 3, 'Sistemas de Transmisión y Redes Inalámbricas', 2, '9', '7'),
  e('E5', 3, 'Responsabilidad Social e Institucional', 2, '8-16'),
  e('E6', 3, 'Comunicación Profesional', 3, '11', '8'),
  e('E7', 4, 'Administración de Base de Datos', 2, '19', '15', ['administracion de bases de datos']),
  e('E8', 4, 'Desarrollo de Software Cloud', 2, '15-20-23', '13-14'),
  e('E9', 4, 'Diseño Inclusivo para Usuarios con Discapacidad', 2, '23', '16', ['diseno inclusivo']),
  e('E10', 4, 'Metodología de la Investigación', 2, '', '23'),
  e('E11', 4, 'Metodologías Ágiles', 3, '19-20-23', '16'),
  e('E12', 4, 'Tecnología de Interfaces Interactivas', 2, '23', '16'),
  e('E13', 4, 'Tecnologías para la Explotación de la Información', 2, '17-23', '14'),
  e('E14', 4, 'Aplicaciones Móviles', 3, '14-23', '6'),
  e('E15', 5, 'Ingeniería en Calidad', 3, '30', '23'),
  e('E16', 5, 'Internetworking', 4, '30', '26'),
  e('E17', 5, 'Protocolos y Seguridad en Redes Inalámbricas', 2, '21-26', '9-10'),
  e('E18', 5, 'Sistemas en la Industria 4.0', 3, '19-21-25-26', '7'),
  e('E19', 5, 'Tecnologías de Información para la Gestión Empresarial', 2, '25', '23'),
  e('E20', 5, 'Emprendedorismo', 2, '18-24'),
];

// Para cursar las electivas de 5º de Industrial hay que tener aprobado todo el tercer nivel.
const NIVEL_III = '17-18-19-20-21-22-23-24-25';

// Plan 2023 de Ingeniería Industrial (correlativas de la Ord. 1909).
// Los códigos son los de la primera versión que tuvo Mochi (Ord. 1114), así lo que ya marcaron sigue en su lugar:
// en el plan 2023 Proyecto Final es la 42, Calidad la 40 y Control de Gestión la 41. Las electivas no están en
// la ordenanza (las define la facultad), así que quedan las que había.
const INDUSTRIAL: PlanItem[] = [
  m('1', 1, 'Análisis Matemático I', 5, '', '', ['am1', 'analisis 1']),
  m('2', 1, 'Química General', 5, '', '', ['quimica']),
  m('3', 1, 'Sistemas de Representación', 3, '', '', ['dibujo', 'representacion grafica']),
  m('4', 1, 'Informática I', 3, '', '', ['informatica 1']),
  m('5', 1, 'Pensamiento Sistémico', 3),
  m('6', 1, 'Física I', 5, '', '', ['fisica 1']),
  m('7', 1, 'Álgebra General y Geometría Analítica', 5, '', '', ['algebra y geometria analitica', 'algebra', 'aga']),
  m('8', 1, 'Ingeniería y Sociedad', 2),
  m('9', 2, 'Análisis Matemático II', 5, '1-7', '', ['am2', 'analisis 2']),
  m('10', 2, 'Administración General', 4, '4-5-7-8', '', ['administracion']),
  m('11', 2, 'Probabilidad y Estadística', 3, '1-7', '', ['probabilidades y estadistica', 'estadistica']),
  m('12', 2, 'Ciencia de los Materiales', 4, '2-6', '', ['materiales']),
  m('13', 2, 'Física II', 5, '1-6', '', ['fisica 2']),
  m('14', 2, 'Economía General', 4, '1-5-8', '', ['economia']),
  m('15', 2, 'Informática II', 3, '4', '', ['informatica 2']),
  m('16', 2, 'Inglés I', 2, '', '', ['ingles 1']),
  m('17', 3, 'Costos y Presupuestos', 3, '10-14', '1-4-5-7-8', ['costos']),
  m('18', 3, 'Estudio del Trabajo', 4, '10-11', '1-3-4-5-7-8'),
  m('19', 3, 'Comercialización', 3, '10-11-14', '1-4-5-7-8'),
  m('20', 3, 'Termodinámica y Máquinas Térmicas', 4, '2-13', '1-6', ['termodinamica']),
  m('21', 3, 'Estática y Resistencia de Materiales', 4, '9-12', '1-2-6-7', ['resistencia de materiales', 'estabilidad']),
  m('22', 3, 'Mecánica de los Fluidos', 3, '9', '1-6-7', ['mecanica de fluidos', 'fluidos']),
  m('23', 3, 'Economía de la Empresa', 3, '10-14', '1-4-5-7-8'),
  m('24', 3, 'Electrotecnia y Máquinas Eléctricas', 5, '13', '1-6', ['electrotecnia']),
  m('25', 3, 'Análisis Numérico y Cálculo Avanzado', 2, '9', '1-7', ['analisis numerico', 'calculo avanzado']),
  m('26', 4, 'Seguridad, Higiene e Ingeniería Ambiental', 3, '18', '10-11', ['higiene y seguridad', 'seguridad e higiene']),
  m('27', 4, 'Investigación Operativa', 4, '9-11-25', '1-7', ['io']),
  m('28', 4, 'Procesos Industriales', 5, '18-20-24', '2-10-12-13'),
  m('29', 4, 'Mecánica y Mecanismos', 3, '9', '1-6-7', ['mecanismos']),
  m('30', 4, 'Evaluación de Proyectos', 5, '17-18-19-23', '10-11-14-16'),
  m('31', 4, 'Planificación y Control de la Producción', 4, '18', '10-11', ['pcp']),
  m('32', 4, 'Diseño del Producto', 2, '15-19', '3-4-10-11-14', ['diseno de producto', 'diseno de productos']),
  m('33', 4, 'Inglés II', 2, '16', '', ['ingles 2']),
  m('34', 4, 'Instalaciones Industriales', 3, '20-21-22-24', '2-9-12-13'),
  m('35', 4, 'Legislación', 2, '', '10'),
  m('36', 5, 'Mantenimiento', 3, '34', '20-21-24'),
  m('37', 5, 'Manejo de Materiales y Distribución de Plantas', 3, '18-29', '9-10-21', ['distribucion de plantas', 'manejo de materiales']),
  m('38', 5, 'Comercio Exterior', 3, '30', '18-19-23'),
  m('39', 5, 'Relaciones Industriales', 3, '18', '10-11'),
  m('41', 5, 'Ingeniería en Calidad', 3, '18', '10-11', ['calidad']),
  m('42', 5, 'Control de Gestión', 3, '17-23', '10-14'),
  m('40', 5, 'Proyecto Final', 6, '25-26-27-28-30-31', '18-19-20-21-22-23-24-33'),
  e('E1', 4, 'Emprendedorismo', 2, '32-35', '17-19-23'),
  e('E2', 5, 'Logística', 3, '26-27-31-34', NIVEL_III),
  e('E3', 5, 'Simulación y Optimización', 3, '27-31', NIVEL_III, ['simulacion']),
  e('E4', 5, 'Finanzas y Control Empresario', 3, '30-35', NIVEL_III, ['finanzas']),
  e('E5', 5, 'Instrumentación y Automatización', 3, '28-31-34', NIVEL_III, ['automatizacion']),
  e('E6', 5, 'Gestión Pyme', 2, '30-31-32', NIVEL_III, ['pyme']),
  e('E7', 5, 'Gestión Ambiental', 2, '26-28-34', NIVEL_III),
  e('E8', 5, 'Responsabilidad Social Institucional', 2, '26', NIVEL_III, ['responsabilidad social e institucional']),
  e('E9', 5, 'Retórica Profesional', 3, '8-10-18-19', NIVEL_III, ['retorica']),
];

// La Práctica Profesional Supervisada (200 hs reloj) pesa en el porcentaje como una materia anual.
const PPS_PESO = 5;

export const NIVELES = ['Primer nivel', 'Segundo nivel', 'Tercer nivel', 'Cuarto nivel', 'Quinto nivel'];

// Lo que marcaste en la pantalla Carrera para materias que no tienen carpeta en Mochi.
export type PlanMark = { estado: Estado; nota?: number };

const STOP = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'para', 'con', 'a']);
export function normName(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\(.*?\)/g, ' ')
    .replace(/\btec\b\.?/g, 'tecnologia')
    .replace(/\bing\b\.?/g, 'ingenieria')
    .replace(/\biii\b/g, '3')
    .replace(/\bii\b/g, '2')
    .replace(/\bi\b/g, '1')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !STOP.has(w))
    .join(' ');
}

export type CarreraId = 'sistemas' | 'industrial';
export type Plan = {
  id: CarreraId;
  carrera: string;
  nombre: string;
  materias: PlanItem[];
  // Horas de electivas que pide el plan. No hay que hacerlas todas: alcanza con sumar esas horas.
  // Sin nivel = suman las electivas de cualquier nivel.
  electivas: { nivel?: number; pide: number }[];
  keys: Map<string, string>;
};

const plan = (id: CarreraId, carrera: string, nombre: string, materias: PlanItem[], electivas: Plan['electivas']): Plan => {
  const keys = new Map<string, string>();
  for (const p of materias) for (const n of [p.name, ...(p.alias ?? [])]) keys.set(normName(n), p.code);
  return { id, carrera, nombre, materias, electivas, keys };
};

export const PLANES: Plan[] = [
  // En 3º, 4 hs = dos electivas de 2 hs.
  plan('sistemas', 'Ingeniería en Sistemas de Información', 'UTN FRLP · Plan 2023', SISTEMAS, [
    { nivel: 3, pide: 4 },
    { nivel: 4, pide: 6 },
    { nivel: 5, pide: 10 },
  ]),
  plan('industrial', 'Ingeniería Industrial', 'UTN FRLP · Plan 2023', INDUSTRIAL, [{ pide: 10 }]),
];

// Sin carrera elegida es Sistemas: Mochi arrancó solo para Sistemas.
export const planOf = (tree: Pick<Tree, 'carrera'>) => PLANES.find((p) => p.id === tree.carrera) ?? PLANES[0];
export const electivasHoras = (p: Plan) => p.electivas.reduce((a, x) => a + x.pide, 0);

// Las marcas se guardan por código del plan: las de Sistemas sin prefijo (como siempre), las de otra carrera con el suyo,
// así cambiar de carrera no mezcla lo marcado.
export function markKey(tree: Pick<Tree, 'carrera'>, code: string) {
  const id = planOf(tree).id;
  return id === 'sistemas' ? code : `${id}:${code}`;
}
export const ppsKey = (tree: Pick<Tree, 'carrera'>) => markKey(tree, 'PPS');

// A qué materia del plan corresponde una carpeta de Mochi (por el nombre).
export function planCodeOf(plan: Plan, name: string) {
  return plan.keys.get(normName(name));
}

export type PlanState = 'aprobada' | 'final' | 'cursando' | null;
// key: dónde se guarda lo que marcaste para esta materia (ver markKey).
export type PlanRow = PlanItem & { key: string; state: PlanState; nota?: number; materia?: Materia };

// El estado de cada materia del plan: lo de tus carpetas manda; si no hay carpeta, lo que marcaste acá.
export function planRows(tree: Tree): PlanRow[] {
  const plan = planOf(tree);
  const linked = new Map<string, Materia>();
  for (const mt of tree.materias.values()) {
    const c = planCodeOf(plan, mt.name);
    // Si hay dos carpetas para la misma materia, gana la que tenga estado.
    if (c && (!linked.has(c) || (!linked.get(c)!.estado && mt.estado))) linked.set(c, mt);
  }
  return plan.materias.map((p) => {
    const mt = linked.get(p.code);
    const key = markKey(tree, p.code);
    const mark = tree.plan[key];
    if (mt?.estado) return { ...p, key, materia: mt, state: mt.estado, nota: mt.nota };
    return { ...p, key, materia: mt, state: mark?.estado ?? null, nota: mark?.nota };
  });
}

export const done = (s: PlanState) => s === 'aprobada';
export const regular = (s: PlanState) => s === 'aprobada' || s === 'final';

// Qué le falta para poder cursarla. Vacío = la podés cursar.
export function missing(row: PlanRow, byCode: Map<string, PlanRow>) {
  const out: { row: PlanRow; need: 'regular' | 'aprobada' }[] = [];
  for (const c of row.cursar) {
    const r = byCode.get(c)!;
    if (!regular(r.state)) out.push({ row: r, need: 'regular' });
  }
  for (const c of row.aprobar) {
    const r = byCode.get(c)!;
    if (!done(r.state)) out.push({ row: r, need: 'aprobada' });
  }
  return out;
}

// Porcentaje de la carrera según la carga horaria aprobada.
export function progress(tree: Tree) {
  const plan = planOf(tree);
  const rows = planRows(tree);
  const obligatorias = rows.filter((r) => !r.electiva);
  const electivas = rows.filter((r) => r.electiva);
  const total = obligatorias.reduce((a, r) => a + r.horas, 0) + electivasHoras(plan) + PPS_PESO;
  const porNivel = plan.electivas.map(({ nivel, pide }) => {
    const hechas = electivas.filter((r) => (!nivel || r.nivel === nivel) && done(r.state)).reduce((a, r) => a + r.horas, 0);
    return { nivel, pide, hechas, completo: hechas >= pide };
  });
  // Cada nivel suma como mucho lo que pide: hacer electivas de más no adelanta la carrera.
  const horasElectivas = porNivel.reduce((a, x) => a + Math.min(x.pide, x.hechas), 0);
  const pps = tree.plan[ppsKey(tree)]?.estado === 'aprobada';
  const hechas = obligatorias.filter((r) => done(r.state)).reduce((a, r) => a + r.horas, 0) + horasElectivas + (pps ? PPS_PESO : 0);
  return {
    plan,
    rows,
    porcentaje: Math.floor((hechas / total) * 100),
    aprobadas: obligatorias.filter((r) => done(r.state)).length,
    regulares: obligatorias.filter((r) => r.state === 'final').length,
    obligatorias: obligatorias.length,
    horasElectivas,
    electivasPorNivel: porNivel,
    pps,
  };
}
