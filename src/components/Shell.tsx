import { useEffect, type ReactNode } from 'react';
import { useFacu } from '../lib/context';
import { daysUntil } from '../lib/datos';
import { pendingEntregas, upcomingExams } from '../lib/facu';
import { go, type Route } from '../lib/router';
import { ClipboardCheck, GraduationCap } from 'lucide-react';
import { Calendar, HomeIcon, SearchIcon, UserIcon } from './icons';

const ITEMS = [
  { key: 'home', label: 'Inicio', path: '/', icon: HomeIcon },
  { key: 'search', label: 'Buscar', path: '/buscar', icon: SearchIcon },
  { key: 'entregas', label: 'Entregas', path: '/entregas', icon: ClipboardCheck },
  { key: 'fechas', label: 'Fechas', path: '/fechas', icon: Calendar },
  { key: 'carrera', label: 'Carrera', path: '/carrera', icon: GraduationCap },
  { key: 'yo', label: 'Vos', path: '/yo', icon: UserIcon },
] as const;

// Estructura de todas las pantallas: barra abajo en el celu, barra al costado en la compu.
export default function Shell({ route, children }: { route: Route; children: ReactNode }) {
  const { tree, user } = useFacu();
  const active = route.name === 'materia' ? 'home' : route.name;
  // Puntito en "Fechas" si hay algo en los próximos 3 días, y en "Entregas" si vence algo en 2 días o está atrasado.
  const soon = upcomingExams(tree).some((e) => {
    const [y, m, d] = e.date.split('-').map(Number);
    return (new Date(y, m - 1, d).getTime() - Date.now()) / 86_400_000 <= 3;
  });
  const due = pendingEntregas(tree).some((e) => daysUntil(e.date) <= 2);
  const dots: Record<string, boolean> = { fechas: soon, entregas: due };

  // Ctrl+K o "/" para buscar desde cualquier lado.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName);
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) {
        e.preventDefault();
        go('/buscar');
      }
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);

  return (
    <div className="min-h-dvh md:pl-20">
      {/* Compu: barra lateral */}
      <nav className="hidden md:flex fixed inset-y-0 left-0 z-30 w-20 flex-col items-center gap-1 py-4 border-r border-line bg-surface">
        <button onClick={() => go('/')} aria-label="Mochi" className="mb-4">
          <img src="/icon.svg" alt="" className="size-10 rounded-xl" />
        </button>
        {ITEMS.map((it) => (
          <NavButton key={it.key} item={it} on={active === it.key} dot={!!dots[it.key]} avatar={it.key === 'yo' ? user?.picture : undefined} />
        ))}
      </nav>

      <div key={active} className="fade-in pb-24 md:pb-0">
        {children}
      </div>

      {/* Celu: barra de abajo */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-surface/95 backdrop-blur border-t border-line safe-bottom !pb-[max(0.25rem,env(safe-area-inset-bottom))]">
        <div className="flex">
          {ITEMS.map((it) => (
            <NavButton key={it.key} item={it} on={active === it.key} dot={!!dots[it.key]} avatar={it.key === 'yo' ? user?.picture : undefined} />
          ))}
        </div>
      </nav>
    </div>
  );
}

function NavButton({
  item,
  on,
  dot,
  avatar,
}: {
  item: (typeof ITEMS)[number];
  on: boolean;
  dot: boolean;
  avatar?: string;
}) {
  const Icon = item.icon;
  return (
    <button
      onClick={() => go(item.path)}
      aria-current={on ? 'page' : undefined}
      className={`relative flex-1 md:flex-none md:w-16 flex flex-col items-center justify-center gap-1 h-14 md:h-16 rounded-2xl text-[11px] font-semibold transition ${
        on ? 'text-accent' : 'text-muted hover:text-ink'
      }`}
    >
      <span className={`grid place-items-center h-8 w-12 rounded-full transition ${on ? 'bg-accent-soft' : ''}`}>
        {avatar ? (
          <img
            src={avatar}
            alt=""
            referrerPolicy="no-referrer"
            className={`size-6 rounded-full object-cover ${on ? 'ring-2 ring-accent' : ''}`}
          />
        ) : (
          <Icon width={22} height={22} />
        )}
      </span>
      {item.label}
      {dot && <span className="absolute top-2 right-[calc(50%-18px)] size-2.5 rounded-full bg-urgent ring-2 ring-surface" />}
    </button>
  );
}
