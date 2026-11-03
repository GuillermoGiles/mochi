import { Check, Lock } from 'lucide-react';
import { useState } from 'react';
import { ChevronRight } from '../components/icons';
import { Button, Modal, errorText } from '../components/ui';
import { useFacu } from '../lib/context';
import { fmtNota, fmtPromedio, updateDatos } from '../lib/datos';
import { promedio, setCarrera, setEstado, type Estado } from '../lib/facu';
import { NIVELES, PLANES, electivasHoras, missing, planOf, ppsKey, progress, type CarreraId, type PlanRow } from '../lib/plan';
import { go } from '../lib/router';

type Status = 'aprobada' | 'final' | 'cursando' | 'libre' | 'bloqueada';

function statusOf(r: PlanRow, byCode: Map<string, PlanRow>): Status {
  if (r.state) return r.state;
  return missing(r, byCode).length ? 'bloqueada' : 'libre';
}

const LABEL: Record<Status, string> = {
  aprobada: 'Aprobada',
  final: 'Falta el final',
  cursando: 'Cursando',
  libre: 'Podés cursarla',
  bloqueada: 'Todavía no',
};

function StatusIcon({ s }: { s: Status }) {
  const base = 'size-7 rounded-full grid place-items-center shrink-0';
  if (s === 'aprobada')
    return (
      <span className={`${base} bg-success text-white`}>
        <Check size={16} strokeWidth={3} />
      </span>
    );
  if (s === 'final') return <span className={`${base} border-2 border-amber-500 text-amber-500 text-xs font-extrabold`}>R</span>;
  if (s === 'cursando')
    return (
      <span className={`${base} border-2 border-accent`}>
        <span className="size-2.5 rounded-full bg-accent" />
      </span>
    );
  if (s === 'bloqueada')
    return (
      <span className={`${base} bg-sunken text-muted`}>
        <Lock size={13} />
      </span>
    );
  return <span className={`${base} border-2 border-line`} />;
}

// Anillo con el porcentaje de la carrera.
function Ring({ value }: { value: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 120 120" className="size-24 sm:size-32 shrink-0 -rotate-90" role="img" aria-label={`${value}% de la carrera`}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--sunken)" strokeWidth="12" />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={`${(c * value) / 100} ${c}`}
        className="transition-[stroke-dasharray] duration-700"
      />
      <text x="60" y="60" transform="rotate(90 60 60)" textAnchor="middle" dominantBaseline="central" className="fill-ink font-extrabold text-[26px]">
        {value}%
      </text>
    </svg>
  );
}

// Plan de la carrera: qué aprobaste, qué te falta y qué podés cursar.
export default function CarreraScreen() {
  const { tree } = useFacu();
  const [editing, setEditing] = useState<PlanRow | 'pps' | 'carrera' | null>(null);
  const [openLevels, setOpenLevels] = useState<Record<number, boolean>>({});
  const p = progress(tree);
  const prom = promedio(tree);
  const byCode = new Map(p.rows.map((r) => [r.code, r]));
  const obligatorias = p.rows.filter((r) => !r.electiva);
  const electivas = p.rows.filter((r) => r.electiva);
  const libres = obligatorias.filter((r) => statusOf(r, byCode) === 'libre');
  const faltan = p.obligatorias - p.aprobadas;

  const row = (r: PlanRow) => {
    const s = statusOf(r, byCode);
    return (
      <button key={r.code} onClick={() => setEditing(r)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-sunken/60 transition">
        <StatusIcon s={s} />
        <span className={`flex-1 min-w-0 truncate ${s === 'bloqueada' ? 'text-muted' : 'font-semibold'}`}>{r.name}</span>
        <span
          className={`text-sm shrink-0 ${
            s === 'aprobada' ? 'text-success font-bold' : s === 'final' ? 'text-amber-500 font-semibold' : s === 'cursando' || (s === 'libre' && !r.electiva) ? 'text-accent font-semibold' : 'text-muted'
          }`}
        >
          {s === 'aprobada' && r.nota !== undefined ? fmtNota(r.nota) : r.electiva && !r.state ? `${r.horas} hs` : LABEL[s]}
        </span>
      </button>
    );
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-12 safe-top">
      <header className="pt-6 pb-5">
        <h1 className="text-2xl font-extrabold tracking-tight">Tu carrera</h1>
        <button onClick={() => setEditing('carrera')} className="text-sm text-muted mt-0.5 text-left hover:text-ink transition">
          {p.plan.carrera} · {p.plan.nombre} · <span className="text-accent font-semibold">Cambiar</span>
        </button>
      </header>

      <section className="bg-surface border border-line rounded-3xl p-5 flex items-center gap-5 mb-8">
        <Ring value={p.porcentaje} />
        <div className="min-w-0 space-y-1.5">
          <p className="text-lg font-extrabold leading-tight">
            {p.porcentaje >= 100 ? '¡Terminaste la carrera!' : `Llevás el ${p.porcentaje}% de la carrera`}
          </p>
          <p className="text-[15px]">
            <b>{p.aprobadas}</b> de {p.obligatorias} materias aprobadas
            {p.regulares > 0 && <span className="text-muted"> · {p.regulares} con final pendiente</span>}
          </p>
          <p className="text-[15px] text-muted">
            Electivas: {p.horasElectivas} de {electivasHoras(p.plan)} hs{prom && <> · promedio <b className="text-ink">{fmtPromedio(prom.valor)}</b></>}
          </p>
          {faltan > 0 && <p className="text-sm text-muted">Te faltan {faltan} materias{p.pps ? '' : ' y la PPS'}.</p>}
        </div>
      </section>

      {libres.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-bold text-muted mb-2">Ya podés cursar</h2>
          <div className="flex gap-2 flex-wrap">
            {libres.map((r) => (
              <button
                key={r.code}
                onClick={() => setEditing(r)}
                className="h-9 px-3 rounded-full bg-accent-soft text-sm font-semibold hover:brightness-95 transition"
              >
                {r.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {NIVELES.map((label, i) => {
        const rows = obligatorias.filter((r) => r.nivel === i + 1);
        const ok = rows.filter((r) => r.state === 'aprobada').length;
        const complete = ok === rows.length;
        const open = openLevels[i] ?? !complete;
        return (
          <section key={label} className="mb-6">
            <button
              onClick={() => setOpenLevels({ ...openLevels, [i]: !open })}
              aria-expanded={open}
              className="w-full flex items-center gap-2 mb-2 text-left"
            >
              <ChevronRight width={16} height={16} className={`text-muted transition ${open ? 'rotate-90' : ''}`} />
              <h2 className="text-sm font-bold text-muted flex-1">{label}</h2>
              <span className={`text-sm font-bold ${complete ? 'text-success' : 'text-muted'}`}>
                {complete ? 'Completo' : `${ok} de ${rows.length}`}
              </span>
            </button>
            {open && <div className="bg-surface border border-line rounded-3xl divide-y divide-line overflow-hidden">{rows.map(row)}</div>}
          </section>
        );
      })}

      {p.electivasPorNivel.map(({ nivel, pide, hechas, completo }) => {
        const key = 10 + (nivel ?? 0);
        const all = electivas.filter((r) => !nivel || r.nivel === nivel);
        const mine = all.filter((r) => r.state);
        const open = !!openLevels[key];
        // Desplegado: todas las opciones. Plegado: solo las que elegiste.
        const shown = open ? all : mine;
        return (
          <section key={key} className="mb-6">
            <button
              onClick={() => setOpenLevels({ ...openLevels, [key]: !open })}
              aria-expanded={open}
              className="w-full flex items-center gap-2 mb-1 text-left"
            >
              <ChevronRight width={16} height={16} className={`text-muted transition ${open ? 'rotate-90' : ''}`} />
              <h2 className="text-sm font-bold text-muted flex-1">{nivel ? `Electivas de ${NIVELES[nivel - 1].toLowerCase()}` : 'Electivas'}</h2>
              <span className={`text-sm font-bold ${completo ? 'text-success' : 'text-muted'}`}>
                {completo ? 'Completo' : `${hechas} de ${pide} hs`}
              </span>
            </button>
            <p className="text-sm text-muted mb-2 pl-6">
              {completo
                ? `Ya sumaste las ${pide} hs que pide el plan.`
                : `No hace falta hacerlas todas: elegí las que quieras hasta sumar ${pide} hs${pide === 4 ? ' (por ejemplo, dos de 2 hs)' : ''}.`}
            </p>
            {shown.length ? (
              <div className="bg-surface border border-line rounded-3xl divide-y divide-line overflow-hidden">{shown.map(row)}</div>
            ) : (
              <button
                onClick={() => setOpenLevels({ ...openLevels, [key]: true })}
                className="w-full rounded-3xl border border-dashed border-line px-4 py-3 text-muted text-left hover:border-accent transition"
              >
                Ver las {all.length} opciones y marcar las que hiciste
              </button>
            )}
          </section>
        );
      })}

      <section>
        <div className="bg-surface border border-line rounded-3xl overflow-hidden">
          <button onClick={() => setEditing('pps')} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-sunken/60 transition">
            <StatusIcon s={p.pps ? 'aprobada' : 'libre'} />
            <span className="flex-1 min-w-0 truncate font-semibold">Práctica Profesional Supervisada</span>
            <span className={`text-sm shrink-0 font-semibold ${p.pps ? 'text-success' : 'text-muted'}`}>{p.pps ? 'Hecha' : '200 hs'}</span>
          </button>
        </div>
      </section>

      {editing === 'carrera' ? (
        <CarreraModal onClose={() => setEditing(null)} />
      ) : editing === 'pps' ? (
        <PpsModal done={p.pps} onClose={() => setEditing(null)} />
      ) : (
        editing && <PlanModal row={byCode.get(editing.code)!} byCode={byCode} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function parseNota(s: string) {
  const n = Number(s.replace(',', '.'));
  return s.trim() && n >= 0 && n <= 10 ? n : null;
}

const OPTIONS: { key: Estado | null; label: string; hint: string }[] = [
  { key: 'aprobada', label: 'Aprobada', hint: 'Con el final rendido o promocionada' },
  { key: 'final', label: 'Regular', hint: 'La cursaste y te falta el final' },
  { key: 'cursando', label: 'Cursando', hint: 'La estás cursando ahora' },
  { key: null, label: 'No la hice', hint: 'Todavía no la cursaste' },
];

// Tocar una materia del plan: ver sus correlativas y marcar cómo la tenés.
function PlanModal({ row, byCode, onClose }: { row: PlanRow; byCode: Map<string, PlanRow>; onClose: () => void }) {
  const { tree, reload } = useFacu();
  const [estado, setE] = useState<Estado | null>(row.state);
  const [nota, setNota] = useState(row.nota !== undefined ? fmtNota(row.nota) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const falta = missing(row, byCode);
  const pide = planOf(tree).electivas.find((x) => !x.nivel || x.nivel === row.nivel);
  const reqs = [
    ...row.cursar.map((c) => ({ r: byCode.get(c)!, need: 'regular' as const })),
    ...row.aprobar.map((c) => ({ r: byCode.get(c)!, need: 'aprobada' as const })),
  ];

  async function save() {
    const n = estado === 'aprobada' && nota.trim() ? parseNota(nota) : undefined;
    if (n === null) return setError('La nota tiene que ser del 0 al 10 (o dejala vacía).');
    setBusy(true);
    setError('');
    try {
      if (row.materia) await setEstado(row.materia, estado, n);
      await updateDatos(tree.rootId, (d) => {
        d.plan = d.plan ?? {};
        if (row.materia || !estado) delete d.plan[row.key];
        else d.plan[row.key] = n !== undefined ? { estado, nota: n } : { estado };
      });
      await reload();
      onClose();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <Modal title={row.name} onClose={onClose}>
      <p className="text-sm text-muted -mt-2 mb-4">
        {row.electiva ? 'Electiva · ' : ''}
        {NIVELES[row.nivel - 1]}
        {row.electiva && pide && ` · ${row.horas} hs (el ${pide.nivel ? 'nivel' : 'plan'} pide ${pide.pide} hs en total)`}
      </p>

      {reqs.length > 0 && (
        <div className="mb-5">
          <p className="font-semibold mb-2">{falta.length ? 'Para cursarla te falta' : 'Para cursarla necesitás'}</p>
          <ul className="space-y-1.5">
            {reqs.map(({ r, need }) => {
              const ok = need === 'regular' ? r.state === 'final' || r.state === 'aprobada' : r.state === 'aprobada';
              return (
                <li key={need + r.code} className="flex items-center gap-2 text-[15px]">
                  <span className={`size-5 rounded-full grid place-items-center shrink-0 ${ok ? 'bg-success text-white' : 'bg-sunken text-muted'}`}>
                    {ok ? <Check size={12} strokeWidth={3} /> : <Lock size={10} />}
                  </span>
                  <span className={`flex-1 min-w-0 truncate ${ok ? 'text-muted' : ''}`}>{r.name}</span>
                  <span className="text-xs text-muted shrink-0">{need === 'regular' ? 'cursada' : 'aprobada'}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="font-semibold mb-2">¿Cómo la tenés?</p>
      <div className="grid grid-cols-2 gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.label}
            onClick={() => setE(o.key)}
            className={`text-left rounded-2xl border px-3 py-2.5 transition ${estado === o.key ? 'bg-accent-soft border-accent' : 'border-line hover:bg-sunken'}`}
          >
            <span className="font-semibold block">{o.label}</span>
            <span className="text-xs text-muted">{o.hint}</span>
          </button>
        ))}
      </div>
      {estado === 'aprobada' && (
        <input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          inputMode="decimal"
          placeholder="Nota final (opcional): 8"
          className="mt-3 w-full h-12 px-4 rounded-xl bg-sunken border border-transparent focus:border-accent outline-none text-base"
        />
      )}
      {error && <p className="text-danger mt-3 text-[15px]">{error}</p>}

      <div className="flex gap-3 mt-5">
        {row.materia && (
          <Button
            type="button"
            onClick={() => {
              onClose();
              go(`/m/${row.materia!.id}`);
            }}
          >
            Ver apuntes
          </Button>
        )}
        <Button variant="primary" className="flex-1" disabled={busy} onClick={save}>
          {busy ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </Modal>
  );
}

function PpsModal({ done, onClose }: { done: boolean; onClose: () => void }) {
  const { tree, reload } = useFacu();
  const [busy, setBusy] = useState(false);
  async function set(v: boolean) {
    setBusy(true);
    await updateDatos(tree.rootId, (d) => {
      d.plan = d.plan ?? {};
      if (v) d.plan[ppsKey(tree)] = { estado: 'aprobada' };
      else delete d.plan[ppsKey(tree)];
    }).catch(() => {});
    await reload();
    onClose();
  }
  return (
    <Modal title="Práctica Profesional Supervisada" onClose={onClose}>
      <p className="text-muted mb-5">200 horas de práctica en una empresa o proyecto. ¿Ya la terminaste?</p>
      <div className="flex gap-3">
        <Button className="flex-1" disabled={busy} onClick={() => set(false)}>
          Todavía no
        </Button>
        <Button variant="primary" className="flex-1" disabled={busy || done} onClick={() => set(true)}>
          Ya la hice
        </Button>
      </div>
    </Modal>
  );
}

function CarreraModal({ onClose }: { onClose: () => void }) {
  const { tree, reload } = useFacu();
  const actual = planOf(tree).id;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function pick(id: CarreraId) {
    if (id === actual) return onClose();
    setBusy(true);
    try {
      await setCarrera(tree, id);
      await reload();
      onClose();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }
  return (
    <Modal title="¿Qué carrera estudiás?" onClose={onClose}>
      <p className="text-muted -mt-2 mb-4">Cambia el plan de estudios y las correlativas. Tus apuntes quedan igual.</p>
      <div className="space-y-2">
        {PLANES.map((pl) => (
          <button
            key={pl.id}
            disabled={busy}
            onClick={() => pick(pl.id)}
            className={`w-full text-left rounded-2xl border px-4 py-3 transition ${pl.id === actual ? 'bg-accent-soft border-accent' : 'border-line hover:bg-sunken'}`}
          >
            <span className="font-semibold block">{pl.carrera}</span>
            <span className="text-sm text-muted">{pl.nombre}</span>
          </button>
        ))}
      </div>
      {error && <p className="text-danger mt-3 text-[15px]">{error}</p>}
    </Modal>
  );
}
