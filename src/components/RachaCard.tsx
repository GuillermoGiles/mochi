import { Flame } from 'lucide-react';
import { useFacu } from '../lib/context';
import { hechoHoy, materiasRepaso, rachaActual, POR_DIA } from '../lib/repaso';
import { go } from '../lib/router';
import { ChevronRight } from './icons';

// En Inicio: la racha de días seguidos y el botón para el repaso de hoy.
export default function RachaCard() {
  const { tree } = useFacu();
  const r = tree.repaso;
  // Sin materias para repasar y sin haber empezado nunca: no se muestra.
  if (!r && !materiasRepaso(tree).length) return null;
  const racha = rachaActual(r);
  const hecho = hechoHoy(r);
  // Con racha y sin repasar hoy: se pierde a la noche.
  const peligro = racha > 0 && !hecho;

  return (
    <button
      onClick={() => go('/repaso')}
      className={`mt-4 w-full flex items-center gap-4 rounded-3xl border p-4 text-left transition hover:border-accent ${
        peligro ? 'border-orange-400 bg-orange-500/10' : 'border-line bg-surface'
      }`}
    >
      <span className={`flex flex-col items-center shrink-0 w-12 ${racha > 0 ? 'text-orange-500' : 'text-muted'}`}>
        <Flame size={30} fill={racha > 0 ? 'currentColor' : 'none'} />
        <span className="text-lg font-extrabold leading-none mt-0.5 tabular-nums">{racha}</span>
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-bold">
          {hecho ? 'Ya repasaste hoy' : peligro ? `¡No pierdas tu racha de ${racha} ${racha === 1 ? 'día' : 'días'}!` : 'Repaso de hoy'}
        </span>
        <span className="block text-[15px] text-muted">
          {hecho
            ? 'Volvé mañana para sumar otro día.'
            : `${POR_DIA} preguntas de tus apuntes · 2 minutos`}
        </span>
      </span>
      {!hecho && (
        <span className="shrink-0 inline-flex items-center gap-1 font-semibold text-accent">
          Empezar <ChevronRight width={18} height={18} />
        </span>
      )}
    </button>
  );
}
