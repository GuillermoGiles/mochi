import { Flame, Swords } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Centro, QuizPreguntas, QuizShell } from '../components/Quiz';
import { Button, Spinner, errorText, useToast } from '../components/ui';
import { useFacu } from '../lib/context';
import type { Pregunta } from '../lib/datos';
import { compartir, crearDuelo, linkDuelo, sumarLiga } from '../lib/liga';
import { go } from '../lib/router';
import { hechoHoy, prepararRepaso, rachaActual, terminarRepaso } from '../lib/repaso';

type Fase =
  | { t: 'cargando' }
  | { t: 'hecho' }
  | { t: 'aviso'; aviso: string }
  | { t: 'jugando' }
  | { t: 'guardando' }
  | { t: 'fin'; racha: number; nueva: boolean };

// El repaso del día: 5 preguntas, una por una, y al final la racha. Uno por día: si ya lo hiciste, hasta mañana.
export default function RepasoScreen() {
  const { tree, reload } = useFacu();
  const toast = useToast();
  // Se mira solo al entrar: al terminar, el árbol se actualiza y tiene que seguir mostrándose la racha.
  const [fase, setFase] = useState<Fase>(() => (hechoHoy(tree.repaso) ? { t: 'hecho' } : { t: 'cargando' }));
  const [preguntas, setPreguntas] = useState<Pregunta[]>([]);
  const [respuestas, setRespuestas] = useState<number[]>([]);
  const [progreso, setProgreso] = useState(0);
  const [error, setError] = useState('');
  const [desafiando, setDesafiando] = useState(false);
  const yaHoy = hechoHoy(tree.repaso);

  useEffect(() => {
    if (fase.t === 'hecho') return;
    let alive = true;
    prepararRepaso(tree).then(
      (r) => {
        if (!alive) return;
        setPreguntas(r.preguntas);
        setFase(r.preguntas.length ? { t: 'jugando' } : { t: 'aviso', aviso: r.aviso ?? 'apuntes' });
      },
      (e) => alive && setFase({ t: 'aviso', aviso: errorText(e) }),
    );
    return () => {
      alive = false;
    };
    // Se prepara una sola vez al entrar (al guardar cambia el árbol y no hay que empezar de nuevo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const materiaDe = (p: Pregunta) => tree.materias.get(p.materiaId)?.name ?? 'Repaso';
  const aciertos = preguntas.filter((p, i) => respuestas[i] === p.ok).length;

  async function terminar(rs: number[]) {
    setRespuestas(rs);
    setFase({ t: 'guardando' });
    try {
      const racha = await terminarRepaso(
        tree,
        preguntas.map((p, i) => ({ id: p.id, acierto: rs[i] === p.ok })),
      );
      setFase({ t: 'fin', racha, nueva: !yaHoy });
      // Puntos para la liga (si estás en una). Si falla, no corta nada.
      sumarLiga(preguntas.filter((p, i) => rs[i] === p.ok).length, racha).catch(() => {});
      await reload();
    } catch (e) {
      setError(errorText(e));
      setFase({ t: 'jugando' });
    }
  }

  // Duelo: las mismas preguntas para un amigo, con un link.
  async function desafiar() {
    setDesafiando(true);
    try {
      const materias = [...new Set(preguntas.map(materiaDe))];
      const materia = materias.length === 1 ? materias[0] : 'Repaso';
      const id = await crearDuelo(materia, preguntas, respuestas);
      const r = await compartir(`Te desafío en Mochi: ${preguntas.length} preguntas de ${materia}. Yo acerté ${aciertos}, ¿vos?`, linkDuelo(id));
      if (r === 'copiado') toast('Link del duelo copiado: pegalo en WhatsApp');
    } catch (e) {
      toast(errorText(e));
    } finally {
      setDesafiando(false);
    }
  }

  const salir = () => go('/');

  return (
    <QuizShell
      progreso={fase.t === 'fin' || fase.t === 'guardando' ? 1 : progreso}
      salir={salir}
      derecha={
        <span className="flex items-center gap-1 font-extrabold text-orange-500 tabular-nums" title="Días seguidos">
          <Flame size={20} fill="currentColor" />
          {rachaActual(tree.repaso)}
        </span>
      }
    >
      {fase.t === 'cargando' && (
        <Centro>
          <Spinner />
          <p className="text-muted mt-3">Preparando tus preguntas…</p>
          <p className="text-sm text-muted mt-1 max-w-xs">La primera vez la IA lee un apunte tuyo, puede tardar unos segundos.</p>
        </Centro>
      )}

      {fase.t === 'hecho' && (
        <Centro>
          <Flame size={80} className="text-orange-500" fill="currentColor" />
          <p className="text-xl font-extrabold mt-3">Ya repasaste hoy</p>
          <p className="text-muted mt-1 max-w-xs">
            {rachaActual(tree.repaso) === 1 ? 'Llevás 1 día de racha.' : `Llevás ${rachaActual(tree.repaso)} días seguidos.`} Mañana te esperan las
            preguntas nuevas.
          </p>
          <Button variant="primary" className="mt-6 w-full max-w-xs h-12" onClick={salir}>
            Volver
          </Button>
          <Button variant="ghost" className="mt-2" onClick={() => go('/liga')}>
            Ver la liga
          </Button>
        </Centro>
      )}

      {fase.t === 'aviso' && (
        <Centro>
          <p className="font-bold text-lg">
            {fase.aviso === 'materias' ? 'Elegí qué estás cursando' : fase.aviso === 'apuntes' ? 'Todavía no hay de dónde sacar preguntas' : 'No se pudo armar el repaso'}
          </p>
          <p className="text-muted mt-1 max-w-xs">
            {fase.aviso === 'materias'
              ? 'Las preguntas salen de los apuntes de las materias que estás cursando o que te falta rendir. Marcalas en Inicio, en "Cursando ahora".'
              : fase.aviso === 'apuntes'
                ? 'Subí apuntes con texto (PDF, Word, dibujos de Excalidraw o fotos chicas) a las materias que estás cursando.'
                : fase.aviso}
          </p>
          <Button variant="primary" className="mt-5" onClick={salir}>
            Volver
          </Button>
        </Centro>
      )}

      {(fase.t === 'jugando' || fase.t === 'guardando') && (
        <QuizPreguntas
          preguntas={preguntas}
          etiqueta={(i) => materiaDe(preguntas[i])}
          onProgreso={setProgreso}
          onFin={terminar}
          guardando={fase.t === 'guardando'}
          error={error}
        />
      )}

      {fase.t === 'fin' && (
        <Centro>
          <Flame size={96} className="text-orange-500 racha-pop" fill="currentColor" />
          <p className="text-5xl font-extrabold text-orange-500 mt-2 tabular-nums">{fase.racha}</p>
          <p className="text-xl font-extrabold mt-1">
            {fase.racha === 1 ? (fase.nueva ? '¡Arrancaste tu racha!' : 'día de racha') : 'días seguidos'}
          </p>
          <p className="text-muted mt-3">
            Acertaste {aciertos} de {preguntas.length}.{' '}
            {fase.nueva ? 'Volvé mañana para no perder la racha.' : 'La racha de hoy ya estaba sumada.'}
          </p>
          <Button variant="primary" className="mt-6 w-full max-w-xs h-12" onClick={salir}>
            Listo
          </Button>
          <Button className="mt-2 w-full max-w-xs h-12" disabled={desafiando} onClick={desafiar}>
            <Swords size={18} /> {desafiando ? 'Armando el duelo…' : 'Desafiar a un amigo'}
          </Button>
        </Centro>
      )}
    </QuizShell>
  );
}
