import { Flame, Medal, Swords, Trophy, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Menu, PromptModal, Spinner, errorText, useToast } from '../components/ui';
import {
  compartir,
  crearLiga,
  ligaGuardada,
  linkLiga,
  misDuelos,
  previaLiga,
  salirLiga,
  unirseLiga,
  verLiga,
  type Duelo,
  type Liga,
  type MiembroLiga,
} from '../lib/liga';
import { go } from '../lib/router';

// Cuándo cierra la liga: el último día del mes a medianoche.
function cierre() {
  const hoy = new Date();
  const ultimo = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  const faltan = ultimo - hoy.getDate();
  return faltan === 0 ? 'Cierra hoy a medianoche' : faltan === 1 ? 'Cierra mañana a medianoche' : `Cierra en ${faltan} días`;
}
const nombreMes = () => new Date().toLocaleDateString('es-AR', { month: 'long' });

function Avatar({ nombre, foto, className = 'size-10' }: { nombre: string; foto: string | null; className?: string }) {
  return foto ? (
    <img src={foto} alt="" referrerPolicy="no-referrer" className={`${className} rounded-full object-cover shrink-0`} />
  ) : (
    <span className={`${className} rounded-full bg-accent-soft text-accent font-extrabold grid place-items-center shrink-0`}>{nombre[0]}</span>
  );
}
export { Avatar };

// Liga mensual con compañeros, y tus duelos.
//   codigo: si se llegó con un link de invitación.
export default function LigaScreen({ codigo }: { codigo?: string }) {
  const toast = useToast();
  const [liga, setLiga] = useState<Liga | null | undefined>(() => (codigo ? undefined : (ligaGuardada() ?? undefined)));
  const [error, setError] = useState('');
  const [creando, setCreando] = useState(false);
  const [duelos, setDuelos] = useState<Duelo[] | null>(null);

  useEffect(() => {
    verLiga().then(setLiga, (e) => setError(errorText(e)));
    misDuelos().then(setDuelos, () => setDuelos([]));
  }, []);

  async function invitar(l: Liga) {
    try {
      const r = await compartir(`Sumate a mi liga "${l.nombre}" en Mochi: repasamos todos los días y gana el que más suma en el mes.`, linkLiga(l.codigo));
      if (r === 'copiado') toast('Link copiado: pegalo en el grupo de WhatsApp');
    } catch (e) {
      toast(errorText(e));
    }
  }

  if (codigo && liga?.codigo !== codigo) return <Invitacion codigo={codigo} actual={liga} onUnido={setLiga} />;

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 pb-12 safe-top">
      <header className="pt-6 pb-5 flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight truncate">{liga ? liga.nombre : 'Liga'}</h1>
          {liga && <p className="text-sm text-muted mt-0.5">Liga de {nombreMes()} · {cierre()}</p>}
        </div>
        {liga && (
          <Menu
            items={[
              { label: 'Invitar compañeros', icon: <UserPlus size={18} />, onClick: () => invitar(liga) },
              {
                label: 'Salir de la liga',
                danger: true,
                onClick: () =>
                  salirLiga().then(setLiga, (e) => toast(errorText(e))),
              },
            ]}
          />
        )}
      </header>

      {liga === undefined && !error && (
        <div className="py-16 grid place-items-center">
          <Spinner />
        </div>
      )}
      {error && liga === undefined && <p className="text-danger">{error}</p>}

      {liga === null && (
        <section className="bg-surface border border-line rounded-3xl p-6 text-center">
          <Trophy size={48} className="mx-auto text-amber-500" />
          <p className="text-lg font-extrabold mt-3">Competí con tus compañeros</p>
          <p className="text-muted mt-1">
            Armá una liga y pasales el link. Cada repaso del día suma puntos, y a fin de mes el que más sumó se lleva una medalla.
          </p>
          <Button variant="primary" className="mt-5 w-full h-12" onClick={() => setCreando(true)}>
            Crear una liga
          </Button>
          <p className="text-sm text-muted mt-3">¿Te invitaron? Abrí el link que te pasaron.</p>
        </section>
      )}

      {liga && (
        <>
          {liga.ganadorAnterior && (
            <p className="text-sm text-muted mb-3 flex items-center gap-1.5">
              <Medal size={16} className="text-amber-500" /> El mes pasado ganó <b className="text-ink">{liga.ganadorAnterior.n}</b> con{' '}
              {liga.ganadorAnterior.p} puntos.
            </p>
          )}
          <ol className="bg-surface border border-line rounded-3xl divide-y divide-line overflow-hidden">
            {liga.miembros.map((m, i) => (
              <Fila key={i} m={m} pos={i + 1} />
            ))}
          </ol>
          {liga.miembros.length < 2 && (
            <button
              onClick={() => invitar(liga)}
              className="mt-3 w-full rounded-3xl border border-dashed border-line px-4 py-4 text-left hover:border-accent transition"
            >
              <p className="font-bold flex items-center gap-2">
                <UserPlus size={18} /> Invitá a tus compañeros
              </p>
              <p className="text-muted text-[15px] mt-0.5">Mandales el link por WhatsApp. Sola no tiene gracia.</p>
            </button>
          )}
          <p className="text-xs text-muted mt-3">Terminar el repaso del día da 30 puntos, y cada respuesta correcta 5 más. Para ver quién sabe más, mandá un duelo: ahí todos responden las mismas preguntas.</p>
        </>
      )}

      <section className="mt-9">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Swords size={20} /> Duelos
        </h2>
        <p className="text-sm text-muted mt-0.5 mb-3">Al terminar el repaso del día, tocá "Desafiar a un amigo" y mandale tus mismas preguntas.</p>
        {duelos === null ? (
          <Spinner />
        ) : duelos.length === 0 ? (
          <p className="text-muted text-[15px]">Todavía no jugaste ningún duelo.</p>
        ) : (
          <ul className="bg-surface border border-line rounded-3xl divide-y divide-line overflow-hidden">
            {duelos.map((d) => (
              <FilaDuelo key={d.id} d={d} />
            ))}
          </ul>
        )}
      </section>

      {creando && (
        <PromptModal
          title="Nombre de la liga"
          initial=""
          placeholder="Por ejemplo: Los de DSI"
          action="Crear"
          onClose={() => setCreando(false)}
          onSubmit={async (nombre) => {
            const l = await crearLiga(nombre);
            setLiga(l);
            if (l) invitar(l);
          }}
        />
      )}
    </div>
  );
}

function Fila({ m, pos }: { m: MiembroLiga; pos: number }) {
  const podio = ['text-amber-500', 'text-slate-400', 'text-orange-700'][pos - 1];
  return (
    <li className={`flex items-center gap-3 px-4 py-3 ${m.yo ? 'bg-accent-soft' : ''}`}>
      <span className={`w-6 text-center font-extrabold tabular-nums ${m.puntos > 0 && podio ? podio : 'text-muted'}`}>{pos}</span>
      <Avatar nombre={m.nombre} foto={m.foto} />
      <span className="flex-1 min-w-0">
        <span className="block font-semibold truncate">
          {m.nombre}
          {m.yo && <span className="text-muted font-normal"> (vos)</span>}
        </span>
        <span className="flex items-center gap-2 text-sm text-muted">
          <span className={`flex items-center gap-0.5 ${m.racha > 0 ? 'text-orange-500' : ''}`}>
            <Flame size={14} fill={m.racha > 0 ? 'currentColor' : 'none'} /> {m.racha}
          </span>
          {m.medallas > 0 && (
            <span className="flex items-center gap-0.5 text-amber-500">
              <Medal size={14} /> {m.medallas}
            </span>
          )}
          {m.hoy && <span>· repasó hoy</span>}
        </span>
      </span>
      <span className="font-extrabold tabular-nums">{m.puntos}</span>
    </li>
  );
}

function FilaDuelo({ d }: { d: Duelo }) {
  const yo = d.jugadores.find((j) => j.yo);
  const otros = d.jugadores.filter((j) => !j.yo);
  let estado: string;
  if (d.esMio) estado = otros.length ? otros.map((o) => `${o.nombre} ${o.aciertos}`).join(' · ') : 'Esperando que alguien juegue';
  else {
    const rival = d.jugadores.find((j) => j.creador);
    estado = rival && yo ? `${yo.aciertos} a ${rival.aciertos} · ${yo.aciertos > rival.aciertos ? 'Ganaste' : yo.aciertos < rival.aciertos ? 'Perdiste' : 'Empate'}` : '';
  }
  return (
    <li>
      <button onClick={() => go(`/duelo/${d.id}`)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-sunken/60 transition">
        <Swords size={20} className="text-muted shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block font-semibold truncate">
            {d.materia} · {d.esMio ? 'Tu desafío' : `De ${d.creador.nombre}`}
          </span>
          <span className="block text-sm text-muted truncate">{estado}</span>
        </span>
        {yo && (
          <span className="font-extrabold tabular-nums shrink-0">
            {yo.aciertos}/{d.total}
          </span>
        )}
      </button>
    </li>
  );
}

// Se llegó con un link de invitación.
function Invitacion({ codigo, actual, onUnido }: { codigo: string; actual: Liga | null | undefined; onUnido: (l: Liga | null) => void }) {
  const [previa, setPrevia] = useState<{ nombre: string; miembros: number } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    previaLiga(codigo).then((p) => (p.yaEstas ? go('/liga') : setPrevia(p)), (e) => setError(errorText(e)));
  }, [codigo]);

  async function unirse() {
    setBusy(true);
    try {
      onUnido(await unirseLiga(codigo));
      go('/liga');
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 pb-12 safe-top min-h-[70dvh] flex flex-col items-center justify-center text-center">
      {error ? (
        <>
          <p className="font-bold text-lg">{error}</p>
          <Button variant="primary" className="mt-5" onClick={() => go('/liga')}>
            Ir a la liga
          </Button>
        </>
      ) : !previa ? (
        <Spinner />
      ) : (
        <>
          <Trophy size={56} className="text-amber-500" />
          <p className="text-sm text-muted mt-4">Te invitaron a la liga</p>
          <h1 className="text-2xl font-extrabold mt-1">{previa.nombre}</h1>
          <p className="text-muted mt-1">
            {previa.miembros} {previa.miembros === 1 ? 'persona' : 'personas'} · cada repaso del día suma puntos
          </p>
          {actual && <p className="text-sm text-muted mt-4">Vas a salir de tu liga actual, "{actual.nombre}".</p>}
          <p className="text-xs text-muted mt-4 max-w-xs">Los demás van a ver tu nombre, tu foto de Google, tus puntos y tu racha.</p>
          <Button variant="primary" className="mt-5 w-full h-12" disabled={busy} onClick={unirse}>
            {busy ? 'Entrando…' : 'Unirme'}
          </Button>
          <Button variant="ghost" className="mt-2" onClick={() => go('/')}>
            Ahora no
          </Button>
        </>
      )}
    </div>
  );
}

