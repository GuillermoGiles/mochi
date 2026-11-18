import { useState } from 'react';
import { useFacu } from '../lib/context';
import { calendarLink, dateLabel, daysUntil, toISO, updateDatos, type Entrega } from '../lib/datos';
import { pendingEntregas } from '../lib/facu';
import { go } from '../lib/router';
import { Calendar, Check, ChevronRight } from './icons';
import { Button, Modal, errorText } from './ui';

// "Mañana", "En 3 días", "Atrasada 2 días"…
export function dueLabel(e: Entrega) {
  if (e.done) return 'Entregada';
  const n = daysUntil(e.date);
  if (n < 0) return n === -1 ? 'Venció ayer' : `Venció hace ${-n} días`;
  if (n === 0) return 'Hoy';
  if (n === 1) return 'Mañana';
  return `En ${n} días`;
}

export function dueColor(e: Entrega) {
  if (e.done) return 'text-muted';
  const n = daysUntil(e.date);
  return n < 0 ? 'text-danger' : n <= 2 ? 'text-urgent' : 'text-muted';
}

// Marca o desmarca una entrega como entregada.
export async function toggleEntrega(rootId: string, id: string, done: boolean) {
  await updateDatos(rootId, (d) => {
    const e = d.entregas.find((x) => x.id === id);
    if (e) e.done = done;
  });
}

// El circulito para tildar: un toque y queda entregada.
export function DoneCheck({ e, onToggled }: { e: Entrega; onToggled?: () => void }) {
  const { tree, reload } = useFacu();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(e.done);
  return (
    <button
      onClick={async (ev) => {
        ev.stopPropagation();
        if (busy) return;
        setBusy(true);
        setDone(!done);
        try {
          await toggleEntrega(tree.rootId, e.id, !done);
          await reload();
          onToggled?.();
        } catch {
          setDone(done);
        }
        setBusy(false);
      }}
      aria-label={done ? `Marcar ${e.title} como pendiente` : `Marcar ${e.title} como entregada`}
      title={done ? 'Marcar como pendiente' : 'Marcar como entregada'}
      className="size-11 -m-1.5 grid place-items-center shrink-0 group"
    >
      <span
        className={`size-7 rounded-full border-2 grid place-items-center transition ${
          done ? 'bg-success border-success text-on-accent' : 'border-line group-hover:border-success'
        }`}
      >
        {done && <Check width={16} height={16} />}
      </span>
    </button>
  );
}

const SUGGESTIONS = ['TP', 'Actividad individual', 'Actividad grupal', 'Informe'];

// Crear, editar o borrar una entrega.
export function EntregaModal({ entrega, materiaId, onClose }: { entrega?: Entrega; materiaId?: string; onClose: () => void }) {
  const { tree, reload } = useFacu();
  const cursando = tree.years.flatMap((y) => y.materias.filter((m) => !m.aprobada));
  const first = cursando.find((m) => m.estado === 'cursando') ?? cursando[0];
  const [mid, setMid] = useState(entrega?.materiaId ?? materiaId ?? first?.id ?? '');
  const [title, setTitle] = useState(entrega?.title ?? '');
  const [desc, setDesc] = useState(entrega?.desc ?? '');
  const [date, setDate] = useState(entrega?.date ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<Entrega | null>(null);

  async function save(remove = false) {
    if (!remove && (!title.trim() || !date || !mid)) return setError('Completá qué hay que entregar y para cuándo.');
    setBusy(true);
    setError('');
    try {
      const next: Entrega = {
        id: entrega?.id ?? crypto.randomUUID(),
        materiaId: mid,
        title: title.trim(),
        desc: desc.trim() || undefined,
        date,
        done: entrega?.done ?? false,
      };
      await updateDatos(tree.rootId, (d) => {
        const i = d.entregas.findIndex((e) => e.id === entrega?.id);
        if (i >= 0) d.entregas.splice(i, 1);
        if (!remove) d.entregas.push(next);
      });
      await reload();
      if (remove || entrega) onClose();
      else setSaved(next);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  if (saved) {
    const materia = tree.materias.get(saved.materiaId);
    return (
      <Modal title="Entrega anotada" onClose={onClose}>
        <div className="flex items-center gap-3 mb-4">
          <span className="size-10 rounded-full bg-accent-soft text-accent grid place-items-center shrink-0">
            <Check />
          </span>
          <p>
            <b>{saved.title}</b> de {materia?.name}, para el {dateLabel(saved.date)}.
          </p>
        </div>
        <p className="text-muted text-[15px]">¿Querés que te avise antes? Agregala a tu Google Calendar.</p>
        <a
          href={calendarLink(saved, materia?.name ?? '')}
          target="_blank"
          rel="noreferrer"
          onClick={() => setTimeout(onClose, 300)}
          className="mt-5 h-11 w-full rounded-xl bg-accent text-on-accent font-semibold flex items-center justify-center gap-2 hover:brightness-110"
        >
          <Calendar /> Agregar a Google Calendar
        </a>
        <Button className="w-full mt-2" onClick={onClose}>
          No, gracias
        </Button>
      </Modal>
    );
  }

  const input = 'w-full h-12 px-4 rounded-xl bg-sunken border border-transparent focus:border-accent outline-none text-base';
  return (
    <Modal title={entrega ? 'Editar entrega' : 'Nueva entrega'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="font-semibold block mb-2">¿Qué hay que entregar?</label>
        <div className="flex gap-2 flex-wrap mb-2">
          {SUGGESTIONS.map((s) => (
            <button
              type="button"
              key={s}
              onClick={() => setTitle(s)}
              className={`h-9 px-3 rounded-full text-sm font-semibold border transition ${
                title === s ? 'bg-accent-soft border-accent' : 'border-line hover:bg-sunken'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="O escribilo: TP 3, Exposición…" className={`${input} mb-3`} />
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Detalle (opcional): Layout en React, video…"
          className={`${input} mb-4`}
        />

        <label className="font-semibold block mb-2">Materia</label>
        <select value={mid} onChange={(e) => setMid(e.target.value)} className="w-full h-12 px-3 rounded-xl bg-sunken outline-none text-base mb-4">
          {tree.years.map((y) => (
            <optgroup key={y.id} label={y.name}>
              {y.materias
                .filter((m) => !m.aprobada || m.id === mid)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>

        <label className="font-semibold block mb-2">Fecha de entrega</label>
        <div className="flex gap-2 mb-2">
          {[
            ['Mañana', 1],
            ['En una semana', 7],
          ].map(([l, n]) => {
            const iso = toISO(new Date(Date.now() + (n as number) * 86_400_000));
            return (
              <button
                type="button"
                key={l}
                onClick={() => setDate(iso)}
                className={`h-9 px-3 rounded-full text-sm font-semibold border transition ${
                  date === iso ? 'bg-accent-soft border-accent' : 'border-line hover:bg-sunken'
                }`}
              >
                {l}
              </button>
            );
          })}
        </div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />

        {error && <p className="text-danger mt-3 text-[15px]">{error}</p>}
        <div className="flex gap-3 mt-5">
          {entrega && (
            <Button type="button" variant="ghost" className="text-danger" disabled={busy} onClick={() => save(true)}>
              Borrar
            </Button>
          )}
          <Button variant="primary" className="flex-1" disabled={busy}>
            {busy ? 'Guardando…' : entrega ? 'Guardar' : 'Anotar entrega'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// Una fila de la lista: tilde, qué es, materia y cuándo.
export function EntregaRow({ e, showMateria = true, onEdit }: { e: Entrega; showMateria?: boolean; onEdit: () => void }) {
  const { tree } = useFacu();
  const m = tree.materias.get(e.materiaId);
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <DoneCheck key={String(e.done)} e={e} />
      <button onClick={onEdit} className="flex-1 min-w-0 text-left">
        <div className={`font-semibold truncate ${e.done ? 'line-through text-muted' : ''}`}>{e.title}</div>
        {e.desc && <div className="text-sm text-muted truncate">{e.desc}</div>}
        {showMateria && m && (
          <div className="flex items-center gap-1.5 text-sm text-muted min-w-0 mt-0.5">
            <span className="size-2.5 rounded-full shrink-0" style={{ background: m.color }} />
            <span className="truncate">{m.name}</span>
          </div>
        )}
      </button>
      <button onClick={onEdit} className="text-right shrink-0">
        <div className={`text-sm font-bold ${dueColor(e)}`}>{dueLabel(e)}</div>
        <div className="text-xs text-muted capitalize">{dateLabel(e.date)}</div>
      </button>
    </div>
  );
}

// En el inicio: lo próximo para entregar (y lo atrasado), con el tilde a mano.
export function NextEntregas() {
  const { tree } = useFacu();
  const [editing, setEditing] = useState<Entrega | null>(null);
  const items = pendingEntregas(tree).filter((e) => daysUntil(e.date) <= 14);
  if (!items.length) return null;
  return (
    <section className="mt-9">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold">Para entregar</h2>
        <button onClick={() => go('/entregas')} className="flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
          Ver todas <ChevronRight width={16} height={16} />
        </button>
      </div>
      <div className="bg-surface border border-line rounded-3xl divide-y divide-line overflow-hidden">
        {items.slice(0, 4).map((e) => (
          <EntregaRow key={e.id} e={e} onEdit={() => setEditing(e)} />
        ))}
      </div>
      {editing && <EntregaModal entrega={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}
