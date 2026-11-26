import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Close, SearchIcon } from '../components/icons';

// Barra para buscar palabras dentro del documento abierto.
// Enter: siguiente · Shift+Enter: anterior · Esc: cerrar.
export default function FindBar({
  count,
  current,
  busy,
  onQuery,
  onStep,
  onClose,
}: {
  count: number;
  current: number;
  busy?: boolean;
  onQuery: (q: string) => void;
  onStep: (dir: 1 | -1) => void;
  onClose: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');

  // Espera a que se termine de escribir antes de buscar.
  useEffect(() => {
    const t = setTimeout(() => onQuery(q), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // Ctrl+F con la barra ya abierta vuelve a seleccionar lo escrito.
  useEffect(() => {
    const focus = () => {
      input.current?.focus();
      input.current?.select();
    };
    focus();
    addEventListener('mochi:find', focus);
    return () => removeEventListener('mochi:find', focus);
  }, []);

  const empty = !q.trim();

  return (
    <div className="fixed z-20 top-[calc(3.5rem+env(safe-area-inset-top)+8px)] inset-x-3 sm:left-auto sm:right-4 sm:w-96 flex items-center gap-1 bg-surface border border-line rounded-2xl shadow-lg pl-3 pr-1 h-12 fade-in">
      <SearchIcon className="text-muted shrink-0" />
      <input
        ref={input}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onStep(e.shiftKey ? -1 : 1);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
        placeholder="Buscar en el documento"
        aria-label="Buscar en el documento"
        className="min-w-0 flex-1 bg-transparent outline-none px-1 text-[15px]"
        enterKeyHint="search"
      />
      <span className="text-xs text-muted tabular-nums shrink-0 px-1" aria-live="polite">
        {empty ? '' : busy ? 'Buscando…' : count ? `${current + 1} de ${count}` : 'Sin resultados'}
      </span>
      <button
        onClick={() => onStep(-1)}
        disabled={!count}
        aria-label="Anterior"
        title="Anterior (Shift+Enter)"
        className="size-9 rounded-full grid place-items-center hover:bg-sunken disabled:opacity-30 shrink-0"
      >
        <ChevronUp />
      </button>
      <button
        onClick={() => onStep(1)}
        disabled={!count}
        aria-label="Siguiente"
        title="Siguiente (Enter)"
        className="size-9 rounded-full grid place-items-center hover:bg-sunken disabled:opacity-30 shrink-0"
      >
        <ChevronDown />
      </button>
      <button
        onClick={onClose}
        aria-label="Cerrar búsqueda"
        title="Cerrar (Esc)"
        className="size-9 rounded-full grid place-items-center hover:bg-sunken shrink-0"
      >
        <Close />
      </button>
    </div>
  );
}
