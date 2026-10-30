import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { KIND_STYLE, kindOf } from '../lib/files';
import { Close, More } from './icons';

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'soft' | 'ghost' | 'danger' };

export function Button({ variant = 'soft', className = '', ...p }: BtnProps) {
  const styles = {
    primary: 'bg-accent text-on-accent hover:brightness-110',
    soft: 'bg-surface text-ink border border-line hover:bg-sunken',
    ghost: 'text-ink hover:bg-sunken',
    danger: 'bg-danger text-white hover:brightness-110',
  }[variant];
  return (
    <button
      {...p}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 h-11 font-semibold text-[15px] transition disabled:opacity-50 disabled:pointer-events-none ${styles} ${className}`}
    />
  );
}

export function IconButton({ label, className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...p}
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center size-10 rounded-full text-ink hover:bg-sunken transition shrink-0 ${className}`}
    />
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div
      className={`size-7 rounded-full border-[3px] border-line border-t-accent animate-spin ${className}`}
      role="status"
      aria-label="Cargando"
    />
  );
}

// Mientras hay una ventana abierta, lo de atrás queda quieto.
// En el iPhone no alcanza con overflow: hidden, así que la página se fija en su lugar y al cerrar vuelve donde estaba.
let locks = 0;
let savedY = 0;
export function useLockScroll(active = true) {
  useEffect(() => {
    if (!active) return;
    if (locks++ === 0) {
      savedY = scrollY;
      Object.assign(document.body.style, { position: 'fixed', top: `-${savedY}px`, left: '0', right: '0', overflow: 'hidden' });
    }
    return () => {
      if (--locks > 0) return;
      Object.assign(document.body.style, { position: '', top: '', left: '', right: '', overflow: '' });
      scrollTo(0, savedY);
    };
  }, [active]);
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useLockScroll();
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onClose]);
  // Se dibuja directo en <body> para quedar siempre encima de todo (barras, botón +).
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 fade-in" onMouseDown={onClose}>
      <div
        className="w-full sm:max-w-md bg-surface rounded-t-3xl sm:rounded-3xl p-5 safe-bottom shadow-xl max-h-[90dvh] overflow-y-auto overflow-x-hidden overscroll-contain sheet-up"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <IconButton label="Cerrar" onClick={onClose} className="-mr-2">
            <Close />
          </IconButton>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function PromptModal({
  title,
  initial = '',
  placeholder,
  action = 'Guardar',
  onSubmit,
  onClose,
}: {
  title: string;
  initial?: string;
  placeholder?: string;
  action?: string;
  onSubmit: (value: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!value.trim()) return;
          setBusy(true);
          try {
            await onSubmit(value.trim());
            onClose();
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="w-full h-12 px-4 rounded-xl bg-sunken border border-transparent focus:border-accent outline-none text-base"
        />
        <Button variant="primary" className="w-full mt-4" disabled={busy || !value.trim()}>
          {busy ? 'Guardando…' : action}
        </Button>
      </form>
    </Modal>
  );
}

export function ConfirmModal({
  title,
  text,
  action,
  danger = true,
  onConfirm,
  onClose,
}: {
  title: string;
  text: string;
  action: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-muted">{text}</p>
      {error && <p className="text-danger mt-3 text-[15px]">{error}</p>}
      <div className="flex gap-3 mt-5">
        <Button className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          className="flex-1"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await onConfirm();
              onClose();
            } catch (e) {
              setError(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? '…' : error ? 'Reintentar' : action}
        </Button>
      </div>
    </Modal>
  );
}

export type MenuItem = { label: string; icon?: ReactNode; onClick: () => void; danger?: boolean };

export function Menu({ items, label = 'Más opciones' }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    addEventListener('mousedown', close);
    return () => removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <IconButton label={label} onClick={() => setOpen((o) => !o)}>
        <More />
      </IconButton>
      {open && (
        <div className="absolute right-0 top-11 z-50 min-w-56 bg-surface border border-line rounded-2xl shadow-lg p-1.5">
          {items.map((it) => (
            <button
              key={it.label}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className={`w-full flex items-center gap-3 px-3 h-11 rounded-xl text-left text-[15px] hover:bg-sunken ${
                it.danger ? 'text-danger' : ''
              }`}
            >
              <span className="opacity-80">{it.icon}</span>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FileBadge({ file, size = 'md' }: { file: { name: string; mimeType: string }; size?: 'md' | 'lg' }) {
  const s = KIND_STYLE[kindOf(file)];
  return (
    <div
      className={`${size === 'lg' ? 'size-16 text-sm rounded-2xl' : 'size-10 text-[10px] rounded-xl'} shrink-0 grid place-items-center font-extrabold tracking-wide`}
      style={{ color: s.color, background: `color-mix(in srgb, ${s.color} 14%, transparent)` }}
    >
      {s.label}
    </div>
  );
}

// Aviso de abajo. Puede tener un botón, por ejemplo "Deshacer".
export type ToastAction = { label: string; onClick: () => void };
const ToastCtx = createContext<(msg: string, action?: ToastAction) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; action?: ToastAction } | null>(null);
  const timer = useRef<number>(undefined);
  const show = useCallback((text: string, action?: ToastAction) => {
    setMsg({ text, action });
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), action ? 6000 : 3200);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div className="fixed inset-x-0 bottom-6 z-[80] flex justify-center px-4 pointer-events-none safe-bottom">
          <div className="pointer-events-auto bg-ink text-bg pl-5 pr-2 py-2 min-h-12 rounded-2xl shadow-lg text-[15px] font-medium flex items-center gap-3">
            <span className="py-1 pr-3">{msg.text}</span>
            {msg.action && (
              <button
                onClick={() => {
                  setMsg(null);
                  msg.action!.onClick();
                }}
                className="h-9 px-3 rounded-xl font-semibold text-accent hover:bg-white/10 whitespace-nowrap"
              >
                {msg.action.label}
              </button>
            )}
          </div>
        </div>
      )}
    </ToastCtx.Provider>
  );
}

export function errorText(e: unknown) {
  return e instanceof Error ? e.message : 'Algo salió mal';
}
