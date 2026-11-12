import { Flame, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ligaGuardada } from '../lib/liga';
import { useFacu } from '../lib/context';
import { hechoHoy, materiasRepaso, rachaActual, POR_DIA } from '../lib/repaso';
import { go } from '../lib/router';
import { ChevronRight } from './icons';

// En Inicio, abajo de la racha: cómo vas en la liga (lo último que se vio), o la invitación a armar una.
export function LigaLink() {
  const [liga, setLiga] = useState(ligaGuardada);
  useEffect(() => {
    const f = () => setLiga(ligaGuardada());
    addEventListener('mochi:liga', f);
    return () => removeEventListener('mochi:liga', f);
  }, []);
  const pos = liga ? liga.miembros.findIndex((m) => m.yo) + 1 : 0;
  return (
    <button onClick={() => go('/liga')} className="mt-2 w-full flex items-center gap-2 px-4 h-11 rounded-2xl text-[15px] text-left hover:bg-sunken transition">
      <Trophy size={18} className="text-amber-500 shrink-0" />
      <span className="flex-1 min-w-0 truncate">
        {liga && pos ? (
          <>
            {liga.nombre}: <b>vas {pos}º</b> con {liga.miembros[pos - 1].puntos} puntos
          </>
        ) : (
          'Liga y duelos con tus compañeros'
        )}
      </span>
      <ChevronRight width={18} height={18} className="text-muted shrink-0" />
    </button>
  );
}

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

  // Ya repasaste hoy: solo muestra la racha, el próximo repaso es mañana.
  const Tag = hecho ? 'div' : 'button';
  return (
    <Tag
      onClick={hecho ? undefined : () => go('/repaso')}
      className={`mt-4 w-full flex items-center gap-4 rounded-3xl border p-4 text-left transition ${hecho ? '' : 'hover:border-accent'} ${
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
    </Tag>
  );
}
