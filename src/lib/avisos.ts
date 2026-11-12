// Avisos de parciales y entregas en el celu (el día antes y el mismo día), aunque la app esté cerrada.
// También el de la noche si tenés racha de repaso y hoy no repasaste.
// Lo que manda los avisos está en api/_avisos.ts; acá se activan y se le pasan las próximas fechas.

import { daysUntil } from './datos';
import { pendingEntregas, upcomingExams, type Tree } from './facu';

const ON = 'mochi:avisos';
const SENT = 'mochi:avisos-enviado';

const get = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const set = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {}
};

export const avisosSoportados = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
// En iPhone los avisos solo andan con Mochi agregada a la pantalla de inicio y abierta desde ahí.
export const iphoneSinInstalar = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) && !matchMedia('(display-mode: standalone)').matches;
export const avisosActivos = () => get(ON) === '1' && 'Notification' in window && Notification.permission === 'granted';

// Las fechas de los próximos 60 días: parciales y finales de materias sin aprobar, y entregas sin entregar.
function eventos(tree: Tree) {
  const nombre = (id: string) => tree.materias.get(id)?.name ?? '';
  const pronto = (d: string) => daysUntil(d) >= 0 && daysUntil(d) <= 60;
  return [
    ...upcomingExams(tree).filter((e) => pronto(e.date)).map((e) => ({ t: e.title, m: nombre(e.materiaId), d: e.date, e: false })),
    ...pendingEntregas(tree).filter((e) => pronto(e.date)).map((e) => ({ t: e.title, m: nombre(e.materiaId), d: e.date, e: true })),
  ].sort((a, b) => a.d.localeCompare(b.d));
}

// La racha del repaso, para el aviso de la noche ("no pierdas tu racha").
const racha = (tree: Tree) => (tree.repaso?.ultimo ? { n: tree.repaso.racha, u: tree.repaso.ultimo } : undefined);

async function post(body: unknown) {
  const r = await fetch('/api/avisos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(r.status === 502 ? 'No llegó el aviso de prueba. Probá de nuevo en un rato.' : 'No se pudieron activar los avisos. Probá de nuevo en un rato.');
  return (await r.json()) as { activos: boolean };
}

async function registro() {
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((ok) => setTimeout(() => ok(null), 8000)),
  ]);
  if (!reg) throw new Error('Los avisos funcionan en la app publicada (no en la versión de prueba de la compu).');
  return reg;
}

function claveBytes(base64url: string) {
  const s = atob(base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export async function activarAvisos(tree: Tree) {
  if (!avisosSoportados()) {
    throw new Error(
      iphoneSinInstalar()
        ? 'En iPhone, primero agregá Mochi a la pantalla de inicio (Compartir → Agregar a inicio) y abrila desde ahí.'
        : 'Este navegador no puede recibir avisos.',
    );
  }
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted')
    throw new Error('Las notificaciones de Mochi están bloqueadas. Habilitalas en los ajustes del navegador y probá de nuevo.');
  const reg = await registro();
  const { clave } = await (await fetch('/api/avisos-clave')).json();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveBytes(clave) }));
  const datos = { eventos: eventos(tree), racha: racha(tree) };
  await post({ sub: sub.toJSON(), ...datos });
  set(ON, '1');
  set(SENT, JSON.stringify(datos));
}

export async function desactivarAvisos() {
  set(ON, null);
  set(SENT, null);
  if (!avisosSoportados()) return;
  const reg = await registro().catch(() => null);
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await post({ quitar: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

// Después de cargar los datos: si cambiaron las fechas, se mandan. Se hace en todos los dispositivos
// (aunque en este no estén activados), para que lo cargado en la compu llegue a los avisos del celu.
// Si la cuenta no tiene avisos activados, el servidor no guarda nada.
export function sincronizarAvisos(tree: Tree) {
  const datos = JSON.stringify({ eventos: eventos(tree), racha: racha(tree) });
  if (datos === get(SENT)) return;
  post(JSON.parse(datos))
    .then(() => set(SENT, datos))
    .catch(() => {});
}
