import { useEffect, useRef, useState } from 'react';
import type { FileItem } from '../lib/facu';
import { KIND_STYLE, fmtDate, kindOf } from '../lib/files';
import { openFile } from '../lib/router';
import { canThumb, localThumb } from '../lib/thumbs';
import { Check, Offline } from './icons';
import RenameInput from './RenameInput';
import type { Item } from '../lib/explorer';

// Para arrastrar archivos a una carpeta dentro de la app.
export const DRAG_TYPE = 'application/x-mochi-files';
export type DragFile = Item;

// Cuadradito de archivo: vista previa arriba (si Drive la tiene) y título abajo.
// Con onToggle se puede seleccionar: círculo al pasar el mouse, o mantener apretado en el celu.
// Con el mouse funciona como en Windows: clic selecciona, doble clic abre, clic derecho muestra el menú.
export default function FileTile({
  file,
  code,
  title,
  subtitle,
  selected = false,
  selecting = false,
  offline = false,
  onToggle,
  dragFiles,
  onMouseSelect,
  onMenu,
  renaming = false,
  onRenamed,
  cut = false,
}: {
  file: FileItem;
  code?: string;
  title: string;
  subtitle?: string;
  selected?: boolean;
  selecting?: boolean;
  // Guardado para ver sin internet en este dispositivo.
  offline?: boolean;
  onToggle?: () => void;
  // Qué se arrastra: este archivo, o todos los seleccionados.
  dragFiles?: () => DragFile[];
  onMouseSelect?: (e: React.MouseEvent) => void;
  onMenu?: (e: React.MouseEvent) => void;
  renaming?: boolean;
  onRenamed?: (name: string | null) => void;
  // Cortado (Ctrl+X): se ve más clarito hasta que se pega.
  cut?: boolean;
}) {
  const s = KIND_STYLE[kindOf(file)];
  const [thumb, setThumb] = useState(file.thumbnailLink?.replace(/=s\d+$/, '=s400'));
  const [driveFailed, setDriveFailed] = useState(!file.thumbnailLink);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setThumb(file.thumbnailLink?.replace(/=s\d+$/, '=s400'));
    setDriveFailed(!file.thumbnailLink);
  }, [file.id, file.modifiedTime, file.thumbnailLink]);
  // Sin miniatura de Drive: se arma una acá, recién cuando el cuadradito está por verse.
  useEffect(() => {
    if (!driveFailed || !canThumb(file) || !box.current) return;
    let alive = true;
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        obs.disconnect();
        localThumb(file).then((url) => alive && setThumb(url ?? undefined));
      },
      { rootMargin: '400px' },
    );
    obs.observe(box.current);
    return () => {
      alive = false;
      obs.disconnect();
    };
  }, [driveFailed, file.id, file.modifiedTime]);
  const thumbOk = !!thumb;
  const press = useRef<number>(undefined);
  const longPressed = useRef(false);
  const pointer = useRef('mouse');

  return (
    <div className={`relative group ${cut ? 'opacity-50' : ''}`} data-item={file.id}>
      <button
        onPointerDown={(e) => (pointer.current = e.pointerType)}
        onClick={(e) => {
          if (longPressed.current) return void (longPressed.current = false);
          if (pointer.current === 'mouse' && onMouseSelect) return onMouseSelect(e);
          if (selecting && onToggle) onToggle();
          else openFile(file.id);
        }}
        onDoubleClick={() => pointer.current === 'mouse' && onMouseSelect && openFile(file.id)}
        draggable={!renaming}
        onDragStart={(e) => {
          const list = dragFiles?.() ?? [{ id: file.id, kind: 'file' as const, name: file.name, parentId: file.parents?.[0] ?? '' }];
          e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(list));
          e.dataTransfer.effectAllowed = 'copyMove';
        }}
        onTouchStart={() => {
          if (!onToggle) return;
          press.current = window.setTimeout(() => {
            longPressed.current = true;
            navigator.vibrate?.(15);
            onToggle();
          }, 450);
        }}
        onTouchEnd={() => clearTimeout(press.current)}
        onTouchMove={() => clearTimeout(press.current)}
        onContextMenu={(e) => {
          if (pointer.current === 'mouse' && onMenu) return onMenu(e);
          if (onToggle) e.preventDefault();
        }}
        className={`w-full h-full text-left bg-surface border rounded-2xl overflow-hidden flex flex-col transition select-none [-webkit-touch-callout:none] ${
          selected
            ? 'border-accent ring-2 ring-accent'
            : 'border-line hover:border-muted/40 hover:shadow-sm active:scale-[.98]'
        }`}
      >
        <div
          ref={box}
          className="relative aspect-[4/3] grid place-items-center overflow-hidden"
          style={{ background: `color-mix(in srgb, ${s.color} 6%, var(--sunken))` }}
        >
          {thumbOk ? (
            <img
              src={thumb}
              alt=""
              loading="lazy"
              draggable={false}
              referrerPolicy="no-referrer"
              onError={() => {
                // Si falla la de Drive, se prueba con la hecha acá.
                setThumb(undefined);
                setDriveFailed(true);
              }}
              className="absolute inset-0 size-full object-cover object-top"
            />
          ) : (
            <DocGlyph color={s.color} label={s.label} />
          )}
          {code && (
            <span className="absolute top-2 left-2 h-6 px-2 rounded-lg bg-surface/95 text-ink text-xs font-extrabold grid place-items-center shadow-sm">
              {code}
            </span>
          )}
          {thumbOk && (
            <span
              className="absolute bottom-2 right-2 h-5 px-1.5 rounded-md text-[10px] font-extrabold grid place-items-center text-white"
              style={{ background: s.color }}
            >
              {s.label}
            </span>
          )}
          {offline && (
            <span
              title="Disponible sin conexión"
              className="absolute bottom-2 left-2 size-6 rounded-lg bg-surface/95 text-ink grid place-items-center shadow-sm"
            >
              <Offline width={15} height={15} />
            </span>
          )}
          {selected && <span className="absolute inset-0 bg-accent/15" />}
        </div>
        <div className="px-3 pt-2.5 pb-3">
          {renaming && onRenamed ? (
            <RenameInput initial={file.name} isFile onDone={onRenamed} />
          ) : (
            <div className="font-semibold text-[14px] leading-snug line-clamp-2">{title}</div>
          )}
          <div className="text-xs text-muted mt-1 truncate">{subtitle ?? fmtDate(file.modifiedTime)}</div>
        </div>
      </button>
      {onToggle && (
        <button
          onClick={onToggle}
          aria-label={selected ? 'Quitar de la selección' : 'Seleccionar'}
          aria-pressed={selected}
          className={`absolute top-2 right-2 size-7 rounded-full grid place-items-center border-2 transition ${
            selected
              ? 'bg-accent border-accent text-on-accent'
              : `bg-surface/90 border-white/80 text-transparent shadow ${selecting ? '' : 'opacity-0 group-hover:opacity-100 [@media(hover:none)]:hidden'}`
          }`}
        >
          <Check width={16} height={16} />
        </button>
      )}
    </div>
  );
}

function DocGlyph({ color, label }: { color: string; label: string }) {
  return (
    <svg viewBox="0 0 64 76" className="w-11 h-auto" aria-hidden>
      <path d="M8 4h34l18 18v46a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4z" fill="var(--surface)" stroke={color} strokeWidth="3" />
      <path d="M42 4v14a4 4 0 0 0 4 4h14" fill="none" stroke={color} strokeWidth="3" />
      <rect x="10" y="40" width="44" height="18" rx="5" fill={color} />
      <text x="32" y="53.5" textAnchor="middle" fontSize="12" fontWeight="800" fill="#fff" fontFamily="inherit">
        {label}
      </text>
    </svg>
  );
}
