import { MateriaGlyph } from '../components/MateriaCover';
import { useState } from 'react';
import { EntregaModal, EntregaRow } from '../components/Entregas';
import { ChevronRight, Plus } from '../components/icons';
import { Button } from '../components/ui';
import { useFacu } from '../lib/context';
import { daysUntil, type Entrega } from '../lib/datos';

// Todo lo que hay que entregar: atrasadas, pendientes y (abajo, plegadas) las ya entregadas.
export default function EntregasScreen() {
  const { tree } = useFacu();
  const [editing, setEditing] = useState<Entrega | 'new' | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const all = tree.entregas.filter((e) => tree.materias.has(e.materiaId));
  const items = all.filter((e) => !filter || e.materiaId === filter);
  const pending = items.filter((e) => !e.done).sort((a, b) => a.date.localeCompare(b.date));
  const late = pending.filter((e) => daysUntil(e.date) < 0);
  const next = pending.filter((e) => daysUntil(e.date) >= 0);
  const done = items.filter((e) => e.done).sort((a, b) => b.date.localeCompare(a.date));
  const materias = [...new Set(all.map((e) => e.materiaId))].map((id) => tree.materias.get(id)!);

  const list = (rows: Entrega[]) => (
    <div className="bg-surface border border-line rounded-3xl divide-y divide-line overflow-hidden">
      {rows.map((e) => (
        <EntregaRow key={e.id} e={e} showMateria={!filter} onEdit={() => setEditing(e)} />
      ))}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-12 safe-top">
      <header className="flex items-center justify-between pt-6 pb-5">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Entregas</h1>
          <p className="text-sm text-muted mt-0.5">
            {pending.length ? `${pending.length} para entregar` : 'TPs, actividades e informes'}
          </p>
        </div>
        <Button variant="primary" onClick={() => setEditing('new')}>
          <Plus /> Nueva
        </Button>
      </header>

      {materias.length > 1 && (
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 mb-5 [scrollbar-width:none]">
          {[null, ...materias].map((m) => (
            <button
              key={m?.id ?? 'todas'}
              onClick={() => setFilter(m?.id ?? null)}
              className={`shrink-0 h-9 px-3 rounded-full text-sm font-semibold border flex items-center gap-1.5 transition ${
                filter === (m?.id ?? null) ? 'bg-accent-soft border-accent' : 'border-line hover:bg-sunken'
              }`}
            >
              {m && <MateriaGlyph m={m} />}
              {m?.name ?? 'Todas'}
            </button>
          ))}
        </div>
      )}

      {all.length === 0 ? (
        <div className="text-center py-16 px-6 rounded-3xl border border-dashed border-line">
          <p className="font-bold text-lg">No tenés entregas anotadas</p>
          <p className="text-muted mt-1">Anotá cada TP o actividad y tildala cuando la entregues. Así no se te pasa ninguna.</p>
          <Button variant="primary" className="mt-5" onClick={() => setEditing('new')}>
            <Plus /> Anotar entrega
          </Button>
        </div>
      ) : (
        <>
          {late.length > 0 && (
            <section className="mb-8">
              <h2 className="text-sm font-bold text-danger mb-2">Atrasadas</h2>
              {list(late)}
            </section>
          )}
          <section className="mb-8">
            <h2 className="text-sm font-bold text-muted mb-2">Para entregar</h2>
            {next.length ? (
              list(next)
            ) : (
              <p className="rounded-3xl border border-dashed border-line px-4 py-5 text-muted text-center">
                {late.length ? 'Nada más por ahora.' : 'Estás al día. Nada para entregar.'}
              </p>
            )}
          </section>
          {done.length > 0 && (
            <section>
              <button
                onClick={() => setShowDone(!showDone)}
                aria-expanded={showDone}
                className="tap flex items-center gap-1.5 text-sm font-bold text-muted hover:text-ink mb-2"
              >
                <ChevronRight width={16} height={16} className={`transition ${showDone ? 'rotate-90' : ''}`} />
                Entregadas ({done.length})
              </button>
              {showDone && list(done)}
            </section>
          )}
        </>
      )}
      {editing && (
        <EntregaModal entrega={editing === 'new' ? undefined : editing} materiaId={filter ?? undefined} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
