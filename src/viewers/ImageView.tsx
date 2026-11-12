import { useEffect, useState } from 'react';
import { Spinner } from '../components/ui';

// Muestra una foto. Mientras baja la original (puede pesar varios MB), se ve la versión que genera
// Google Drive, así abre al instante. Si el navegador no puede con la original (por ejemplo, fotos HEIC
// de iPhone aunque digan .jpg), se queda con la de Drive, y si tampoco se puede, avisa.
export default function ImageView({
  blob,
  progress = 0,
  name,
  thumbnail,
  onOpenDrive,
}: {
  blob: Blob | null;
  progress?: number;
  name: string;
  thumbnail?: string;
  onOpenDrive?: () => void;
}) {
  const [url, setUrl] = useState('');
  const [originalFailed, setOriginalFailed] = useState(false);
  const [driveFailed, setDriveFailed] = useState(!thumbnail);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    setOriginalFailed(false);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  const driveSrc = thumbnail?.replace(/=s\d+$/, '=s2000');
  const useOriginal = !!url && !originalFailed;
  const src = useOriginal ? url : !driveFailed ? driveSrc : '';

  if (!src) {
    // Todavía bajando y sin versión de Drive: se espera.
    if (!blob)
      return (
        <div className="h-full min-h-60 flex flex-col items-center justify-center text-center p-6">
          <Spinner />
          <p className="text-muted mt-3">Abriendo…{progress > 0 && ` ${Math.round(progress * 100)}%`}</p>
        </div>
      );
    return (
      <div className="h-full min-h-60 flex flex-col items-center justify-center text-center p-6">
        <p className="font-bold text-lg">No se pudo mostrar esta foto</p>
        <p className="text-muted mt-1 max-w-xs">Puede estar en un formato que este navegador no abre. En Google Drive se ve bien.</p>
        {onOpenDrive && (
          <button onClick={onOpenDrive} className="mt-5 h-11 px-5 rounded-xl bg-accent text-on-accent font-semibold">
            Abrir en Drive
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`min-h-full flex p-3 ${zoom ? '' : 'items-center justify-center'}`}>
      <img
        key={src}
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        onClick={() => setZoom((z) => !z)}
        onError={() => (useOriginal ? setOriginalFailed(true) : setDriveFailed(true))}
        className={zoom ? 'max-w-none cursor-zoom-out' : 'max-w-full max-h-[calc(100dvh-7rem)] object-contain cursor-zoom-in rounded-lg'}
      />
      {!blob && progress > 0 && (
        <span className="absolute bottom-3 right-3 text-[11px] font-semibold text-muted bg-surface/90 border border-line rounded-full px-2.5 py-0.5">
          Cargando original {Math.round(progress * 100)}%
        </span>
      )}
    </div>
  );
}
