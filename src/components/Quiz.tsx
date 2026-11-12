import { useState, type ReactNode } from 'react';
import { baseName } from '../lib/files';
import { Close } from './icons';
import { Button, IconButton } from './ui';

// Preguntas de opción múltiple, una por una (las usan el repaso diario y los duelos).

export type QuizPregunta = { q: string; opciones: string[]; ok: number; por?: string; fuente?: string };

// Arriba: cerrar, la barra de avance y algo a la derecha (la racha, por ejemplo).
export function QuizShell({ progreso, derecha, salir, children }: { progreso: number; derecha?: ReactNode; salir: () => void; children: ReactNode }) {
  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 pb-12 safe-top min-h-[calc(100dvh-6rem)] flex flex-col">
      <header className="pt-4 pb-4 flex items-center gap-3">
        <IconButton label="Salir" onClick={salir}>
          <Close />
        </IconButton>
        <div className="flex-1 h-3 rounded-full bg-sunken overflow-hidden">
          <div className="h-full bg-success rounded-full transition-[width] duration-500" style={{ width: `${Math.round(progreso * 100)}%` }} />
        </div>
        {derecha}
      </header>
      {children}
    </div>
  );
}

export function Centro({ children }: { children: ReactNode }) {
  return <div className="flex-1 flex flex-col items-center justify-center text-center py-10">{children}</div>;
}

// onFin recibe la opción elegida en cada pregunta (en orden).
export function QuizPreguntas({
  preguntas,
  etiqueta,
  onProgreso,
  onFin,
  guardando = false,
  error,
}: {
  preguntas: QuizPregunta[];
  etiqueta: (i: number) => string;
  onProgreso: (p: number) => void;
  onFin: (respuestas: number[]) => void;
  guardando?: boolean;
  error?: string;
}) {
  const [i, setI] = useState(0);
  const [respuestas, setRespuestas] = useState<number[]>([]);
  const p = preguntas[i];
  const elegida = respuestas[i] ?? null;
  const respondida = elegida !== null;
  const ultima = i === preguntas.length - 1;

  function elegir(n: number) {
    if (respondida) return;
    setRespuestas((r) => [...r, n]);
    onProgreso((i + 1) / preguntas.length);
  }

  function seguir() {
    if (ultima) return onFin(respuestas);
    setI(i + 1);
  }

  if (!p) return null;
  return (
    <div className="flex-1 flex flex-col">
      <p className="text-sm font-semibold text-muted">
        {etiqueta(i)} · {i + 1} de {preguntas.length}
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
        <Button variant="primary" className="w-full h-12" disabled={!respondida || guardando} onClick={seguir}>
          {guardando ? 'Guardando…' : ultima ? 'Terminar' : 'Seguir'}
        </Button>
      </div>
    </div>
  );
}
