import { useState } from 'react';
import { useFacu } from '../lib/context';
import { fmtNota, fmtPromedio, whenLabel } from '../lib/datos';
import { ESTADOS, setEstado, setIcono, upcomingExams, type Estado, type Materia } from '../lib/facu';
import { ICONS, guessIcon, iconKey } from '../lib/materiaIcon';
import { MateriaBadge } from './MateriaCover';
import { MateriaExams } from './Exams';
import { ApproveModal, MateriaGrades } from './Grades';
import { Calendar, ChevronRight, Note } from './icons';
import { Modal, errorText, useToast } from './ui';

export const estadoLabel = (m: Materia) =>
  m.estado === 'aprobada' && m.nota !== undefined
    ? `Aprobada con ${fmtNota(m.nota)}`
    : ESTADOS.find((e) => e.key === m.estado)?.label;

// Elegir si la estás cursando, te queda el final o la aprobaste.
export function EstadoPicker({ m }: { m: Materia }) {
  const { reload } = useFacu();
  const toast = useToast();
  const [approving, setApproving] = useState(false);
  const [busy, setBusy] = useState(false);

  async function pick(e: Estado | null) {
    if (e === 'aprobada') return setApproving(true);
    setBusy(true);
    try {
      await setEstado(m, e);
      await reload();
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {[...ESTADOS, { key: null, label: 'Sin cursar' }].map((e) => {
          const on = (m.estado ?? null) === e.key;
          return (
            <button
              key={e.label}
              disabled={busy}
              onClick={() => (on && e.key === 'aprobada' ? setApproving(true) : !on && pick(e.key))}
              className={`h-11 rounded-xl border-2 text-sm font-semibold transition ${
                on ? 'border-accent bg-accent-soft' : 'border-line hover:border-muted'
              }`}
            >
              {e.key === 'aprobada' && on && m.nota !== undefined ? `Aprobada · ${fmtNota(m.nota)}` : e.label}
            </button>
          );
        })}
      </div>
      {approving && <ApproveModal materia={m} onClose={() => setApproving(false)} />}
    </>
  );
}

export function MateriaInfoModal({ m, onClose }: { m: Materia; onClose: () => void }) {
  return (
    <Modal title={m.name} onClose={onClose}>
      <h3 className="font-semibold mb-2">Estado</h3>
      <EstadoPicker m={m} />
      <h3 className="font-semibold mt-6 mb-2">Ícono</h3>
      <IconPicker m={m} />
      <h3 className="font-semibold mt-6 mb-2">Fechas</h3>
      <MateriaExams materiaId={m.id} />
      <h3 className="font-semibold mb-2">Notas</h3>
      <MateriaGrades materiaId={m.id} />
    </Modal>
  );
}

// Por defecto el ícono se elige solo por el nombre; acá se puede cambiar.
function IconPicker({ m }: { m: Materia }) {
  const { reload } = useFacu();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const current = iconKey(m);
  const auto = guessIcon(m.name);

  async function pick(key: string | null) {
    setBusy(true);
    try {
      await setIcono(m, key);
      await reload();
      setOpen(false);
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="w-full flex items-center gap-3 p-2 -mx-2 rounded-2xl hover:bg-sunken text-left">
        <MateriaBadge m={m} size={44} />
        <span className="flex-1">
          <span className="font-semibold block">{ICONS[current].label}</span>
          <span className="text-sm text-muted">{m.icono ? 'Elegido por vos' : 'Elegido según el nombre'}</span>
        </span>
        <span className="text-sm font-semibold text-accent">Cambiar</span>
      </button>
    );

  return (
    <div>
      <div className="grid grid-cols-6 gap-2">
        {Object.entries(ICONS).map(([key, { icon: Icon, label }]) => (
          <button
            key={key}
            disabled={busy}
            title={label}
            aria-label={label}
            onClick={() => pick(key === auto ? null : key)}
            className={`aspect-square rounded-xl grid place-items-center transition ${
              key === current ? 'bg-accent text-on-accent' : 'bg-sunken text-muted hover:text-ink'
            }`}
          >
            <Icon size={20} strokeWidth={2} />
          </button>
        ))}
      </div>
      {m.icono && (
        <button disabled={busy} onClick={() => pick(null)} className="mt-3 text-sm font-semibold text-muted hover:text-ink">
          Volver al automático ({ICONS[auto].label})
        </button>
      )}
    </div>
  );
}

// Una línea con lo importante: próxima fecha y notas. Se toca para ver o editar todo.
export function MateriaSummary({ m, onOpen }: { m: Materia; onOpen: () => void }) {
  const { tree } = useFacu();
  const next = upcomingExams(tree, m.id)[0];
  const grades = tree.grades.filter((g) => g.materiaId === m.id);
  const estado = estadoLabel(m);
  return (
    <button
      onClick={onOpen}
      className="w-full flex items-center gap-3 text-left rounded-2xl bg-surface border border-line px-4 py-3 hover:bg-sunken transition"
    >
      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {estado && <span className="font-bold text-accent">{estado}</span>}
        <span className="flex items-center gap-1.5 min-w-0">
          <Calendar width={16} height={16} className="text-muted shrink-0" />
          {next ? (
            <span className="truncate">
              {next.title} · <b className="text-accent">{whenLabel(next.date).toLowerCase()}</b>
            </span>
          ) : (
            <span className="text-muted">Sin fechas</span>
          )}
        </span>
        <span className="flex items-center gap-1.5">
          <Note width={16} height={16} className="text-muted shrink-0" />
          {grades.length ? (
            <span>
              {grades.length} {grades.length === 1 ? 'nota' : 'notas'} · promedio{' '}
              <b>{fmtPromedio(grades.reduce((a, g) => a + g.nota, 0) / grades.length)}</b>
            </span>
          ) : (
            <span className="text-muted">Sin notas</span>
          )}
        </span>
      </div>
      <ChevronRight className="text-muted shrink-0" />
    </button>
  );
}
