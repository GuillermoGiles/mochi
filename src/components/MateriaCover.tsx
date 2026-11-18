import { ICONS, iconKey } from '../lib/materiaIcon';

type M = { name: string; color: string; icono?: string };

// Portada monocroma: el ícono de la materia en un recuadro con borde, y una versión grande y tenue de fondo.
export function MateriaCover({ m, className = '' }: { m: M; className?: string }) {
  const Icon = ICONS[iconKey(m)].icon;
  return (
    <div className={`relative overflow-hidden bg-sunken border-b border-line ${className}`} aria-hidden>
      <Icon className="absolute -right-4 -bottom-6 text-ink/[0.06] rotate-[-12deg]" size={110} strokeWidth={1.5} />
      <span className="absolute left-3.5 bottom-3 size-9 rounded-lg border border-line bg-surface grid place-items-center text-ink">
        <Icon size={18} strokeWidth={1.8} />
      </span>
    </div>
  );
}

// Solo el ícono de la materia, del tamaño del texto (para listas).
export function MateriaGlyph({ m, size = 14, className = '' }: { m: M; size?: number; className?: string }) {
  const Icon = ICONS[iconKey(m)].icon;
  return <Icon size={size} strokeWidth={2} className={`shrink-0 ${className}`} aria-hidden />;
}

// Ícono chico de la materia (para listas y encabezados).
export function MateriaBadge({ m, size = 36, className = '' }: { m: M; size?: number; className?: string }) {
  const Icon = ICONS[iconKey(m)].icon;
  return (
    <span
      className={`grid place-items-center shrink-0 bg-sunken border border-line text-ink ${className}`}
      style={{ width: size, height: size, borderRadius: size * 0.28 }}
      aria-hidden
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={1.8} />
    </span>
  );
}
