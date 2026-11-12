import { Swords } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Centro, QuizPreguntas, QuizShell } from '../components/Quiz';
import { Button, Spinner, errorText, useToast } from '../components/ui';
import { compartir, linkDuelo, responderDuelo, verDuelo, type Duelo } from '../lib/liga';
import { go } from '../lib/router';
import { Avatar } from './LigaScreen';

// Un duelo: si no lo jugaste, las preguntas; si ya lo jugaste (o es tuyo), cómo salió.
export default function DueloScreen({ id }: { id: string }) {
  const toast = useToast();
  const [duelo, setDuelo] = useState<Duelo | null>(null);
  const [error, setError] = useState('');
  const [jugando, setJugando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [progreso, setProgreso] = useState(0);

  useEffect(() => {
    verDuelo(id).then(setDuelo, (e) => setError(errorText(e)));
  }, [id]);

  async function terminar(respuestas: number[]) {
    setGuardando(true);
    try {
      setDuelo(await responderDuelo(id, respuestas));
      setJugando(false);
    } catch (e) {
      toast(errorText(e));
      setGuardando(false);
    }
  }

  async function reenviar(d: Duelo) {
    const r = await compartir(`Te desafío en Mochi: ${d.total} preguntas de ${d.materia}.`, linkDuelo(d.id)).catch(() => 'cancelado');
    if (r === 'copiado') toast('Link del duelo copiado');
  }

  const salir = () => go('/liga');
  const yo = duelo?.jugadores.find((j) => j.yo);
  const mejor = duelo?.jugadores[0]?.aciertos ?? 0;
  const ganadores = duelo?.jugadores.filter((j) => j.aciertos === mejor) ?? [];

  return (
    <QuizShell progreso={duelo?.jugaste ? 1 : progreso} salir={salir} derecha={<Swords size={20} className="text-muted" />}>
      {error && (
        <Centro>
          <p className="font-bold text-lg">{error}</p>
          <Button variant="primary" className="mt-5" onClick={salir}>
            Volver
          </Button>
        </Centro>
      )}
      {!error && !duelo && (
        <Centro>
          <Spinner />
        </Centro>
      )}

      {duelo && !duelo.jugaste && !jugando && (
        <Centro>
          <Avatar nombre={duelo.creador.nombre} foto={duelo.creador.foto} className="size-16 text-2xl" />
          <p className="text-sm text-muted mt-4">{duelo.creador.nombre} te desafía</p>
          <h1 className="text-2xl font-extrabold mt-1">
            {duelo.total} preguntas de {duelo.materia}
          </h1>
          <p className="text-muted mt-2 max-w-xs">Respondé y mirá quién sabe más. Se juega una sola vez.</p>
          <Button variant="primary" className="mt-6 w-full max-w-xs h-12" onClick={() => setJugando(true)}>
            Aceptar el duelo
          </Button>
        </Centro>
      )}

      {duelo && !duelo.jugaste && jugando && duelo.preguntas && (
        <QuizPreguntas preguntas={duelo.preguntas} etiqueta={() => duelo.materia} onProgreso={setProgreso} onFin={terminar} guardando={guardando} />
      )}

      {duelo?.jugaste && (
        <Centro>
          <Swords size={56} className="text-accent racha-pop" />
          <p className="text-2xl font-extrabold mt-3">
            {duelo.jugadores.length < 2
              ? 'Esperando rival'
              : ganadores.length > 1 && ganadores.some((g) => g.yo)
                ? '¡Empate!'
                : ganadores[0]?.yo
                  ? '¡Ganaste!'
                  : 'Esta vez no'}
          </p>
          <p className="text-muted mt-1">
            {duelo.materia} · acertaste {yo?.aciertos ?? 0} de {duelo.total}
          </p>
          <ol className="mt-6 w-full max-w-sm bg-surface border border-line rounded-3xl divide-y divide-line overflow-hidden text-left">
            {duelo.jugadores.map((j, i) => (
              <li key={i} className={`flex items-center gap-3 px-4 py-3 ${j.yo ? 'bg-accent-soft' : ''}`}>
                <Avatar nombre={j.nombre} foto={j.foto} />
                <span className="flex-1 min-w-0 truncate font-semibold">
                  {j.nombre}
                  {j.yo && <span className="text-muted font-normal"> (vos)</span>}
                </span>
                <span className="font-extrabold tabular-nums">
                  {j.aciertos}/{duelo.total}
                </span>
              </li>
            ))}
          </ol>
          {duelo.esMio && (
            <Button className="mt-4 w-full max-w-sm h-12" onClick={() => reenviar(duelo)}>
              Mandárselo a alguien más
            </Button>
          )}
          <Button variant="primary" className="mt-2 w-full max-w-sm h-12" onClick={salir}>
            Listo
          </Button>
        </Centro>
      )}
    </QuizShell>
  );
}
