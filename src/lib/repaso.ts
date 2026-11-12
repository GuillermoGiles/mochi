// Repaso diario con racha (como Duolingo): cada día, 5 preguntas sobre tus apuntes.
//  - Las preguntas las arma la IA con un apunte de una materia que estés cursando (o que te falte el final).
//  - Las que acertás vuelven cada vez más espaciadas; las que errás, al día siguiente.
//  - Terminar el repaso del día suma un día a la racha. Si un día no repasás, la racha vuelve a cero.
// Todo se guarda en el archivo de datos de Drive (datos.ts), así se ve igual en la compu y en el celu.

import { daysUntil, toISO, updateDatos, type Pregunta, type Repaso } from './datos';
import { materiaFiles, upcomingExams, type FileItem, type Materia, type Tree } from './facu';
import { fileBlob } from './fileBlob';
import { extOf, kindOf } from './files';
import { pedirPreguntas, readText } from './ia';

export const POR_DIA = 5;
// Cuántos días tarda en volver una pregunta según su caja (1 a 5).
const ESPERA = [0, 1, 3, 7, 14, 30];
// Las fotos se mandan enteras a la IA: solo las chicas.
const MAX_FOTO = 1_200_000;

const enDias = (n: number) => toISO(new Date(Date.now() + n * 86_400_000));
export const hoy = () => enDias(0);

export const repasoVacio = (): Repaso => ({ racha: 0, mejor: 0, preguntas: [], usados: [] });

// La racha que se ve: si no repasaste ni hoy ni ayer, ya se cortó.
export function rachaActual(r?: Repaso) {
  return r?.ultimo && daysUntil(r.ultimo) >= -1 ? r.racha : 0;
}
export const hechoHoy = (r?: Repaso) => r?.ultimo === hoy();

// Materias para repasar: las que estás cursando y las que te falta rendir el final.
export function materiasRepaso(tree: Tree) {
  return [...tree.materias.values()].filter((m) => m.estado === 'cursando' || m.estado === 'final');
}

// Si tiene un parcial o final en las próximas 2 semanas, va primero.
const urgente = (tree: Tree, m: Materia) => {
  const e = upcomingExams(tree, m.id)[0];
  return !!e && daysUntil(e.date) <= 14;
};

const legible = (f: FileItem) => {
  const k = kindOf(f);
  const e = extOf(f.name);
  if (k === 'pdf' || k === 'excalidraw' || e === 'docx' || ['txt', 'md'].includes(e)) return true;
  return k === 'image' && !['heic', 'heif', 'svg'].includes(e) && Number(f.size ?? 0) > 0 && Number(f.size) <= MAX_FOTO;
};

function base64(blob: Blob) {
  return new Promise<string>((ok, err) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1] ?? '');
    r.onerror = () => err(r.error);
    r.readAsDataURL(blob);
  });
}

// Arma preguntas nuevas con un apunte que todavía no se usó. Devuelve vacío si no encontró ninguno que sirva.
async function generar(tree: Tree, r: Repaso): Promise<{ nuevas: Pregunta[]; usados: string[] }> {
  const usados: string[] = [];
  const cuenta = (m: Materia) => r.preguntas.filter((p) => p.materiaId === m.id).length;
  // Primero las que tienen parcial cerca; después la que tiene menos preguntas, así van rotando.
  const materias = materiasRepaso(tree).sort((a, b) => Number(urgente(tree, b)) - Number(urgente(tree, a)) || cuenta(a) - cuenta(b));
  let intentos = 0;
  for (const m of materias) {
    const archivos = (await materiaFiles(tree, m))
      .filter((f) => legible(f) && !r.usados.includes(f.id))
      // Lo más nuevo primero: es lo que se está viendo en clase. El texto antes que las fotos.
      .sort((a, b) => Number(kindOf(a) === 'image') - Number(kindOf(b) === 'image') || b.modifiedTime.localeCompare(a.modifiedTime));
    for (const f of archivos.slice(0, 5)) {
      if (++intentos > 10) return { nuevas: [], usados };
      usados.push(f.id);
      let apunte: Parameters<typeof pedirPreguntas>[2];
      const chico = Number(f.size ?? 0) > 0 && Number(f.size) <= MAX_FOTO;
      if (kindOf(f) === 'image') apunte = { foto: { mimeType: f.mimeType, data: await base64(await fileBlob(f)) } };
      else {
        const texto = (await readText(f).catch(() => '')).slice(0, 30_000);
        if (texto.replace(/\s+/g, ' ').length >= 200) apunte = { texto };
        // PDF escaneado (sin texto): si es chico, la IA lo puede mirar como imagen.
        else if (kindOf(f) === 'pdf' && chico) apunte = { foto: { mimeType: 'application/pdf', data: await base64(await fileBlob(f)) } };
        // Un dibujo sin escribir o casi vacío: no alcanza para preguntar.
        else continue;
      }
      const qs = await pedirPreguntas(m.name, f.name, apunte);
      if (!qs.length) continue;
      const nuevas = qs.map((q) => ({
        id: crypto.randomUUID(),
        materiaId: m.id,
        q: q.pregunta.trim(),
        opciones: q.opciones.map((o) => o.trim()),
        ok: q.correcta,
        por: q.explicacion?.trim() || undefined,
        fuente: f.name,
        caja: 1,
        proxima: hoy(),
      }));
      return { nuevas, usados };
    }
  }
  return { nuevas: [], usados };
}

// Mezcla las opciones (la IA a veces pone la correcta siempre en el mismo lugar).
function mezclar(p: Pregunta): Pregunta {
  const orden = p.opciones.map((_, i) => i).sort(() => Math.random() - 0.5);
  return { ...p, opciones: orden.map((i) => p.opciones[i]), ok: orden.indexOf(p.ok) };
}

// Las preguntas del repaso de hoy: primero las que tocan repasar, y si faltan, nuevas.
// aviso: por qué no hay (o hay menos) preguntas, para mostrarlo.
export async function prepararRepaso(tree: Tree): Promise<{ preguntas: Pregunta[]; aviso?: string }> {
  const r = tree.repaso ?? repasoVacio();
  const activas = new Set(materiasRepaso(tree).map((m) => m.id));
  if (!activas.size) return { preguntas: [], aviso: 'materias' };
  const tocan = r.preguntas
    .filter((p) => activas.has(p.materiaId) && p.proxima <= hoy())
    .sort((a, b) => a.proxima.localeCompare(b.proxima) || a.caja - b.caja);
  let preguntas = tocan.slice(0, POR_DIA);
  let aviso: string | undefined;
  if (preguntas.length < POR_DIA) {
    try {
      let g = await generar(tree, r);
      // Ya se usaron todos los apuntes: se vuelve a empezar con los mismos (salen otras preguntas).
      if (!g.nuevas.length && r.usados.length) g = await generar(tree, { ...r, usados: [] });
      if (g.nuevas.length || g.usados.length) {
        await updateDatos(tree.rootId, (d) => {
          d.repaso = d.repaso ?? repasoVacio();
          d.repaso.preguntas.push(...g.nuevas);
          d.repaso.usados = [...new Set([...d.repaso.usados, ...g.usados])].slice(-300);
        });
      }
      preguntas = [...preguntas, ...g.nuevas].slice(0, POR_DIA);
      if (!preguntas.length) aviso = 'apuntes';
    } catch (e) {
      if (!preguntas.length) aviso = e instanceof Error ? e.message : 'No se pudieron armar las preguntas.';
    }
  }
  return { preguntas: preguntas.map(mezclar), aviso };
}

// Al terminar: cada pregunta pasa de caja según si la acertaste, y se suma el día a la racha.
export async function terminarRepaso(tree: Tree, resultados: { id: string; acierto: boolean }[]) {
  let racha = 0;
  await updateDatos(tree.rootId, (d) => {
    const r = (d.repaso = d.repaso ?? repasoVacio());
    for (const { id, acierto } of resultados) {
      const p = r.preguntas.find((x) => x.id === id);
      if (!p) continue;
      p.caja = acierto ? Math.min(5, p.caja + 1) : 1;
      p.proxima = enDias(acierto ? ESPERA[p.caja] : 1);
    }
    if (r.ultimo !== hoy()) {
      r.racha = r.ultimo && daysUntil(r.ultimo) === -1 ? r.racha + 1 : 1;
      r.ultimo = hoy();
      r.mejor = Math.max(r.mejor, r.racha);
    }
    racha = r.racha;
    // Que el archivo no crezca sin fin: se sacan las que ya te sabés bien.
    if (r.preguntas.length > 400) r.preguntas = r.preguntas.filter((p) => p.caja < 5).slice(-400);
  });
  return racha;
}
