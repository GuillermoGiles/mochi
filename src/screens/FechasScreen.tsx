import { useState } from 'react';
import { ExamModal } from '../components/Exams';
import { Calendar, ChevronLeft, ChevronRight, Plus } from '../components/icons';
import { Button } from '../components/ui';
import { useFacu } from '../lib/context';
import { calendarLink, dateLabel, daysUntil, toISO, whenLabel, type Exam } from '../lib/datos';
import { upcomingExams } from '../lib/facu';

type Vista = 'lista' | 'calendario';
const VISTA_KEY = 'mochi.fechas.vista';

function leerVista(): Vista {
  try {
    return localStorage.getItem(VISTA_KEY) === 'calendario' ? 'calendario' : 'lista';
  } catch {
    return 'lista';
  }
}

// Todas las fechas que vienen, en lista (esta semana, próximas, más adelante) o en un calendario del mes.
export default function FechasScreen() {
  const { tree } = useFacu();
  const [editing, setEditing] = useState<Exam | 'new' | null>(null);
  const [newDate, setNewDate] = useState<string>();
  const [vista, setVistaState] = useState<Vista>(leerVista);
  const exams = upcomingExams(tree);

  function setVista(v: Vista) {
    setVistaState(v);
    try {
      localStorage.setItem(VISTA_KEY, v);
    } catch {
      /* sin almacenamiento: igual cambia la vista */
    }
  }

  function agregar(date?: string) {
    setNewDate(date);
    setEditing('new');
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-12 safe-top">
      <header className="flex items-center justify-between pt-6 pb-5">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Fechas</h1>
          <p className="text-sm text-muted mt-0.5">Parciales, recuperatorios y finales</p>
        </div>
        <Button variant="primary" onClick={() => agregar()}>
          <Plus /> Agregar
        </Button>
      </header>

      <div className="inline-flex p-1 mb-6 rounded-full bg-sunken border border-line" role="group" aria-label="Cómo ver las fechas">
        {(['lista', 'calendario'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setVista(v)}
            aria-pressed={vista === v}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
              vista === v ? 'bg-accent-soft text-accent' : 'text-muted hover:text-ink'
            }`}
          >
            {v === 'lista' ? 'Lista' : 'Calendario'}
          </button>
        ))}
      </div>

      {vista === 'calendario' ? (
        <CalendarioMes onOpen={setEditing} onAdd={agregar} />
      ) : exams.length === 0 ? (
        <div className="text-center py-16 px-6 rounded-3xl border border-dashed border-line">
          <Calendar width={36} height={36} className="mx-auto text-muted" />
          <p className="font-bold text-lg mt-3">No tenés fechas cargadas</p>
          <p className="text-muted mt-1">Anotá tu próximo parcial y te mostramos cuántos días faltan.</p>
          <Button variant="primary" className="mt-5" onClick={() => agregar()}>
            <Plus /> Agregar fecha
          </Button>
        </div>
      ) : (
        <Lista exams={exams} onOpen={setEditing} />
      )}
      {editing && (
        <ExamModal
          exam={editing === 'new' ? undefined : editing}
          defaultDate={editing === 'new' ? newDate : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function Lista({ exams, onOpen }: { exams: Exam[]; onOpen: (e: Exam) => void }) {
  // "Esta semana" es la semana de calendario: de hoy hasta el domingo.
  const finDeSemana = 7 - (new Date().getDay() || 7);
  const groups = [
    { label: 'Esta semana', items: exams.filter((e) => daysUntil(e.date) <= finDeSemana) },
    { label: 'Próximas semanas', items: exams.filter((e) => daysUntil(e.date) > finDeSemana && daysUntil(e.date) <= 31) },
    { label: 'Más adelante', items: exams.filter((e) => daysUntil(e.date) > 31) },
  ].filter((g) => g.items.length);

  return groups.map((g) => (
    <section key={g.label} className="mb-8">
      <h2 className="text-sm font-bold text-muted mb-2">{g.label}</h2>
      <div className="bg-surface border border-line rounded-3xl divide-y divide-line overflow-hidden">
        {g.items.map((e) => (
          <ExamRow key={e.id} exam={e} onOpen={onOpen} />
        ))}
      </div>
    </section>
  ));
}

function ExamRow({ exam: e, onOpen }: { exam: Exam; onOpen: (e: Exam) => void }) {
  const { tree } = useFacu();
  const m = tree.materias.get(e.materiaId)!;
  const n = daysUntil(e.date);
  const pasada = n < 0;
  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${pasada ? 'opacity-60' : ''}`}>
      <button onClick={() => onOpen(e)} className="flex-1 min-w-0 flex items-center gap-4 text-left">
        <div className={`w-16 shrink-0 text-center ${n >= 0 && n <= 3 ? 'text-accent' : ''}`}>
          {pasada ? (
            <div className="text-sm font-semibold text-muted">Ya pasó</div>
          ) : (
            <>
              <div className="text-2xl font-extrabold leading-none">{n === 0 ? 'Hoy' : n}</div>
              <div className="text-[11px] font-semibold text-muted mt-1">{n === 0 ? '' : n === 1 ? 'día' : 'días'}</div>
            </>
          )}
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
}

const DIAS = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'];

// Un mes en grilla (lunes a domingo). Tocar un día muestra sus fechas abajo; si no tiene, deja agregar una.
function CalendarioMes({ onOpen, onAdd }: { onOpen: (e: Exam) => void; onAdd: (date: string) => void }) {
  const { tree } = useFacu();
  const hoy = toISO(new Date());
  const [mes, setMes] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [sel, setSel] = useState(hoy);

  // Incluye las ya pasadas del mes, así el calendario muestra el mes completo.
  const delMes = tree.exams.filter((e) => {
    const m = tree.materias.get(e.materiaId);
    return m && !m.aprobada;
  });
  const porDia = new Map<string, Exam[]>();
  for (const e of delMes) porDia.set(e.date, [...(porDia.get(e.date) ?? []), e]);

  const offset = (mes.getDay() + 6) % 7; // lunes = 0
  const diasEnMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  const celdas = Math.ceil((offset + diasEnMes) / 7) * 7;
  const titulo = mes.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

  function mover(delta: number) {
    setMes(new Date(mes.getFullYear(), mes.getMonth() + delta, 1));
  }

  const elegidas = porDia.get(sel) ?? [];
  const [sy, sm, sd] = sel.split('-').map(Number);
  const selLabel = new Date(sy, sm - 1, sd).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <>
      <div className="bg-surface border border-line rounded-3xl p-3 sm:p-4">
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="font-bold first-letter:uppercase">{titulo}</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                const d = new Date();
                setMes(new Date(d.getFullYear(), d.getMonth(), 1));
                setSel(hoy);
              }}
              className="px-3 h-9 rounded-full text-sm font-semibold text-muted hover:text-ink hover:bg-sunken"
            >
              Hoy
            </button>
            <button onClick={() => mover(-1)} aria-label="Mes anterior" className="size-9 rounded-full grid place-items-center text-muted hover:text-ink hover:bg-sunken">
              <ChevronLeft width={20} height={20} />
            </button>
            <button onClick={() => mover(1)} aria-label="Mes siguiente" className="size-9 rounded-full grid place-items-center text-muted hover:text-ink hover:bg-sunken">
              <ChevronRight width={20} height={20} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {DIAS.map((d) => (
            <div key={d} className="text-center text-[11px] font-bold text-muted py-1">
              {d}
            </div>
          ))}
          {Array.from({ length: celdas }, (_, i) => {
            const dia = i - offset + 1;
            if (dia < 1 || dia > diasEnMes) return <div key={i} />;
            const iso = toISO(new Date(mes.getFullYear(), mes.getMonth(), dia));
            const items = porDia.get(iso) ?? [];
            const esHoy = iso === hoy;
            const esSel = iso === sel;
            const pasado = iso < hoy;
            return (
              <button
                key={i}
                onClick={() => setSel(iso)}
                aria-pressed={esSel}
                aria-label={`${dia}${items.length ? `, ${items.length} ${items.length === 1 ? 'fecha' : 'fechas'}` : ''}`}
                className={`min-h-14 sm:min-h-20 rounded-xl p-1 sm:p-1.5 flex flex-col items-center sm:items-stretch gap-1 text-left transition-colors ${
                  esSel ? 'bg-sunken ring-1 ring-line' : 'hover:bg-sunken'
                } ${pasado ? 'opacity-50' : ''}`}
              >
                <span
                  className={`text-sm font-semibold size-6 grid place-items-center rounded-full sm:self-start ${
                    esHoy ? 'bg-accent text-on-accent' : ''
                  }`}
                >
                  {dia}
                </span>
                {/* En el celu, puntitos; en pantallas grandes, el nombre. */}
                <span className="flex gap-0.5 sm:hidden">
                  {items.slice(0, 3).map((e) => (
                    <span key={e.id} className="size-1.5 rounded-full" style={{ background: tree.materias.get(e.materiaId)!.color }} />
                  ))}
                </span>
                <span className="hidden sm:flex flex-col gap-0.5 min-w-0 w-full">
                  {items.slice(0, 2).map((e) => (
                    <span
                      key={e.id}
                      className="text-[11px] font-semibold leading-tight truncate rounded px-1 py-0.5"
                      style={{ background: `color-mix(in srgb, ${tree.materias.get(e.materiaId)!.color} 22%, transparent)` }}
                    >
                      {e.title}
                    </span>
                  ))}
                  {items.length > 2 && <span className="text-[11px] text-muted px-1">+{items.length - 2} más</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <section className="mt-6">
        <h2 className="text-sm font-bold text-muted mb-2 first-letter:uppercase">{selLabel}</h2>
        {elegidas.length ? (
          <div className="bg-surface border border-line rounded-3xl divide-y divide-line overflow-hidden">
            {elegidas.map((e) => (
              <ExamRow key={e.id} exam={e} onOpen={onOpen} />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-3xl border border-dashed border-line">
            <span className="text-muted text-sm">Nada este día</span>
            <Button onClick={() => onAdd(sel)}>
              <Plus /> Agregar acá
            </Button>
          </div>
        )}
      </section>
    </>
  );
}
