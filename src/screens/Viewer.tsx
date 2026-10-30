import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import ErrorBoundary from '../components/ErrorBoundary';
import MoveModal from '../components/MoveModal';
import { Back, ChevronLeft, ChevronRight, Download, External, Move, Offline, Pencil, Share, Trash } from '../components/icons';
import { canSendToApp, sendFiles } from '../lib/send';
import { Button, ConfirmModal, FileBadge, IconButton, Menu, PromptModal, Spinner, errorText, useLockScroll, useToast } from '../components/ui';
import { notifyChanged, useFacu } from '../lib/context';
import { fileCache, getFile, rename, trash, type DFile } from '../lib/drive';
import { dropOffline, fileBlob, keepOffline, offlineMeta, slidesBlob } from '../lib/fileBlob';
import { offlineIds } from '../lib/offline';
import { itemOf, whereLabel } from '../lib/facu';
import { baseName, canPreview, extOf, kindOf, saveBlob } from '../lib/files';
import { closeFile, getViewerList, switchFile } from '../lib/router';

const PdfView = lazy(() => import('../viewers/PdfView'));
const DocxView = lazy(() => import('../viewers/DocxView'));
const SheetView = lazy(() => import('../viewers/SheetView'));
const ImageView = lazy(() => import('../viewers/ImageView'));

export default function Viewer({ id }: { id: string }) {
  const { tree } = useFacu();
  const toast = useToast();
  const [file, setFile] = useState<DFile | null>(fileCache.get(id) ?? null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<'rename' | 'move' | 'delete' | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    if (file) return;
    getFile(id).then(setFile, async (e) => {
      const meta = await offlineMeta(id);
      if (meta) setFile(meta);
      else setError(errorText(e));
    });
  }, [id, file]);

  useEffect(() => {
    offlineIds().then((s) => setIsOffline(s.has(id)));
  }, [id]);

  const fileId = file?.id;
  const previewable = !!file && canPreview(file);
  useEffect(() => {
    if (!file || !previewable) return;
    let alive = true;
    (kindOf(file) === 'slides' ? slidesBlob(file) : fileBlob(file)).then(
      (b) => alive && setBlob(b),
      (e) => alive && setError(errorText(e)),
    );
    return () => {
      alive = false;
    };
    // Solo cuando cambia el archivo, no cuando se renombra.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId, previewable]);

  async function toggleOffline() {
    if (!file) return;
    try {
      if (isOffline) {
        await dropOffline(file.id);
        setIsOffline(false);
        toast('Ya no está guardado sin conexión');
      } else {
        await keepOffline(file);
        setIsOffline(true);
        toast('Guardado: lo podés abrir sin internet en este dispositivo');
      }
      notifyChanged();
    } catch (e) {
      toast(errorText(e));
    }
  }

  useLockScroll();

  // Anterior y siguiente dentro de la carpeta (o búsqueda) desde la que se abrió.
  const siblings = getViewerList();
  const pos = siblings.indexOf(id);
  const prevId = pos > 0 ? siblings[pos - 1] : undefined;
  const nextId = pos >= 0 && pos < siblings.length - 1 ? siblings[pos + 1] : undefined;

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (modal) return;
      if (e.key === 'Escape') return closeFile();
      if (/INPUT|TEXTAREA/.test((e.target as HTMLElement).tagName)) return;
      if (e.key === 'ArrowLeft' && prevId) switchFile(prevId);
      if (e.key === 'ArrowRight' && nextId) switchFile(nextId);
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [modal, prevId, nextId]);

  // Deslizar el dedo de costado para pasar de archivo.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const swipe = {
    onTouchStart: (e: React.TouchEvent) => {
      touch.current = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const t = touch.current;
      touch.current = null;
      if (!t) return;
      const dx = e.changedTouches[0].clientX - t.x;
      const dy = e.changedTouches[0].clientY - t.y;
      if (Math.abs(dx) < 80 || Math.abs(dy) > 50) return;
      // Si el contenido está con zoom y se puede mover de costado, el gesto es para eso.
      const scroller = e.currentTarget as HTMLElement;
      if (scroller.scrollWidth > scroller.clientWidth + 4) return;
      if (dx > 0 && prevId) switchFile(prevId);
      if (dx < 0 && nextId) switchFile(nextId);
    },
  };

  const item = file ? itemOf(tree, file) : null;
  const kind = file ? kindOf(file) : 'other';

  async function onDownload() {
    if (!file) return;
    try {
      // En las presentaciones lo que se ve es un PDF: se descarga el archivo original.
      saveBlob((kind !== 'slides' && blob) || (await fileBlob(file)), file.name);
    } catch (e) {
      toast(errorText(e));
    }
  }

  // En el celu: abre el menú de compartir del teléfono (para mandarlo a Claude, WhatsApp…).
  async function onSend() {
    if (!file) return;
    try {
      await sendFiles([file]);
    } catch (e) {
      toast(errorText(e));
    }
  }

  const openInDrive = () => file?.webViewLink && open(file.webViewLink, '_blank');

  // Los dibujos se abren en excalidraw.com: se descarga el archivo y se abre Excalidraw en otra pestaña.
  // La pestaña se abre antes de descargar para que el navegador no la bloquee.
  async function openInExcalidraw() {
    if (!file) return;
    open('https://excalidraw.com', '_blank');
    try {
      saveBlob(await fileBlob(file), file.name);
      toast('Se descargó el dibujo. En Excalidraw abrí el menú, tocá Abrir y elegilo.');
    } catch (e) {
      toast(errorText(e));
    }
  }

  // Si Drive no pudo convertir la presentación (por ejemplo, si es muy pesada), queda abrirla en Drive.
  const slidesFailed = kind === 'slides' && !!error;

  let body;
  if (error && !slidesFailed) body = <Center>{error}</Center>;
  else if (!file) body = <Center><Spinner /></Center>;
  else if (kind === 'excalidraw')
    body = (
      <Center>
        <FileBadge file={file} size="lg" />
        <p className="font-bold text-lg mt-4">{baseName(file.name)}</p>
        <p className="text-muted mt-1 max-w-sm">
          Los dibujos se abren en Excalidraw. Se descarga el archivo y en Excalidraw lo abrís desde el menú, con <b>Abrir</b>.
        </p>
        <div className="flex flex-wrap justify-center gap-2 mt-5">
          <Button variant="primary" onClick={openInExcalidraw}>
            <External /> Abrir en Excalidraw
          </Button>
          <Button onClick={onDownload}>
            <Download /> Solo descargar
          </Button>
        </div>
        <p className="text-sm text-muted mt-6 max-w-sm">
          Si lo cambiás en Excalidraw, guardalo y volvé a subirlo a esta carpeta para tener la versión nueva acá.
        </p>
      </Center>
    );
  else if (!previewable || slidesFailed)
    body = (
      <Center>
        <FileBadge file={file} size="lg" />
        <p className="font-bold text-lg mt-4">{baseName(file.name)}</p>
        <p className="text-muted mt-1 max-w-xs">
          {slidesFailed
            ? 'No se pudo mostrar esta presentación acá. Abrila en Google Drive.'
            : `Este tipo de archivo (.${extOf(file.name)}) se ve mejor en Google Drive.`}
        </p>
        <div className="flex gap-2 mt-5">
          <Button variant="primary" onClick={openInDrive}>
            <External /> Abrir en Drive
          </Button>
          <Button onClick={onDownload}>
            <Download /> Descargar
          </Button>
        </div>
      </Center>
    );
  else if (!blob) body = <Center><Spinner /><p className="text-muted mt-3">Abriendo…</p></Center>;
  else
    body = (
      <ErrorBoundary resetKey={id} onClose={closeFile}>
      <Suspense fallback={<Center><Spinner /></Center>}>
        {(kind === 'pdf' || kind === 'slides') && <PdfView blob={blob} />}
        {kind === 'word' && <DocxView blob={blob} />}
        {kind === 'excel' && <SheetView blob={blob} />}
        {kind === 'image' && <ImageView blob={blob} name={file.name} thumbnail={file.thumbnailLink} onOpenDrive={openInDrive} />}
      </Suspense>
      </ErrorBoundary>
    );

  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col safe-top">
      <header className="h-14 shrink-0 flex items-center gap-1 px-2 border-b border-line bg-surface">
        <IconButton label="Cerrar" onClick={closeFile}>
          <Back />
        </IconButton>
        <div className="min-w-0 flex-1 px-1">
          <div className="font-semibold truncate leading-tight">{file ? baseName(file.name) : ''}</div>
          {item && (
            <div className="text-xs text-muted truncate">{whereLabel(item)}</div>
          )}
        </div>
        {siblings.length > 1 && pos >= 0 && (
          <div className="hidden sm:flex items-center gap-0.5 mr-1">
            <IconButton label="Anterior" disabled={!prevId} onClick={() => prevId && switchFile(prevId)} className="disabled:opacity-30">
              <ChevronLeft />
            </IconButton>
            <span className="text-xs text-muted tabular-nums w-14 text-center">
              {pos + 1} de {siblings.length}
            </span>
            <IconButton label="Siguiente" disabled={!nextId} onClick={() => nextId && switchFile(nextId)} className="disabled:opacity-30">
              <ChevronRight />
            </IconButton>
          </div>
        )}
        {file && (
          <>
            {canSendToApp() ? (
              <IconButton label="Enviar a otra app" onClick={onSend}>
                <Share />
              </IconButton>
            ) : (
              <IconButton label="Descargar" onClick={onDownload}>
                <Download />
              </IconButton>
            )}
            <Menu
              items={[
                ...(canSendToApp() ? [{ label: 'Descargar', icon: <Download />, onClick: onDownload }] : []),
                {
                  label: isOffline ? 'Quitar de sin conexión' : 'Guardar sin conexión',
                  icon: <Offline />,
                  onClick: toggleOffline,
                },
                { label: 'Abrir en Google Drive', icon: <External />, onClick: openInDrive },
                { label: 'Cambiar nombre', icon: <Pencil />, onClick: () => setModal('rename') },
                { label: 'Mover a otra carpeta', icon: <Move />, onClick: () => setModal('move') },
                { label: 'Eliminar', icon: <Trash />, danger: true, onClick: () => setModal('delete') },
              ]}
            />
          </>
        )}
      </header>

      <div className="flex-1 min-h-0 overflow-auto relative fade-in bg-sunken" data-scroll {...swipe}>
        {body}
      </div>
      {/* Celu: aviso de que se puede deslizar */}
      {siblings.length > 1 && pos >= 0 && (
        <div className="sm:hidden absolute top-[calc(3.5rem+env(safe-area-inset-top)+8px)] inset-x-0 flex justify-center pointer-events-none">
          <span key={id} className="hint-out text-[11px] font-semibold text-muted bg-surface/90 border border-line rounded-full px-2.5 py-0.5">
            {pos + 1} de {siblings.length} · deslizá para cambiar
          </span>
        </div>
      )}

      {file && modal === 'rename' && (
        <PromptModal
          title="Nombre del archivo"
          initial={baseName(file.name)}
          onClose={() => setModal(null)}
          onSubmit={async (name) => {
            const ext = extOf(file.name);
            setFile(await rename(file.id, ext ? `${name}.${ext}` : name));
            notifyChanged();
          }}
        />
      )}
      {file && modal === 'move' && (
        <MoveModal
          files={[file]}
          initialMateria={item?.materia.id}
          initialFolder={item?.folder?.id}
          onClose={() => setModal(null)}
          onMoved={(moved, where) => {
            if (moved[0]) setFile(moved[0]);
            notifyChanged();
            toast(`Movido a ${where}`);
          }}
        />
      )}
      {file && modal === 'delete' && (
        <ConfirmModal
          title="¿Eliminar este archivo?"
          text="Va a la papelera de Google Drive. Podés recuperarlo desde ahí durante 30 días."
          action="Eliminar"
          onClose={() => setModal(null)}
          onConfirm={async () => {
            await trash(file.id);
            notifyChanged();
            closeFile();
            toast('Archivo en la papelera de Drive');
          }}
        />
      )}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="h-full min-h-60 flex flex-col items-center justify-center text-center p-6">{children}</div>;
}
