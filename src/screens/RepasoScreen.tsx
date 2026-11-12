import { Flame } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Close } from '../components/icons';
import { Button, IconButton, Spinner, errorText } from '../components/ui';
import { useFacu } from '../lib/context';
import type { Pregunta } from '../lib/datos';
import { baseName } from '../lib/files';
import { go } from '../lib/router';
import { hechoHoy, prepararRepaso, rachaActual, terminarRepaso } from '../lib/repaso';

type Fase = { t: 'cargando' } | { t: 'aviso'; aviso: string } | { t: 'jugando' } | { t: 'guardando' } | { t: 'fin'; racha: number; nueva: boolean };

// El repaso del día: 5 preguntas, una por una, y al final la racha.
export default function RepasoScreen() {
  const { tree, reload } = useFacu();
  const [fase, setFase] = useState<Fase>({ t: 'cargando' });
  const [preguntas, setPreguntas] = useState<Pregunta[]>([]);
  const [i, setI] = useState(0);
  const [elegida, setElegida] = useState<number | null>(null);
  const [resultados, setResultados] = useState<{ id: string; acierto: boolean }[]>([]);
  const [error, setError] = useState('');
  const yaHoy = hechoHoy(tree.repaso);

  useEffect(() => {
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

  const p = preguntas[i];
  const respondida = elegida !== null;

  function elegir(n: number) {
    if (respondida) return;
    setElegida(n);
    setResultados((r) => [...r, { id: p.id, acierto: n === p.ok }]);
  }

  async function seguir() {
    if (i < preguntas.length - 1) {
      setI(i + 1);
      setElegida(null);
      return;
    }
    setFase({ t: 'guardando' });
    try {
      const racha = await terminarRepaso(tree, resultados);
      setFase({ t: 'fin', racha, nueva: !yaHoy });
      await reload();
    } catch (e) {
      setError(errorText(e));
      setFase({ t: 'jugando' });
    }
  }

  const salir = () => go('/');

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 pb-12 safe-top min-h-[calc(100dvh-6rem)] flex flex-col">
      <header className="pt-4 pb-4 flex items-center gap-3">
        <IconButton label="Salir del repaso" onClick={salir}>
          <Close />
        </IconButton>
        <div className="flex-1 h-3 rounded-full bg-sunken overflow-hidden">
          <div
            className="h-full bg-success rounded-full transition-[width] duration-500"
            style={{ width: `${preguntas.length ? ((i + (respondida ? 1 : 0)) / preguntas.length) * 100 : 0}%` }}
          />
        </div>
        <span className="flex items-center gap-1 font-extrabold text-orange-500 tabular-nums" title="Días seguidos">
          <Flame size={20} fill="currentColor" />
          {rachaActual(tree.repaso)}
        </span>
      </header>

      {fase.t === 'cargando' && (
        <Centro>
          <Spinner />
          <p className="text-muted mt-3">Preparando tus preguntas…</p>
          <p className="text-sm text-muted mt-1 max-w-xs">La primera vez la IA lee un apunte tuyo, puede tardar unos segundos.</p>
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

      {(fase.t === 'jugando' || fase.t === 'guardando') && p && (
        <div className="flex-1 flex flex-col">
          <p className="text-sm font-semibold text-muted">
            {tree.materias.get(p.materiaId)?.name ?? 'Repaso'} · {i + 1} de {preguntas.length}
          </p>
          <h1 className="text-xl font-extrabold leading-snug mt-2 mb-5">{p.q}</h1>
          <div className="space-y-2.5">
            {p.opciones.map((o, n) => {
              const estilo = !respondida
                ? 'border-line bg-surface hover:border-accent active:scale-[0.99]'
                : n === p.ok
                  ? 'border-success bg-success/10'
                  : n === elegida
                    ? 'border-danger bg-danger/10'
                    : 'border-line bg-surface opacity-50';
              return (
                <button
                  key={n}
                  onClick={() => elegir(n)}
                  disabled={respondida}
                  className={`w-full text-left rounded-2xl border-2 px-4 py-3.5 text-[16px] font-medium transition ${estilo}`}
                >
                  {o}
                </button>
              );
            })}
          </div>

          {respondida && (
            <div className={`mt-5 rounded-2xl p-4 fade-in ${elegida === p.ok ? 'bg-success/10' : 'bg-danger/10'}`}>
              <p className={`font-extrabold ${elegida === p.ok ? 'text-success' : 'text-danger'}`}>
                {elegida === p.ok ? '¡Bien!' : `La correcta era: ${p.opciones[p.ok]}`}
              </p>
              {p.por && <p className="text-[15px] mt-1">{p.por}</p>}
              {p.fuente && <p className="text-xs text-muted mt-2">Sale de {baseName(p.fuente)}</p>}
            </div>
          )}
          {error && <p className="text-danger mt-3 text-[15px]">{error}</p>}

          <div className="mt-auto pt-6">
            <Button variant="primary" className="w-full h-12" disabled={!respondida || fase.t === 'guardando'} onClick={seguir}>
              {fase.t === 'guardando' ? 'Guardando…' : i < preguntas.length - 1 ? 'Seguir' : 'Terminar'}
            </Button>
          </div>
        </div>
      )}

      {fase.t === 'fin' && (
        <Centro>
          <Flame size={96} className="text-orange-500 racha-pop" fill="currentColor" />
          <p className="text-5xl font-extrabold text-orange-500 mt-2 tabular-nums">{fase.racha}</p>
          <p className="text-xl font-extrabold mt-1">
            {fase.racha === 1 ? (fase.nueva ? '¡Arrancaste tu racha!' : 'día de racha') : 'días seguidos'}
          </p>
          <p className="text-muted mt-3">
            Acertaste {resultados.filter((r) => r.acierto).length} de {resultados.length}.{' '}
            {fase.nueva ? 'Volvé mañana para no perder la racha.' : 'La racha de hoy ya estaba sumada.'}
          </p>
          <Button variant="primary" className="mt-6 w-full max-w-xs h-12" onClick={salir}>
            Listo
          </Button>
        </Centro>
      )}
    </div>
  );
}

function Centro({ children }: { children: React.ReactNode }) {
  return <div className="flex-1 flex flex-col items-center justify-center text-center py-10">{children}</div>;
}
