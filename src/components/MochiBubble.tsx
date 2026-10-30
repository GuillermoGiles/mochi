import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Route } from '../lib/router';
import { Chat } from '../screens/AsistenteScreen';
import { useLockScroll } from './ui';

// Círculo de Mochi abajo a la derecha: abre el chat encima de cualquier pantalla.
export default function MochiBubble({ route }: { route: Route }) {
  const [open, setOpen] = useState(false);
  // Una vez abierto queda montado (oculto al cerrarlo), así no se corta una respuesta a medias.
  const [mounted, setMounted] = useState(false);
  // En la compu el chat es un cuadro al costado y se puede seguir usando la página: solo se bloquea en el celu.
  useLockScroll(open && matchMedia('(max-width: 767px)').matches);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [open]);

  // En la pantalla del chat no hace falta; al abrir un archivo, el lector lo tapa.
  if (route.name === 'ia') return null;
  // En una materia del celu ya está el botón + abajo a la derecha: Mochi va arriba.
  const place = route.name === 'materia' ? 'bottom-[10.5rem] lg:bottom-6' : 'bottom-24 md:bottom-6';

  return (
    <>
      {!open && (
        <button
          onClick={() => {
            setMounted(true);
            setOpen(true);
          }}
          aria-label="Preguntale a Mochi"
          title="Preguntale a Mochi"
          className={`fixed right-4 md:right-6 ${place} z-40 size-14 rounded-full bg-accent text-on-accent shadow-lg grid place-items-center hover:scale-105 active:scale-95 transition`}
        >
          <Sparkles size={24} />
        </button>
      )}
      {mounted && (
        <div className={open ? '' : 'hidden'}>
          <div className="fixed inset-0 z-[55] bg-black/30 md:bg-transparent touch-none" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-label="Preguntale a Mochi"
            className="fixed z-[56] inset-x-0 bottom-0 top-[8dvh] rounded-t-3xl md:inset-auto md:right-6 md:bottom-6 md:w-[400px] md:h-[min(640px,calc(100dvh-3rem))] md:rounded-3xl bg-bg border border-line shadow-2xl flex flex-col overflow-hidden overscroll-contain sheet-up"
          >
            <Chat variant="panel" onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
