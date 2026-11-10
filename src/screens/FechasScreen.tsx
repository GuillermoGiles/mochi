import { useState } from 'react';
import { ExamModal } from '../components/Exams';
import { Calendar, Plus } from '../components/icons';
import { Button } from '../components/ui';
import { useFacu } from '../lib/context';
import { calendarLink, dateLabel, daysUntil, whenLabel, type Exam } from '../lib/datos';
import { upcomingExams } from '../lib/facu';

// Todas las fechas que vienen, agrupadas: esta semana, este mes y más adelante.
export default function FechasScreen() {
  const { tree } = useFacu();
  const [editing, setEditing] = useState<Exam | 'new' | null>(null);
  const exams = upcomingExams(tree);
  // "Esta semana" es la semana de calendario: de hoy hasta el domingo.
  const finDeSemana = 7 - (new Date().getDay() || 7);
  const groups = [
    { label: 'Esta semana', items: exams.filter((e) => daysUntil(e.date) <= finDeSemana) },
    { label: 'Próximas semanas', items: exams.filter((e) => daysUntil(e.date) > finDeSemana && daysUntil(e.date) <= 31) },
    { label: 'Más adelante', items: exams.filter((e) => daysUntil(e.date) > 31) },
  ].filter((g) => g.items.length);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-12 safe-top">
      <header className="flex items-center justify-between pt-6 pb-5">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Fechas</h1>
          <p className="text-sm text-muted mt-0.5">Parciales, recuperatorios y finales</p>
        </div>
        <Button variant="primary" onClick={() => setEditing('new')}>
          <Plus /> Agregar
        </Button>
      </header>

      {groups.length === 0 ? (
        <div className="text-center py-16 px-6 rounded-3xl border border-dashed border-line">
          <Calendar width={36} height={36} className="mx-auto text-muted" />
          <p className="font-bold text-lg mt-3">No tenés fechas cargadas</p>
          <p className="text-muted mt-1">Anotá tu próximo parcial y te mostramos cuántos días faltan.</p>
          <Button variant="primary" className="mt-5" onClick={() => setEditing('new')}>
            <Plus /> Agregar fecha
          </Button>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.label} className="mb-8">
            <h2 className="text-sm font-bold text-muted mb-2">{g.label}</h2>
            <div className="bg-surface border border-line rounded-3xl divide-y divide-line overflow-hidden">
              {g.items.map((e) => {
                const m = tree.materias.get(e.materiaId)!;
                const n = daysUntil(e.date);
                return (
                  <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                    <button onClick={() => setEditing(e)} className="flex-1 min-w-0 flex items-center gap-4 text-left">
                      <div className={`w-16 shrink-0 text-center ${n <= 3 ? 'text-accent' : ''}`}>
                        <div className="text-2xl font-extrabold leading-none">{n === 0 ? 'Hoy' : n}</div>
                        <div className="text-[11px] font-semibold text-muted mt-1">{n === 0 ? '' : n === 1 ? 'día' : 'días'}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2 min-w-0">
                          <span className="font-semibold truncate">{e.title}</span>
                          <span className="text-sm text-muted shrink-0">{dateLabel(e.date)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-sm text-muted min-w-0">
                          <span className="size-2.5 rounded-full shrink-0" style={{ background: m.color }} />
                          <span className="truncate">{m.name}</span>
                        </div>
                      </div>
                    </button>
                    <a
                      href={calendarLink(e, m.name)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Agregar ${e.title} a Google Calendar`}
                      title={`${whenLabel(e.date)} · Agregar a Google Calendar`}
                      className="size-10 rounded-full grid place-items-center text-muted hover:text-ink hover:bg-sunken shrink-0"
                    >
                      <Calendar width={20} height={20} />
                    </a>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
      {editing && <ExamModal exam={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
