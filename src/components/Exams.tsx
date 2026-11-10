import { useState } from 'react';
import { useFacu } from '../lib/context';
import { calendarLink, dateLabel, daysUntil, toISO, updateDatos, whenLabel, type Exam } from '../lib/datos';
import { upcomingExams } from '../lib/facu';
import { Calendar, Check, Plus } from './icons';
import { Button, Modal, errorText } from './ui';

const SUGGESTIONS = ['Parcial 1', 'Parcial 2', 'Recuperatorio', 'Final', 'Coloquio'];

// Crear, editar o borrar una fecha.
export function ExamModal({ exam, materiaId, defaultDate, onClose }: { exam?: Exam; materiaId?: string; defaultDate?: string; onClose: () => void }) {
  const { tree, reload } = useFacu();
  const cursando = tree.years.flatMap((y) => y.materias.filter((m) => !m.aprobada).map((m) => ({ m, y })));
  const [mid, setMid] = useState(exam?.materiaId ?? materiaId ?? cursando[0]?.m.id ?? '');
  const [title, setTitle] = useState(exam?.title ?? '');
  const [date, setDate] = useState(exam?.date ?? defaultDate ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<Exam | null>(null);

  async function save(remove = false) {
    if (!remove && (!title.trim() || !date || !mid)) return setError('Completá qué es y la fecha.');
    setBusy(true);
    setError('');
    try {
      const next: Exam = { id: exam?.id ?? crypto.randomUUID(), materiaId: mid, title: title.trim(), date };
      await updateDatos(tree.rootId, (d) => {
        d.exams = d.exams.filter((e) => e.id !== exam?.id);
        if (!remove) d.exams.push(next);
        // De paso, limpia fechas viejas de hace más de un mes.
        d.exams = d.exams.filter((e) => daysUntil(e.date) > -30);
      });
      await reload();
      if (remove) onClose();
      else setSaved(next);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  if (saved) {
    const materia = tree.materias.get(saved.materiaId);
    return (
      <Modal title="Fecha guardada" onClose={onClose}>
        <div className="flex items-center gap-3 mb-4">
          <span className="size-10 rounded-full bg-accent-soft text-accent grid place-items-center shrink-0">
            <Check />
          </span>
          <p>
            <b>{saved.title}</b> de {materia?.name}, {dateLabel(saved.date)}.
          </p>
        </div>
        <p className="text-muted text-[15px]">
          ¿Querés que te avise antes? Agregala a tu Google Calendar y te llega la notificación al celu.
        </p>
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

  return (
    <Modal title={exam ? 'Editar fecha' : 'Nueva fecha'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="font-semibold block mb-2">Materia</label>
        <select
          value={mid}
          onChange={(e) => setMid(e.target.value)}
          className="w-full h-12 px-3 rounded-xl bg-sunken outline-none text-base mb-4"
        >
          {tree.years.map((y) => (
            <optgroup key={y.id} label={y.name}>
              {y.materias
                .filter((m) => !m.aprobada)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>

        <label className="font-semibold block mb-2">¿Qué es?</label>
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
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="O escribilo: Parcial integrador…"
          className="w-full h-12 px-4 rounded-xl bg-sunken border border-transparent focus:border-accent outline-none text-base mb-4"
        />

        <label className="font-semibold block mb-2">Fecha</label>
        <input
          type="date"
          value={date}
          min={toISO(new Date())}
          onChange={(e) => setDate(e.target.value)}
          className="w-full h-12 px-4 rounded-xl bg-sunken border border-transparent focus:border-accent outline-none text-base"
        />

        {error && <p className="text-danger mt-3 text-[15px]">{error}</p>}
        {exam && (
          <a
            href={calendarLink(exam, tree.materias.get(exam.materiaId)?.name ?? '')}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink"
          >
            <Calendar width={16} height={16} /> Agregar a Google Calendar
          </a>
        )}
        <div className="flex gap-3 mt-5">
          {exam && (
            <Button type="button" variant="ghost" className="text-danger" disabled={busy} onClick={() => save(true)}>
              Borrar
            </Button>
          )}
          <Button variant="primary" className="flex-1" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar fecha'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function urgency(iso: string) {
  const n = daysUntil(iso);
  return n <= 3 ? 'text-accent' : n <= 7 ? 'text-ink' : 'text-muted';
}

// Tarjetas "Próximas fechas" del inicio.
export function UpcomingExams() {
  const { tree } = useFacu();
  const [editing, setEditing] = useState<Exam | 'new' | null>(null);
  const exams = upcomingExams(tree).slice(0, 8);

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold">Próximas fechas</h2>
        <button onClick={() => setEditing('new')} className="flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
          <Plus /> Agregar fecha
        </button>
      </div>
      {exams.length === 0 ? (
        <button
          onClick={() => setEditing('new')}
          className="w-full rounded-2xl border border-dashed border-line px-4 py-4 text-left text-muted hover:border-accent transition"
        >
          Anotá tu próximo parcial y te vamos avisando cuántos días faltan.
        </button>
      ) : (
        <div className="flex gap-3 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 [scrollbar-width:none]">
          {exams.map((e) => {
            const m = tree.materias.get(e.materiaId)!;
            return (
              <button
                key={e.id}
                onClick={() => setEditing(e)}
                className="shrink-0 w-48 text-left bg-surface border border-line rounded-2xl p-4 hover:border-muted/40 hover:shadow-sm transition"
              >
                <div className={`text-xl font-extrabold ${urgency(e.date)}`}>{whenLabel(e.date)}</div>
                <div className="font-semibold mt-1 truncate">{e.title}</div>
                <div className="flex items-center gap-1.5 text-sm text-muted mt-0.5 min-w-0">
                  <span className="size-2.5 rounded-full shrink-0" style={{ background: m.color }} />
                  <span className="truncate">{m.name}</span>
                </div>
                <div className="text-xs text-muted mt-2 capitalize">{dateLabel(e.date)}</div>
              </button>
            );
          })}
        </div>
      )}
      {editing && <ExamModal exam={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

// Chips con las fechas de una materia, al lado del título.
export function MateriaExams({ materiaId }: { materiaId: string }) {
  const { tree } = useFacu();
  const [editing, setEditing] = useState<Exam | 'new' | null>(null);
  const exams = upcomingExams(tree, materiaId);
  return (
    <div className="flex gap-2 flex-wrap mb-5">
      {exams.map((e) => (
        <button
          key={e.id}
          onClick={() => setEditing(e)}
          className="h-9 px-3 rounded-full bg-surface border border-line text-sm font-semibold flex items-center gap-1.5 hover:bg-sunken"
        >
          {e.title} · <span className={urgency(e.date)}>{whenLabel(e.date).toLowerCase()}</span>
        </button>
      ))}
      <button
        onClick={() => setEditing('new')}
        className="h-9 px-3 rounded-full border border-dashed border-line text-sm font-semibold text-muted flex items-center gap-1 hover:text-ink hover:border-muted"
      >
        <Plus width={16} height={16} /> Fecha
      </button>
      {editing && (
        <ExamModal exam={editing === 'new' ? undefined : editing} materiaId={materiaId} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
