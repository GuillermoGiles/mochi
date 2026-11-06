import { useState, type ReactNode } from 'react';
import { ChevronRight, Folder, Logout, Share, Sun } from '../components/icons';
import { MateriaBadge } from '../components/MateriaCover';
import { useToast } from '../components/ui';
import { useFacu } from '../lib/context';
import { DATOS_ID, fmtNota, fmtPromedio } from '../lib/datos';
import { clearLists } from '../lib/offline';
import { promedio } from '../lib/facu';
import { go } from '../lib/router';
import { getTheme, setTheme, type Theme } from '../lib/theme';
import { ownKey, setOwnKey } from '../lib/ia';

// Tu perfil: cómo vas en la carrera y los ajustes de la app.
export default function YoScreen() {
  const { tree, user } = useFacu();
  const toast = useToast();
  const [theme, setT] = useState<Theme>(getTheme);
  const materias = [...tree.materias.values()];
  const aprobadas = materias.filter((m) => m.aprobada);
  const cursando = materias.filter((m) => m.estado === 'cursando');
  const finales = materias.filter((m) => m.estado === 'final');
  const p = promedio(tree);

  async function invite() {
    // "?invitar": WhatsApp tiene guardada una vista previa vieja (sin logo) de la página principal.
    const url = `${location.origin}/?invitar`;
    const data = { title: 'Mochi', text: 'Organizá tus apuntes de la facu con Mochi', url };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(url);
        toast('Link copiado. Pasáselo a tus compañeros.');
      }
    } catch {}
  }

  // Borra lo guardado en el celu (carpetas, fechas y quién sos) antes de salir.
  async function logout() {
    await clearLists();
    try {
      localStorage.removeItem('mochi:user');
      localStorage.removeItem(DATOS_ID);
    } catch {}
    location.href = '/api/logout';
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-12 safe-top">
      <header className="flex items-center gap-4 pt-6 pb-6">
        {user?.picture ? (
          <img src={user.picture} alt="" referrerPolicy="no-referrer" className="size-16 rounded-full object-cover" />
        ) : (
          <span className="size-16 rounded-full bg-accent-soft text-accent text-2xl font-bold grid place-items-center">
            {(user?.name ?? '?').charAt(0)}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight truncate">{user?.name}</h1>
          <p className="text-sm text-muted truncate">{user?.email}</p>
        </div>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <Stat value={p ? fmtPromedio(p.valor) : '—'} label="Promedio" accent />
        <Stat value={String(aprobadas.length)} label={aprobadas.length === 1 ? 'Aprobada' : 'Aprobadas'} />
        <Stat value={String(cursando.length)} label="Cursando" />
        <Stat value={String(finales.length)} label={finales.length === 1 ? 'Final pendiente' : 'Finales pendientes'} />
      </section>

      {aprobadas.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-bold text-muted mb-2">Notas finales</h2>
          <div className="bg-surface border border-line rounded-3xl divide-y divide-line overflow-hidden">
            {aprobadas.map((m) => (
              <button key={m.id} onClick={() => go(`/m/${m.id}`)} className="w-full flex items-center gap-3 px-4 h-14 text-left hover:bg-sunken">
                <MateriaBadge m={m} size={30} />
                <span className="flex-1 truncate font-medium">{m.name}</span>
                <span className="font-extrabold">{m.nota !== undefined ? fmtNota(m.nota) : <span className="text-muted font-medium text-sm">sin nota</span>}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="mb-8">
        <h2 className="text-sm font-bold text-muted mb-2">Apariencia</h2>
        <div className="bg-surface border border-line rounded-3xl p-2 flex gap-1">
          {(
            [
              ['auto', 'Automático'],
              ['light', 'Claro'],
              ['dark', 'Oscuro'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => {
                setTheme(k);
                setT(k);
              }}
              className={`flex-1 h-11 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 transition ${
                theme === k ? 'bg-accent-soft text-accent' : 'text-muted hover:text-ink'
              }`}
            >
              {k === 'auto' && <Sun width={16} height={16} />}
              {label}
            </button>
          ))}
        </div>
      </section>

      <GeminiKey />

      <section className="bg-surface border border-line rounded-3xl divide-y divide-line overflow-hidden">
        <Row icon={<Share />} label="Invitar a un compañero" onClick={invite} />
        {tree.rootLink && <Row icon={<Folder />} label="Ver mis apuntes en Google Drive" href={tree.rootLink} />}
        <Row icon={<ChevronRight />} label="Política de privacidad" href="/privacidad.html" />
        <Row icon={<Logout />} label="Cerrar sesión" onClick={logout} danger />
      </section>
    </div>
  );
}

// Clave propia de Gemini: sin el límite diario compartido. Se guarda solo en este dispositivo.
function GeminiKey() {
  const toast = useToast();
  const [saved, setSaved] = useState(() => !!ownKey());
  const [value, setValue] = useState('');
  return (
    <section className="mb-8">
      <h2 className="text-sm font-bold text-muted mb-2">Preguntale a Mochi</h2>
      <div className="bg-surface border border-line rounded-3xl p-4">
        {saved ? (
          <div className="flex items-center gap-3">
            <p className="flex-1 text-[15px]">Estás usando tu propia clave de Gemini: no tenés límite diario.</p>
            <button
              onClick={() => {
                setOwnKey('');
                setSaved(false);
              }}
              className="text-sm font-semibold text-danger shrink-0"
            >
              Quitar
            </button>
          </div>
        ) : (
          <>
            <p className="text-[15px] text-muted">
              Con la clave de Mochi tenés unas preguntas por día. Si querés más, creá tu propia clave gratis en{' '}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-accent font-semibold underline">
                Google AI Studio
              </a>{' '}
              y pegala acá. Se guarda solo en este dispositivo.
            </p>
            <form
              className="flex gap-2 mt-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!value.trim()) return;
                setOwnKey(value);
                setValue('');
                setSaved(true);
                toast('Listo, ahora usás tu propia clave');
              }}
            >
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="AIza…"
                autoComplete="off"
                className="flex-1 min-w-0 h-11 px-4 rounded-xl bg-sunken border border-transparent focus:border-accent outline-none"
              />
              <button className="h-11 px-4 rounded-xl bg-accent text-on-accent font-semibold">Guardar</button>
            </form>
          </>
        )}
      </div>
    </section>
  );
}

function Stat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="bg-surface border border-line rounded-2xl p-4">
      <div className={`text-3xl font-extrabold ${accent ? 'text-accent' : ''}`}>{value}</div>
      <div className="text-sm text-muted mt-1">{label}</div>
    </div>
  );
}

function Row({
  icon,
  label,
  onClick,
  href,
  danger,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
}) {
  const cls = `w-full flex items-center gap-3 px-4 h-14 text-left hover:bg-sunken ${danger ? 'text-danger' : ''}`;
  const inner = (
    <>
      <span className="opacity-80">{icon}</span>
      <span className="font-medium">{label}</span>
    </>
  );
  return href ? (
    <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className={cls}>
      {inner}
    </a>
  ) : (
    <button onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}
