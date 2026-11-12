import { useEffect, useRef, useState } from 'react';
import FileRow from '../components/FileRow';
import { Check, ChevronRight, Folder as FolderIcon, Plus, SearchIcon, Pencil, Trash } from '../components/icons';
import { UpcomingExams } from '../components/Exams';
import { NextEntregas } from '../components/Entregas';
import RachaCard from '../components/RachaCard';
import { MateriaBadge, MateriaCover } from '../components/MateriaCover';
import { daysUntil, fmtNota, fmtPromedio, whenLabel } from '../lib/datos';
import UploadSheet from '../components/UploadSheet';
import { itemsFromDrop, itemsFromInput, summarize, type UploadItem } from '../lib/upload';
import { Button, ConfirmModal, Menu, Modal, PromptModal, Spinner, errorText, useToast } from '../components/ui';
import { CHANGED, useFacu } from '../lib/context';
import {
  COLORS,
  YEAR_NAMES,
  addMateria,
  addYear,
  nextYearName,
  promedio,
  cachedRecentFiles,
  recentFiles,
  setCarrera,
  setEstado,
  upcomingExams,
  type Materia,
  renameFolder,
  trashFolder,
  type FileItem,
  type Year,
} from '../lib/facu';
import { PLANES, type CarreraId } from '../lib/plan';
import { go } from '../lib/router';

export default function Home() {
  const { tree, reload, user } = useFacu();
  const toast = useToast();
  const [recent, setRecent] = useState<FileItem[]>([]);
  const [adding, setAdding] = useState<{ year: Year; prefill?: Group } | null>(null);
  const [bulk, setBulk] = useState<{ year: Year; groups: Group[] } | null>(null);
  const [renaming, setRenaming] = useState<Year | null>(null);
  const [deleting, setDeleting] = useState<Year | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dropYear, setDropYear] = useState<string | null>(null);

  // Al soltar carpetas sobre un año, cada carpeta de primer nivel se convierte en una materia.
  function importGroups(year: Year, items: UploadItem[]) {
    const groups = groupByFolder(items);
    if (!groups.length) return toast('Soltá carpetas (no archivos sueltos) para crear materias.');
    if (groups.length === 1) setAdding({ year, prefill: groups[0] });
    else setBulk({ year, groups });
  }

  useEffect(() => {
    // Primero lo de la última vez (si todavía no hay nada), y después lo nuevo de Drive.
    let fresh = false;
    cachedRecentFiles(tree).then((saved) => saved && !fresh && setRecent((r) => (r.length ? r : saved)));
    const load = () =>
      recentFiles(tree)
        .then((r) => ((fresh = true), setRecent(r)))
        .catch(() => {});
    load();
    addEventListener(CHANGED, load);
    return () => removeEventListener(CHANGED, load);
  }, [tree]);

  const all = tree.years.flatMap((y) => y.materias.map((m) => ({ m, y })));
  const cursando = all.filter((x) => x.m.estado === 'cursando');
  const finales = all.filter((x) => x.m.estado === 'final');
  // "Todas las materias" arranca abierta solo si todavía no marcaste qué cursás.
  const [allOpen, setAllOpen] = usePersisted('mochi:todas', cursando.length === 0);

  if (tree.years.length === 0) return <Onboarding />;

  const firstName = user?.name.split(' ')[0];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-16 safe-top">
      <header className="pt-6 pb-5">
        <h1 className="text-[28px] font-extrabold tracking-tight leading-tight">Hola{firstName ? `, ${firstName}` : ''}</h1>
        <Stats />
      </header>

      <button
        onClick={() => go('/buscar')}
        className="w-full flex items-center gap-3 h-12 px-4 rounded-2xl bg-surface border border-line text-muted text-[15px] hover:border-accent transition"
      >
        <SearchIcon />
        <span className="flex-1 text-left">Buscar en todos tus apuntes…</span>
        <kbd className="hidden md:inline text-xs font-semibold border border-line rounded-md px-1.5 py-0.5">Ctrl K</kbd>
      </button>

      <RachaCard />
      <UpcomingExams />
      <NextEntregas />

      <section className="mt-9">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">Cursando ahora</h2>
          {cursando.length > 0 && (
            <button onClick={() => setPicking(true)} className="text-sm font-semibold text-muted hover:text-ink">
              Cambiar
            </button>
          )}
        </div>
        {cursando.length ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {cursando.map(({ m, y }) => (
              <MateriaCard key={m.id} m={m} year={y} />
            ))}
          </div>
        ) : (
          <button
            onClick={() => setPicking(true)}
            className="w-full text-left rounded-3xl border border-dashed border-line p-5 hover:border-accent transition"
          >
            <p className="font-bold">¿Qué materias estás cursando?</p>
            <p className="text-muted text-[15px] mt-1">Elegilas y te aparecen acá arriba, aunque sean de años distintos.</p>
            <span className="inline-flex items-center gap-1.5 mt-3 text-accent font-semibold">
              Elegir materias <ChevronRight width={18} height={18} />
            </span>
          </button>
        )}
      </section>

      {finales.length > 0 && (
        <section className="mt-9">
          <h2 className="text-lg font-bold mb-3">Finales pendientes</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {finales.map(({ m, y }) => (
              <MateriaCard key={m.id} m={m} year={y} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-9">
        <button onClick={() => setAllOpen(!allOpen)} className="flex items-center gap-2 text-lg font-bold" aria-expanded={allOpen}>
          <ChevronRight width={20} height={20} className={`transition ${allOpen ? 'rotate-90' : ''}`} />
          Todas las materias
          <span className="text-sm font-semibold text-muted bg-sunken rounded-full px-2 py-0.5">
            {all.filter((x) => !x.m.aprobada).length}
          </span>
        </button>
        {allOpen && (
          <div className="fade-up">
            {tree.years.map((y) => (
              <div
                key={y.id}
                className={`mt-6 rounded-3xl transition ${dropYear === y.id ? 'outline-4 outline-dashed outline-accent outline-offset-8 bg-accent-soft/40' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropYear(y.id);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropYear(null);
                }}
                onDrop={async (e) => {
                  e.preventDefault();
                  setDropYear(null);
                  importGroups(y, await itemsFromDrop(e.dataTransfer));
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-muted">
                    {y.name}
                    {dropYear === y.id && <span className="text-accent"> · Soltá para crear las materias acá</span>}
                  </h3>
                  <Menu
                    label={`Opciones de ${y.name}`}
                    items={[
                      { label: 'Agregar materia', icon: <Plus />, onClick: () => setAdding({ year: y }) },
                      { label: 'Cambiar nombre', icon: <Pencil />, onClick: () => setRenaming(y) },
                      { label: 'Eliminar año', icon: <Trash />, danger: true, onClick: () => setDeleting(y) },
                    ]}
                  />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {y.materias
                    .filter((m) => !m.aprobada)
                    .map((m) => (
                      <MateriaCard key={m.id} m={m} />
                    ))}
                  <button
                    onClick={() => setAdding({ year: y })}
                    className="rounded-2xl border border-dashed border-line min-h-24 flex items-center justify-center gap-2 text-muted font-semibold text-[15px] hover:border-accent hover:text-accent transition"
                  >
                    <Plus /> Materia
                  </button>
                </div>
              </div>
            ))}
            <Button
              className="mt-6"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await addYear(tree);
                  await reload();
                } catch (e) {
                  toast(errorText(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Plus /> Agregar {nextYearName(tree)}
            </Button>
          </div>
        )}
      </section>

      <Approved />

      {recent.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-bold mb-2">Lo último que subiste</h2>
          <div className="bg-surface border border-line rounded-3xl p-1.5">
            {recent.map((f) => (
              <FileRow key={f.id} file={f} showWhere />
            ))}
          </div>
        </section>
      )}

      {picking && <CursandoPicker onClose={() => setPicking(false)} />}
      {adding && (
        <NewMateria
          key={adding.prefill?.name ?? 'nueva'}
          year={adding.year}
          prefill={adding.prefill}
          onClose={() => setAdding(null)}
        />
      )}
      {bulk && <BulkImport year={bulk.year} groups={bulk.groups} onClose={() => setBulk(null)} />}
      {renaming && (
        <PromptModal
          title="Nombre del año"
          initial={renaming.name}
          onClose={() => setRenaming(null)}
          onSubmit={async (name) => {
            await renameFolder(renaming.id, name);
            await reload();
          }}
        />
      )}
      {deleting && (
        <ConfirmModal
          title={`¿Eliminar ${deleting.name}?`}
          text={
            deleting.materias.length
              ? `Se van a la papelera de Google Drive ${deleting.materias.length} materia(s) con todos sus archivos. Podés recuperarlos desde ahí durante 30 días.`
              : 'Se va a la papelera de Google Drive.'
          }
          action="Eliminar"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await trashFolder(deleting.id);
            await reload();
            toast('Listo. Está en la papelera de Drive por 30 días.');
          }}
        />
      )}
    </div>
  );
}

function usePersisted(key: string, initial: boolean) {
  const [v, setV] = useState(() => {
    try {
      const s = localStorage.getItem(key);
      return s === null ? initial : s === '1';
    } catch {
      return initial;
    }
  });
  const set = (n: boolean) => {
    setV(n);
    try {
      localStorage.setItem(key, n ? '1' : '0');
    } catch {}
  };
  return [v, set] as const;
}

// Tarjeta de materia: nombre, año y la próxima fecha.
function MateriaCard({ m, year }: { m: Materia; year?: Year }) {
  const { tree } = useFacu();
  const next = upcomingExams(tree, m.id)[0];
  const n = next ? daysUntil(next.date) : null;
  return (
    <button
      onClick={() => go(`/m/${m.id}`)}
      className="group text-left bg-surface border border-line rounded-2xl flex flex-col overflow-hidden hover:border-muted/40 hover:shadow-sm active:scale-[.98] transition"
    >
      <MateriaCover m={m} className="h-20 shrink-0" />
      <span className="flex flex-col flex-1 p-3.5 pt-3">
        {year && <span className="text-xs font-semibold text-muted mb-0.5">{year.name}</span>}
        <span className="font-bold leading-snug line-clamp-2">{m.name}</span>
        {next && (
          <span className={`mt-auto pt-2 text-xs font-semibold truncate ${n !== null && n <= 3 ? 'text-accent' : 'text-muted'}`}>
            {next.title} · {whenLabel(next.date).toLowerCase()}
          </span>
        )}
      </span>
    </button>
  );
}

// Elegir qué materias se están cursando (pueden ser de años distintos).
function CursandoPicker({ onClose }: { onClose: () => void }) {
  const { tree, reload } = useFacu();
  const toast = useToast();
  const [on, setOn] = useState(
    () => new Set([...tree.materias.values()].filter((m) => m.estado === 'cursando').map((m) => m.id)),
  );
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      for (const m of tree.materias.values()) {
        if (m.aprobada) continue;
        const want = on.has(m.id);
        if (want && m.estado !== 'cursando') await setEstado(m, 'cursando');
        if (!want && m.estado === 'cursando') await setEstado(m, null);
      }
      await reload();
      onClose();
    } catch (e) {
      toast(errorText(e));
      setBusy(false);
    }
  }

  return (
    <Modal title="¿Qué estás cursando?" onClose={onClose}>
      <p className="text-muted text-[15px] -mt-2 mb-4">Tildá las materias de este cuatrimestre.</p>
      <div className="max-h-[50dvh] overflow-y-auto -mx-2 px-2">
        {tree.years.map((y) => {
          const ms = y.materias.filter((m) => !m.aprobada);
          if (!ms.length) return null;
          return (
            <div key={y.id} className="mb-4">
              <h3 className="text-sm font-bold text-muted mb-1">{y.name}</h3>
              {ms.map((m) => {
                const checked = on.has(m.id);
                return (
                  <label key={m.id} className="flex items-center gap-3 h-12 px-2 rounded-xl hover:bg-sunken cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const n = new Set(on);
                        if (checked) n.delete(m.id);
                        else n.add(m.id);
                        setOn(n);
                      }}
                      className="size-5 accent-[var(--accent)]"
                    />
                    <MateriaBadge m={m} size={26} />
                    <span className="font-medium truncate">{m.name}</span>
                    {m.estado === 'final' && <span className="ml-auto text-xs text-muted">final pendiente</span>}
                  </label>
                );
              })}
            </div>
          );
        })}
      </div>
      <Button variant="primary" className="w-full mt-3" disabled={busy} onClick={save}>
        {busy ? 'Guardando…' : `Listo · ${on.size} ${on.size === 1 ? 'materia' : 'materias'}`}
      </Button>
    </Modal>
  );
}

// "Cursando 5 · 8 aprobadas · promedio 7,85"
function Stats() {
  const { tree } = useFacu();
  const ms = [...tree.materias.values()];
  const aprobadas = ms.filter((m) => m.aprobada).length;
  const cursando = ms.filter((m) => m.estado === 'cursando').length;
  const p = promedio(tree);
  const parts = [
    cursando ? `${cursando} cursando` : null,
    aprobadas ? `${aprobadas} ${aprobadas === 1 ? 'aprobada' : 'aprobadas'}` : null,
  ].filter(Boolean);
  if (!parts.length && !p) return null;
  return (
    <p className="text-[15px] text-muted mt-1">
      {parts.join(' · ')}
      {p && (
        <>
          {parts.length ? ' · ' : ''}promedio <span className="font-extrabold text-ink">{fmtPromedio(p.valor)}</span>
        </>
      )}
    </p>
  );
}

// Materias aprobadas, plegadas al final para que el inicio muestre solo lo que se cursa.
function Approved() {
  const { tree } = useFacu();
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem('facu:aprobadas') === '1';
    } catch {
      return false;
    }
  });
  const list = tree.years.flatMap((y) => y.materias.filter((m) => m.aprobada).map((m) => ({ m, y })));
  if (!list.length) return null;
  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem('facu:aprobadas', open ? '0' : '1');
    } catch {}
  };
  return (
    <section className="mt-10">
      <button onClick={toggle} className="flex items-center gap-2 text-lg font-bold" aria-expanded={open}>
        <ChevronRight width={20} height={20} className={`transition ${open ? 'rotate-90' : ''}`} />
        Aprobadas
        <span className="text-sm font-semibold text-muted bg-sunken rounded-full px-2 py-0.5">{list.length}</span>
      </button>
      {open && (
        <div className="flex gap-2 flex-wrap mt-3">
          {list.map(({ m, y }) => (
            <button
              key={m.id}
              onClick={() => go(`/m/${m.id}`)}
              className="h-11 pl-2 pr-4 rounded-full bg-surface border border-line flex items-center gap-2 text-[15px] font-semibold hover:bg-sunken"
            >
              <span className="size-7 rounded-full grid place-items-center text-white" style={{ background: m.color }}>
                <Check width={16} height={16} />
              </span>
              {m.name}
              {m.nota !== undefined && <span className="font-extrabold">{fmtNota(m.nota)}</span>}
              <span className="text-xs text-muted font-medium">{y.name}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

type Group = { name: string; items: UploadItem[] };

// Agrupa lo elegido por carpeta de primer nivel; lo de adentro queda relativo a esa carpeta.
function groupByFolder(items: UploadItem[]): Group[] {
  const groups = new Map<string, UploadItem[]>();
  for (const it of items) {
    const top = it.dirs[0];
    if (!top) continue;
    groups.set(top, [...(groups.get(top) ?? []), { ...it, dirs: it.dirs.slice(1) }]);
  }
  return [...groups].map(([name, items]) => ({ name, items }));
}

function NewMateria({ year, prefill, onClose }: { year: Year; prefill?: Group; onClose: () => void }) {
  const { tree, reload } = useFacu();
  const toast = useToast();
  const used = tree.materias.size;
  const [name, setName] = useState(prefill?.name ?? '');
  const [color, setColor] = useState(COLORS[used % COLORS.length]);
  const [busy, setBusy] = useState(false);
  // Contenido de una carpeta de la compu para importar como materia.
  const [items, setItems] = useState<UploadItem[] | null>(prefill?.items ?? null);
  const [uploading, setUploading] = useState<{ id: string; name: string } | null>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    folderInput.current?.setAttribute('webkitdirectory', '');
  }, []);

  if (uploading && items)
    return (
      <UploadSheet
        items={items}
        parentId={uploading.id}
        destName={uploading.name}
        onClose={async () => {
          await reload();
          onClose();
        }}
        onDone={async (n) => {
          toast(`${uploading.name}: ${n} archivos importados`);
          await reload();
          onClose();
          go(`/m/${uploading.id}`);
        }}
      />
    );

  const info = items ? summarize(items) : null;

  return (
    <Modal title={`Nueva materia · ${year.name}`} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          setBusy(true);
          try {
            const f = await addMateria(year, name, color);
            if (items?.length) return setUploading({ id: f.id, name: f.name });
            await reload();
            onClose();
          } catch (err) {
            toast(errorText(err));
            setBusy(false);
          }
        }}
      >
        <input
          ref={folderInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const all = e.target.files ? itemsFromInput(e.target.files) : [];
            e.target.value = '';
            // La carpeta elegida pasa a ser la materia; lo de adentro, sus carpetas.
            const g = groupByFolder(all)[0];
            if (!g) return;
            setName(g.name);
            setItems(g.items);
          }}
        />
        {info ? (
          <div className="flex items-center gap-3 rounded-2xl bg-accent-soft px-4 py-3 mb-4">
            <FolderIcon className="text-accent shrink-0" />
            <p className="text-[15px] flex-1">
              Se van a importar <b>{info.files} archivos</b>
              {info.folders > 0 && ` en ${info.folders} carpetas`}.
            </p>
            <button type="button" onClick={() => setItems(null)} className="text-sm font-semibold text-muted hover:text-ink">
              Quitar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => folderInput.current?.click()}
            className="w-full flex items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-3 mb-4 text-left hover:border-accent transition"
          >
            <FolderIcon className="text-accent shrink-0" />
            <span>
              <span className="font-semibold block">Importar una carpeta de la compu</span>
              <span className="text-sm text-muted">Se crea la materia con todas sus carpetas y archivos</span>
            </span>
          </button>
        )}
        <p className="text-sm text-muted mb-2">{info ? 'Nombre de la materia' : 'O creala vacía con este nombre:'}</p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Análisis Matemático I"
          className="w-full h-12 px-4 rounded-xl bg-sunken border border-transparent focus:border-accent outline-none text-base"
        />
        <p className="text-sm text-muted mt-4 mb-2">Color</p>
        <div className="flex gap-2 flex-wrap">
          {COLORS.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
              className={`size-9 rounded-full transition ${color === c ? 'ring-2 ring-offset-2 ring-offset-surface ring-ink' : ''}`}
              style={{ background: c }}
            />
          ))}
        </div>
        <Button variant="primary" className="w-full mt-5" disabled={busy || !name.trim()}>
          {busy ? 'Creando…' : info ? 'Crear e importar' : 'Crear materia'}
        </Button>
      </form>
    </Modal>
  );
}

// Varias carpetas soltadas a la vez: crea una materia por carpeta y las sube una atrás de otra.
function BulkImport({ year, groups, onClose }: { year: Year; groups: Group[]; onClose: () => void }) {
  const { tree, reload } = useFacu();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState('');
  // Guarda la promesa (no el resultado) para no crear la misma materia dos veces.
  const created = useRef(new Map<number, Promise<{ id: string; name: string }>>());
  const baseColor = useRef(tree.materias.size).current;

  useEffect(() => {
    let alive = true;
    setTarget(null);
    (async () => {
      try {
        if (!created.current.has(step)) {
          const g = groups[step];
          const existing = year.materias.find((x) => x.name.trim().toLowerCase() === g.name.trim().toLowerCase());
          created.current.set(
            step,
            existing ? Promise.resolve(existing) : addMateria(year, g.name, COLORS[(baseColor + step) % COLORS.length]),
          );
        }
        const m = await created.current.get(step)!;
        if (alive) setTarget({ id: m.id, name: m.name });
      } catch (e) {
        if (alive) setError(errorText(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [step, groups, year, baseColor]);

  const finish = async () => {
    await reload();
    onClose();
  };

  if (error)
    return (
      <Modal title="No se pudo crear la materia" onClose={finish}>
        <p className="text-danger">{error}</p>
        <Button className="w-full mt-5" onClick={finish}>
          Cerrar
        </Button>
      </Modal>
    );

  if (!target)
    return (
      <Modal title={`Importando ${step + 1} de ${groups.length}`} onClose={() => {}}>
        <div className="flex items-center gap-3 text-muted">
          <Spinner /> Creando {groups[step].name}…
        </div>
      </Modal>
    );

  return (
    <UploadSheet
      key={step}
      items={groups[step].items}
      parentId={target.id}
      destName={`${target.name} (${step + 1} de ${groups.length})`}
      onClose={finish}
      onDone={async () => {
        if (step + 1 < groups.length) return setStep(step + 1);
        toast(`Listo: ${groups.length} materias importadas en ${year.name}`);
        await finish();
      }}
    />
  );
}

function Onboarding() {
  const { tree, reload, user } = useFacu();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function start(count: number) {
    setBusy(true);
    try {
      for (let i = 0; i < count; i++) await addYear(tree, i);
      await reload();
    } catch (e) {
      toast(errorText(e));
      setBusy(false);
    }
  }

  async function pick(id: CarreraId) {
    setBusy(true);
    try {
      await setCarrera(tree, id);
      await reload();
    } catch (e) {
      toast(errorText(e));
    }
    setBusy(false);
  }

  // Primero la carrera (para el plan de estudios), después el año.
  if (!tree.carrera)
    return (
      <div className="min-h-dvh max-w-lg mx-auto px-6 py-12 flex flex-col justify-center">
        <p className="text-muted font-medium">¡Hola{user ? `, ${user.name.split(' ')[0]}` : ''}!</p>
        <h1 className="text-3xl font-extrabold tracking-tight mt-1">¿Qué carrera estudiás?</h1>
        <p className="text-muted mt-3">Así Mochi sabe tu plan de estudios y tus correlativas.</p>
        {busy ? (
          <div className="mt-10 flex items-center gap-3 text-muted">
            <Spinner /> Preparando todo…
          </div>
        ) : (
          <div className="grid gap-3 mt-8">
            {PLANES.map((p) => (
              <Button key={p.id} className="h-16 text-lg" onClick={() => pick(p.id)}>
                {p.carrera}
              </Button>
            ))}
          </div>
        )}
      </div>
    );

  return (
    <div className="min-h-dvh max-w-lg mx-auto px-6 py-12 flex flex-col justify-center">
      <p className="text-muted font-medium">¡Hola{user ? `, ${user.name.split(' ')[0]}` : ''}!</p>
      <h1 className="text-3xl font-extrabold tracking-tight mt-1">¿Qué año de la carrera estás cursando?</h1>
      <p className="text-muted mt-3">Armamos un espacio para cada año. Después agregás las materias.</p>
      {busy ? (
        <div className="mt-10 flex items-center gap-3 text-muted">
          <Spinner /> Preparando todo…
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-8">
          {YEAR_NAMES.slice(0, 6).map((name, i) => (
            <Button key={name} className="h-16 text-lg" onClick={() => start(i + 1)}>
              {name}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
