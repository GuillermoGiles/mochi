import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Spinner, ToastProvider, errorText } from './components/ui';
import { FacuContext } from './lib/context';
import { Offline } from './components/icons';
import { AuthError, currentUser, offlineMode } from './lib/drive';
import { cachedTree, loadTree, type Tree } from './lib/facu';
import { sincronizarAvisos } from './lib/avisos';
import { useRoute } from './lib/router';
import Shell from './components/Shell';
import MochiBubble from './components/MochiBubble';
import FechasScreen from './screens/FechasScreen';
import EntregasScreen from './screens/EntregasScreen';
import CarreraScreen from './screens/CarreraScreen';
import Home from './screens/Home';
import YoScreen from './screens/YoScreen';
import ImportScreen from './screens/ImportScreen';
import AsistenteScreen from './screens/AsistenteScreen';
import RepasoScreen from './screens/RepasoScreen';
import Login from './screens/Login';
import MateriaScreen from './screens/MateriaScreen';
import SearchScreen from './screens/SearchScreen';
import Viewer from './screens/Viewer';

// Aviso cuando se está mostrando lo guardado porque no hay internet.
function OfflineBanner({ onBack }: { onBack: () => void }) {
  const [off, setOff] = useState(offlineMode);
  useEffect(() => {
    const sync = () => setOff(offlineMode);
    const online = () => onBack();
    addEventListener('mochi:offline', sync);
    addEventListener('online', online);
    return () => {
      removeEventListener('mochi:offline', sync);
      removeEventListener('online', online);
    };
  }, [onBack]);
  if (!off) return null;
  return (
    <div className="fixed top-0 inset-x-0 z-[70] flex justify-center pointer-events-none safe-top">
      <div className="mt-2 px-4 h-8 rounded-full bg-ink text-bg text-sm font-semibold flex items-center gap-2 shadow-lg">
        <Offline width={16} height={16} /> Sin conexión · mostrando lo guardado
      </div>
    </div>
  );
}

const PENDING = 'mochi:importar';

export default function App() {
  const [tree, setTree] = useState<Tree | null>(null);
  const [status, setStatus] = useState<'loading' | 'login' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const route = useRoute();

  const fresh = useRef(false);
  const lastFull = useRef(0);

  const load = useCallback(async (full: boolean) => {
    if (full) lastFull.current = Date.now();
    try {
      const t = await loadTree({ full });
      fresh.current = true;
      setTree(t);
      setStatus('ready');
      if (!offlineMode) sincronizarAvisos(t);
    } catch (e) {
      if (e instanceof AuthError) return setStatus('login');
      setError(errorText(e));
      // Si ya se están mostrando los apuntes, se siguen mostrando.
      setStatus((s) => (s === 'ready' ? s : 'error'));
    }
  }, []);
  // Después de un cambio hecho en la app: solo se vuelve a pedir lo que cambió.
  const reload = useCallback(() => load(false), [load]);
  const reloadAll = useCallback(() => load(true), [load]);

  useEffect(() => {
    // Se muestra al instante lo de la última vez, mientras se trae lo nuevo de Drive.
    if (currentUser)
      cachedTree().then((t) => {
        if (!t || fresh.current) return;
        setTree(t);
        setStatus((s) => (s === 'loading' ? 'ready' : s));
      });
    reloadAll();
  }, [reloadAll]);

  // Al volver a la app (por ejemplo, después de usarla en la compu), se trae lo nuevo.
  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState === 'visible' && status === 'ready' && Date.now() - lastFull.current > 60_000) reloadAll();
    };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [status, reloadAll]);

  // Después de entrar, se abre el link compartido que se estaba por recibir.
  useEffect(() => {
    if (status !== 'ready') return;
    try {
      const pending = localStorage.getItem(PENDING);
      if (pending) {
        localStorage.removeItem(PENDING);
        if (location.hash !== pending) location.hash = pending;
      }
    } catch {}
  }, [status, tree]);

  if (status === 'loading')
    return (
      <div className="min-h-dvh grid place-items-center">
        <Spinner />
      </div>
    );

  if (status === 'login') {
    if (route.name === 'importar') {
      try {
        localStorage.setItem(PENDING, location.hash);
      } catch {}
    }
    return <Login sharing={route.name === 'importar'} />;
  }

  if (status === 'error' || !tree)
    return (
      <div className="min-h-dvh grid place-items-center p-6 text-center">
        <div className="max-w-sm">
          <p className="text-lg font-bold mb-2">No pudimos cargar tus apuntes</p>
          <p className="text-muted mb-6 break-words">{error}</p>
          <Button variant="primary" onClick={() => (setStatus('loading'), reloadAll())}>
            Reintentar
          </Button>
        </div>
      </div>
    );

  return (
    <FacuContext.Provider value={{ tree, reload, user: currentUser }}>
      <ToastProvider>
        <Shell route={route}>
          {route.name === 'materia' && route.id ? (
            <MateriaScreen key={route.id} id={route.id} folderId={route.folder} />
          ) : route.name === 'search' ? (
            <SearchScreen initial={route.q ?? ''} />
          ) : route.name === 'fechas' ? (
            <FechasScreen />
          ) : route.name === 'entregas' ? (
            <EntregasScreen />
          ) : route.name === 'carrera' ? (
            <CarreraScreen />
          ) : route.name === 'yo' ? (
            <YoScreen />
          ) : route.name === 'ia' ? (
            <AsistenteScreen />
          ) : route.name === 'repaso' ? (
            <RepasoScreen />
          ) : route.name === 'importar' && route.id ? (
            <ImportScreen id={route.id} />
          ) : (
            <Home />
          )}
        </Shell>
        {route.file && <Viewer key={route.file} id={route.file} />}
        <MochiBubble route={route} />
        <OfflineBanner onBack={reloadAll} />
      </ToastProvider>
    </FacuContext.Provider>
  );
}
