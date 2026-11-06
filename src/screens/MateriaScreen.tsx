import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import FileTile, { DRAG_TYPE, type DragFile } from '../components/FileTile';
import {
  Back,
  Camera,
  ChevronRight,
  Close,
  Download,
  External,
  Folder as FolderIcon,
  Move,
  Offline,
  Pencil,
  Plus,
  Share,
  SearchIcon,
  Trash,
  UploadIcon,
} from '../components/icons';
import { MateriaBadge, MateriaCover } from '../components/MateriaCover';
import { MateriaInfoModal, MateriaSummary } from '../components/MateriaInfo';
import MoveModal from '../components/MoveModal';
import ShareModal from '../components/ShareModal';
import UploadSheet from '../components/UploadSheet';
import { Button, ConfirmModal, IconButton, Menu, Modal, PromptModal, errorText, useToast, type MenuItem } from '../components/ui';
import { CHANGED, notifyChanged, useFacu } from '../lib/context';
import { list, move, trash } from '../lib/drive';
import {
  addFolder,
  folderPath,
  cachedMateriaFiles,
  materiaFiles,
  renameFolder,
  searchInMateria,
  trashFolder,
  type FileItem,
  type Folder,
  type Materia,
} from '../lib/facu';
import { keepOffline } from '../lib/fileBlob';
import { ClipboardPaste, Copy, FolderPlus, RefreshCw, Scissors, Undo2 } from 'lucide-react';
import ContextMenu, { type CtxItem } from '../components/ContextMenu';
import RenameInput from '../components/RenameInput';
import {
  CLIPBOARD,
  copyItems,
  getClipboard,
  canUndo,
  moveItems,
  newFolder,
  paste,
  recordMove,
  undoLast,
  removeItems,
  renameItem,
  setClipboard,
  type Item,
} from '../lib/explorer';
import { FOLDER } from '../lib/drive';
import { canSendToApp, sendFiles } from '../lib/send';
import { baseName, cleanNames, naturalCompare } from '../lib/files';
import { offlineIds } from '../lib/offline';
import { go, openFile, setLastMateria, setViewerList } from '../lib/router';
import { itemsFromDrop, itemsFromInput, mergeSameName, type UploadItem } from '../lib/upload';

type Sort = 'nombre' | 'recientes';
const SORT_KEY = 'facu:sort';

function readSort(): Sort {
  try {
    return localStorage.getItem(SORT_KEY) === 'recientes' ? 'recientes' : 'nombre';
  } catch {
    return 'nombre';
  }
}

type ModalKind =
  | 'rename-materia'
  | 'delete-materia'
  | 'rename-folder'
  | 'unwrap-folder'
  | 'delete-folder'
  | 'new-folder'
  | 'info'
  | 'add'
  | 'share';

export default function MateriaScreen({ id, folderId }: { id: string; folderId?: string }) {
  const { tree, reload } = useFacu();
  const toast = useToast();
  const m = tree.materias.get(id);
  const found = folderId ? tree.folders.get(folderId) : undefined;
  const current = found && found.materia.id === id ? found : undefined;
  const [files, setFiles] = useState<FileItem[] | null>(null);
  const [picked, setPicked] = useState<UploadItem[] | null>(null);
  // Carpeta donde se sube lo que se soltó encima (si no, la carpeta abierta).
  const [uploadDest, setUploadDest] = useState<{ id: string; name: string } | null>(null);
  const [hoverFolder, setHoverFolder] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [modal, setModal] = useState<ModalKind | null>(null);
  const [sort, setSort] = useState<Sort>(readSort);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const selecting = selectMode || selected.size > 0;
  const clearSelection = () => {
    setSelected(new Set());
    setSelectMode(false);
  };
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [contentHits, setContentHits] = useState<FileItem[] | null>(null);
  const [bulk, setBulk] = useState<'move' | null>(null);
  const [offline, setOffline] = useState<Set<string>>(new Set());
  // Como en el Explorador de Windows: último elegido (para Shift+clic y flechas), menú del clic derecho,
  // nombre que se está cambiando, lo que se va a eliminar y el portapapeles.
  const anchor = useRef<string | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number; items: CtxItem[] } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Item[] | null>(null);
  const [renameTarget, setRenameTarget] = useState<Item | null>(null);
  const [shareFor, setShareFor] = useState<Folder | Materia | null>(null);
  const [clip, setClip] = useState(getClipboard);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const f = () => setClip(getClipboard());
    addEventListener(CLIPBOARD, f);
    return () => removeEventListener(CLIPBOARD, f);
  }, []);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  useEffect(() => setLastMateria(id), [id]);

  // React no conoce el atributo para elegir carpetas.
  useEffect(() => {
    folderInput.current?.setAttribute('webkitdirectory', '');
  }, []);

  const load = useCallback(async () => {
    if (!m) return;
    offlineIds().then(setOffline);
    // Mientras llega lo de Drive, se muestra lo de la última vez (solo si todavía no hay nada en pantalla).
    let fresh = false;
    cachedMateriaFiles(tree, m).then((saved) => saved && !fresh && setFiles((f) => f ?? saved));
    try {
      const r = await materiaFiles(tree, m);
      fresh = true;
      setFiles(r);
    } catch (e) {
      fresh = true;
      toast(errorText(e));
      setFiles((f) => f ?? []);
    }
  }, [tree, m, toast]);

  useEffect(() => {
    load();
    const onChange = () => load();
    addEventListener(CHANGED, onChange);
    return () => removeEventListener(CHANGED, onChange);
  }, [load]);

  // Al cambiar de carpeta se limpia la selección y vuelve arriba.
  useEffect(() => {
    clearSelection();
    scrollTo({ top: 0 });
  }, [current?.id]);

  // Además del nombre, busca adentro de los PDF y Word de la materia.
  useEffect(() => {
    const text = query.trim();
    setContentHits(null);
    if (!m || text.length < 3) return;
    let alive = true;
    const t = setTimeout(() => {
      searchInMateria(tree, m, text).then(
        (r) => alive && setContentHits(r),
        () => alive && setContentHits([]),
      );
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query, tree, m]);

  const results = useMemo(() => {
    const text = norm(query.trim());
    if (!text) return null;
    const byName = (files ?? []).filter((f) => norm(f.name).includes(text));
    const seen = new Set(byName.map((f) => f.id));
    const byContent = (contentHits ?? []).filter((f) => !seen.has(f.id));
    return { byName, byContent };
  }, [query, files, contentHits]);

  // Cantidad de archivos por carpeta, contando las subcarpetas.
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const f of files ?? []) for (let d = f.folder; d; d = d.parent) c.set(d.id, (c.get(d.id) ?? 0) + 1);
    return c;
  }, [files]);

  const here = useMemo(() => {
    const list = (files ?? []).filter((f) => f.folder?.id === current?.id);
    const names = cleanNames(list);
    const key = (f: FileItem) => names.get(f.id)!.code ?? names.get(f.id)!.title;
    list.sort((a, b) =>
      sort === 'recientes'
        ? b.modifiedTime.localeCompare(a.modifiedTime)
        : naturalCompare(key(a), key(b)) || naturalCompare(a.name, b.name),
    );
    return { list, names };
  }, [files, current, sort]);

  // El lector usa esta lista para pasar al anterior o siguiente.
  useEffect(() => {
    const shown = results ? [...results.byName, ...results.byContent] : here.list;
    setViewerList(shown.map((f) => f.id));
  }, [results, here]);

  // Atajos de teclado como en Windows. Se registra una vez y usa siempre la última versión.
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    const k = (e: KeyboardEvent) => keyHandler.current(e);
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);

  if (!m)
    return (
      <div className="min-h-dvh grid place-items-center p-6 text-center">
        <div>
          <p className="font-bold text-lg mb-4">Esta materia ya no existe</p>
          <Button onClick={() => go('/')}>Volver al inicio</Button>
        </div>
      </div>
    );

  const year = tree.years.find((y) => y.id === m.yearId);
  const path = folderPath(current);
  const openFolder = (f?: Folder) => go(f ? `/m/${m.id}/${f.id}` : `/m/${m.id}`);
  const goBack = () => (current ? openFolder(current.parent) : go('/'));
  const destId = current?.id ?? m.id;
  const destName = current?.name ?? m.name;

  // Archivos de la compu soltados encima de una carpeta: se suben adentro de esa carpeta.
  const uploadTo = async (dt: DataTransfer, id: string, name: string) => {
    const pending = itemsFromDrop(dt);
    setDragging(false);
    setHoverFolder(null);
    const items = mergeSameName(await pending, name);
    if (items.length) {
      setUploadDest({ id, name });
      setPicked(items);
    }
  };

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    setHoverFolder(null);
    setUploadDest(null);
    if (!e.dataTransfer.types.includes('Files')) return;
    const items = mergeSameName(await itemsFromDrop(e.dataTransfer), destName);
    if (items.length) setPicked(items);
  };

  // Lo que se ve en pantalla, en orden: primero las carpetas y después los archivos.
  const shownFolders = results ? [] : current ? current.children : m.folders;
  const shownFiles = results ? [...results.byName, ...results.byContent] : here.list;
  const items: Item[] = [
    ...shownFolders.map((f) => ({ id: f.id, kind: 'folder' as const, name: f.name, parentId: f.parentId })),
    ...shownFiles.map((f) => ({ id: f.id, kind: 'file' as const, name: f.name, parentId: f.folder?.id ?? m.id })),
  ];
  const selectedItems = items.filter((i) => selected.has(i.id));
  const selectedFiles = (files ?? []).filter((f) => selected.has(f.id));
  const cutIds = new Set(clip?.mode === 'cut' ? clip.items.map((i) => i.id) : []);

  // Después de un cambio se vuelve a leer todo (las carpetas también pueden haber cambiado).
  const refresh = async () => {
    await reload();
    notifyChanged();
  };

  const run = async (fn: () => Promise<string | void>) => {
    try {
      const msg = await fn();
      if (msg) toast(msg);
    } catch (e) {
      toast(errorText(e));
    }
  };

  const plural = (n: number) => (n === 1 ? '1 elemento' : `${n} elementos`);

  // Ctrl+Z, o el botón "Deshacer" del aviso de abajo.
  const doUndo = () =>
    run(async () => {
      const what = await undoLast();
      if (!what) return 'No hay nada para deshacer';
      await refresh();
      return `Se deshizo: ${what}`;
    });
  const undoToast = (msg: string) => toast(msg, { label: 'Deshacer', onClick: doUndo });

  const moveTo = (list: DragFile[], targetId: string, targetName: string, copy = false) =>
    run(async () => {
      const n = copy ? await copyItems(tree, list, targetId) : await moveItems(tree, list, targetId);
      clearSelection();
      await refresh();
      if (n) undoToast(`${plural(n)} ${copy ? 'copiados' : 'movidos'} a ${targetName}`);
    });

  const toggle = (fid: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(fid)) n.delete(fid);
      else n.add(fid);
      return n;
    });

  // Clic con el mouse: solo ese; Ctrl+clic suma o saca; Shift+clic elige desde el último hasta este.
  const mouseSelect = (id: string) => (e: React.MouseEvent) => {
    if (e.shiftKey && anchor.current) {
      const a = items.findIndex((i) => i.id === anchor.current);
      const b = items.findIndex((i) => i.id === id);
      const range = items.slice(Math.min(a, b), Math.max(a, b) + 1).map((i) => i.id);
      setSelected((s) => new Set([...(e.ctrlKey || e.metaKey ? s : []), ...range]));
      return;
    }
    anchor.current = id;
    if (e.ctrlKey || e.metaKey) toggle(id);
    else setSelected(new Set([id]));
  };

  const openItem = (it: Item) => {
    if (it.kind === 'file') return openFile(it.id);
    const f = tree.folders.get(it.id);
    if (f) openFolder(f);
  };

  // Si arrastrás uno de los seleccionados, se llevan todos.
  const dragFor = (it: Item) => () => (selected.has(it.id) ? selectedItems : [it]);

  const copyOrCut = (mode: 'copy' | 'cut', list = selectedItems) => {
    if (!list.length) return;
    setClipboard({ mode, items: list });
    toast(`${plural(list.length)} ${mode === 'copy' ? 'copiados' : 'cortados'}. Pegalos con Ctrl+V donde quieras.`);
  };

  const doPaste = (dest = destId, name = destName) =>
    run(async () => {
      const c = getClipboard();
      if (!c) return;
      const n = await paste(tree, dest, (i, t) => t > 1 && toast(`Pegando ${i + 1} de ${t}…`));
      await refresh();
      undoToast(`${plural(n)} ${c.mode === 'cut' ? 'movidos' : 'pegados'} en ${name}`);
    });

  // Como en Windows: aparece "Nueva carpeta" y se le escribe el nombre ahí mismo.
  const newFolderInline = () =>
    run(async () => {
      const f = await newFolder(destId);
      await reload();
      setSelected(new Set([f.id]));
      anchor.current = f.id;
      setRenaming(f.id);
    });

  const finishRename = (it: Item, name: string | null) => {
    setRenaming(null);
    if (!name) return;
    run(async () => {
      await renameItem(it, name);
      await refresh();
    });
  };

  const startRename = (it: Item) => (shownFolders.some((f) => f.id === it.id) || it.kind === 'file' ? setRenaming(it.id) : setRenameTarget(it));

  const download = (list = selectedFiles) =>
    run(async () => {
      if (!list.length) return;
      const r = await sendFiles(list, (i, n) => n > 1 && toast(`Preparando ${i + 1} de ${n}…`));
      if (r === 'downloaded') return list.length === 1 ? 'Descargado' : `Se descargaron ${list.length} archivos`;
    });

  // Menú del clic derecho sobre un archivo o carpeta. Si no estaba elegido, queda elegido solo ese.
  const itemMenu = (it: Item) => (e: React.MouseEvent) => {
    e.preventDefault();
    let sel = selected;
    if (!sel.has(it.id)) {
      sel = new Set([it.id]);
      setSelected(sel);
      anchor.current = it.id;
    }
    const list = items.filter((i) => sel.has(i.id));
    const one = list.length === 1 ? list[0] : null;
    const filesHere = (files ?? []).filter((f) => sel.has(f.id));
    const folder = one?.kind === 'folder' ? tree.folders.get(one.id) : undefined;
    setCtx({
      x: e.clientX,
      y: e.clientY,
      items: [
        ...(one ? [{ label: 'Abrir', icon: <External width={16} height={16} />, shortcut: 'Enter', onClick: () => openItem(one) }, 'sep' as const] : []),
        { label: 'Cortar', icon: <Scissors size={16} />, shortcut: 'Ctrl+X', onClick: () => copyOrCut('cut', list) },
        { label: 'Copiar', icon: <Copy size={16} />, shortcut: 'Ctrl+C', onClick: () => copyOrCut('copy', list) },
        ...(folder && clip ? [{ label: `Pegar en ${folder.name}`, icon: <ClipboardPaste size={16} />, onClick: () => doPaste(folder.id, folder.name) }] : []),
        'sep',
        ...(one ? [{ label: 'Cambiar nombre', icon: <Pencil width={16} height={16} />, shortcut: 'F2', onClick: () => startRename(one) }] : []),
        { label: 'Mover a…', icon: <Move width={16} height={16} />, onClick: () => setBulk('move') },
        ...(filesHere.length
          ? [
              { label: filesHere.length === 1 ? 'Descargar' : `Descargar ${filesHere.length} archivos`, icon: <Download width={16} height={16} />, onClick: () => download(filesHere) },
              { label: 'Guardar sin conexión', icon: <Offline width={16} height={16} />, onClick: saveSelectedOffline },
            ]
          : []),
        ...(folder ? [{ label: 'Compartir', icon: <Share width={16} height={16} />, onClick: () => setShareFor(folder) }] : []),
        'sep',
        { label: 'Eliminar', icon: <Trash width={16} height={16} />, shortcut: 'Supr', danger: true, onClick: () => setToDelete(list) },
      ],
    });
  };

  // Clic derecho en una carpeta del árbol de la izquierda.
  const treeMenu = (f: Folder) => (e: React.MouseEvent) => {
    e.preventDefault();
    const it: Item = { id: f.id, kind: 'folder', name: f.name, parentId: f.parentId };
    setCtx({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Abrir', icon: <External width={16} height={16} />, onClick: () => openFolder(f) },
        'sep',
        { label: 'Cortar', icon: <Scissors size={16} />, onClick: () => copyOrCut('cut', [it]) },
        { label: 'Copiar', icon: <Copy size={16} />, onClick: () => copyOrCut('copy', [it]) },
        ...(clip ? [{ label: `Pegar en ${f.name}`, icon: <ClipboardPaste size={16} />, onClick: () => doPaste(f.id, f.name) }] : []),
        'sep',
        { label: 'Cambiar nombre', icon: <Pencil width={16} height={16} />, onClick: () => setRenameTarget(it) },
        { label: 'Compartir', icon: <Share width={16} height={16} />, onClick: () => setShareFor(f) },
        'sep',
        { label: 'Eliminar', icon: <Trash width={16} height={16} />, danger: true, onClick: () => setToDelete([it]) },
      ],
    });
  };

  // Clic derecho en un lugar vacío: crear, pegar, subir, elegir todo y ordenar.
  const backgroundMenu = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-item],input,textarea')) return;
    e.preventDefault();
    clearSelection();
    setCtx({
      x: e.clientX,
      y: e.clientY,
      items: [
        ...(canUndo() ? [{ label: 'Deshacer', icon: <Undo2 size={16} />, shortcut: 'Ctrl+Z', onClick: doUndo }, 'sep' as const] : []),
        { label: 'Nueva carpeta', icon: <FolderPlus size={16} />, shortcut: 'Ctrl+Shift+N', onClick: newFolderInline },
        { label: clip ? `Pegar ${plural(clip.items.length)}` : 'Pegar', icon: <ClipboardPaste size={16} />, shortcut: 'Ctrl+V', disabled: !clip, onClick: () => doPaste() },
        'sep',
        { label: 'Subir archivos', icon: <UploadIcon width={16} height={16} />, onClick: () => fileInput.current?.click() },
        { label: 'Subir carpeta', icon: <FolderIcon width={16} height={16} />, onClick: () => folderInput.current?.click() },
        'sep',
        { label: 'Seleccionar todo', shortcut: 'Ctrl+A', onClick: () => setSelected(new Set(items.map((i) => i.id))) },
        {
          label: sort === 'nombre' ? 'Ordenar por más recientes' : 'Ordenar por nombre',
          icon: <SortIcon />,
          onClick: () => changeSort(sort === 'nombre' ? 'recientes' : 'nombre'),
        },
        { label: 'Actualizar', icon: <RefreshCw size={16} />, shortcut: 'F5', onClick: () => run(refresh) },
      ],
    });
  };

  // Elegir arrastrando un rectángulo sobre el fondo, como en el escritorio.
  const startMarquee = (e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('[data-item],button,input,textarea,a,select')) return;
    const add = e.ctrlKey || e.metaKey;
    const base = add ? new Set(selected) : new Set<string>();
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    const onMove = (ev: MouseEvent) => {
      const x = Math.min(sx, ev.clientX);
      const y = Math.min(sy, ev.clientY);
      const w = Math.abs(ev.clientX - sx);
      const h = Math.abs(ev.clientY - sy);
      if (!moved && w + h < 6) return;
      moved = true;
      ev.preventDefault();
      setMarquee({ x, y, w, h });
      const hit = new Set(base);
      for (const el of contentRef.current?.querySelectorAll<HTMLElement>('[data-item]') ?? []) {
        const r = el.getBoundingClientRect();
        if (r.right > x && r.left < x + w && r.bottom > y && r.top < y + h) hit.add(el.dataset.item!);
      }
      setSelected(hit);
    };
    const onUp = () => {
      removeEventListener('mousemove', onMove);
      removeEventListener('mouseup', onUp);
      setMarquee(null);
      if (!moved && !add) clearSelection();
    };
    addEventListener('mousemove', onMove);
    addEventListener('mouseup', onUp);
  };

  // Flechas: izquierda/derecha van al anterior o siguiente; arriba/abajo, al de la fila de arriba o abajo.
  const arrow = (key: string) => {
    const els = [...(contentRef.current?.querySelectorAll<HTMLElement>('[data-item]') ?? [])];
    if (!els.length) return;
    const i = els.findIndex((el) => el.dataset.item === anchor.current);
    let next = els[0];
    if (i >= 0) {
      const cur = els[i].getBoundingClientRect();
      if (key === 'ArrowRight') next = els[Math.min(els.length - 1, i + 1)];
      else if (key === 'ArrowLeft') next = els[Math.max(0, i - 1)];
      else {
        const down = key === 'ArrowDown';
        const cands = els.filter((el) => {
          const r = el.getBoundingClientRect();
          return down ? r.top >= cur.bottom - 2 : r.bottom <= cur.top + 2;
        });
        const dist = (el: HTMLElement) => {
          const r = el.getBoundingClientRect();
          return Math.abs(down ? r.top - cur.bottom : cur.top - r.bottom) * 10 + Math.abs(r.left - cur.left);
        };
        next = cands.sort((a, b) => dist(a) - dist(b))[0] ?? els[i];
      }
    }
    anchor.current = next.dataset.item!;
    setSelected(new Set([next.dataset.item!]));
    next.scrollIntoView({ block: 'nearest' });
  };

  keyHandler.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (e.defaultPrevented || /INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable) return;
    // No con una ventana, un archivo o un menú abiertos.
    if (ctx || renaming || [...document.querySelectorAll('[role="dialog"]')].some((d) => d.getClientRects().length)) return;
    if (new URLSearchParams(location.hash.split('?')[1]).has('f')) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && e.shiftKey && k === 'n') newFolderInline();
    else if (mod && k === 'z') doUndo();
    else if (mod && k === 'a') setSelected(new Set(items.map((i) => i.id)));
    else if (mod && k === 'c') copyOrCut('copy');
    else if (mod && k === 'x') copyOrCut('cut');
    else if (mod && k === 'v') doPaste();
    else if (e.key === 'Delete' && selectedItems.length) setToDelete(selectedItems);
    else if (e.key === 'F2' && selectedItems.length === 1) startRename(selectedItems[0]);
    else if (e.key === 'Enter' && selectedItems.length) openItem(selectedItems[0]);
    else if ((e.key === 'Backspace' || (e.altKey && e.key === 'ArrowLeft')) && current) openFolder(current.parent);
    else if (e.key === 'Escape' && selected.size) clearSelection();
    else if (e.key === 'F5') run(refresh);
    else if (!mod && !e.altKey && ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) arrow(e.key);
    else return;
    e.preventDefault();
  };

  const tile = (f: FileItem, code: string | undefined, title: string, subtitle?: string) => {
    const it: Item = { id: f.id, kind: 'file', name: f.name, parentId: f.folder?.id ?? m.id };
    return (
      <FileTile
        key={f.id}
        file={f}
        code={code}
        title={title}
        subtitle={subtitle}
        selected={selected.has(f.id)}
        selecting={selecting}
        offline={offline.has(f.id)}
        onToggle={() => {
          anchor.current = f.id;
          toggle(f.id);
        }}
        dragFiles={dragFor(it)}
        onMouseSelect={mouseSelect(f.id)}
        onMenu={itemMenu(it)}
        renaming={renaming === f.id}
        onRenamed={(name) => finishRename(it, name)}
        cut={cutIds.has(f.id)}
      />
    );
  };

  async function saveSelectedOffline() {
    const list = selectedFiles;
    try {
      for (let i = 0; i < list.length; i++) {
        toast(`Guardando sin conexión ${i + 1} de ${list.length}…`);
        await keepOffline(list[i]);
      }
      toast(`Listo: ${list.length} ${list.length === 1 ? 'archivo disponible' : 'archivos disponibles'} sin internet`);
      clearSelection();
    } catch (e) {
      toast(errorText(e));
    } finally {
      offlineIds().then(setOffline);
    }
  }

  // Para usarlos en otra app (por ejemplo, mandárselos a Claude): en el celu se comparten, en la compu se descargan.
  async function sendSelected() {
    const list = selectedFiles;
    try {
      const r = await sendFiles(list, (i, n) => n > 1 && toast(`Preparando ${i + 1} de ${n}…`));
      if (r === 'downloaded')
        toast(list.length === 1 ? 'Descargado. Arrastralo al chat donde lo necesites.' : `Se descargaron ${list.length} archivos. Arrastralos al chat donde los necesites.`);
      if (r !== 'cancelled') clearSelection();
    } catch (e) {
      toast(errorText(e));
    }
  }

  const changeSort = (s: Sort) => {
    setSort(s);
    try {
      localStorage.setItem(SORT_KEY, s);
    } catch {}
  };

  const menu: MenuItem[] = [
    {
      label: current ? `Compartir ${current.name}` : 'Compartir la materia',
      icon: <Share />,
      onClick: () => setModal('share'),
    },
    ...(current
      ? [
          { label: 'Renombrar carpeta', icon: <Pencil />, onClick: () => setModal('rename-folder') },
          { label: 'Sacar el contenido de esta carpeta', icon: <Move />, onClick: () => setModal('unwrap-folder') },
          { label: 'Eliminar carpeta', icon: <Trash />, danger: true, onClick: () => setModal('delete-folder') },
        ]
      : []),
    { label: 'Ver en Google Drive', icon: <External />, onClick: () => open(`https://drive.google.com/drive/folders/${destId}`, '_blank') },
    { label: 'Renombrar materia', icon: <Pencil />, onClick: () => setModal('rename-materia') },
    { label: 'Eliminar materia', icon: <Trash />, danger: true, onClick: () => setModal('delete-materia') },
  ];

  const pickInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      const items = mergeSameName(itemsFromInput(e.target.files), destName);
      if (items.length) setPicked(items);
    }
    e.target.value = '';
  };

  const searchBox = (autoFocus: boolean) => (
    <div className="flex items-center gap-2 h-10 px-3 rounded-xl bg-sunken border border-transparent focus-within:border-accent min-w-0">
      <SearchIcon width={18} height={18} className="text-muted shrink-0" />
      <input
        autoFocus={autoFocus}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setQuery('');
            setSearchOpen(false);
          }
        }}
        placeholder={`Buscar en ${m.name}…`}
        className="flex-1 bg-transparent outline-none text-[15px] min-w-0"
      />
      {query && (
        <button onClick={() => setQuery('')} aria-label="Borrar búsqueda" className="text-muted hover:text-ink">
          <Close width={18} height={18} />
        </button>
      )}
    </div>
  );

  // Carpeta abierta: subcarpetas arriba, archivos abajo. Sin carpeta: lo último y los sueltos.
  const content =
    files === null ? (
      <SkeletonGrid />
    ) : results ? (
      <SearchResults
        query={query}
        results={results}
        searching={contentHits === null && query.trim().length >= 3}
        materia={m}
        tile={tile}
      />
    ) : (
      <>
        {shownFolders.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 mb-6">
            {shownFolders.map((f) => {
              const it: Item = { id: f.id, kind: 'folder', name: f.name, parentId: f.parentId };
              return (
                <FolderCard
                  key={f.id}
                  id={f.id}
                  name={f.name}
                  color={m.color}
                  count={counts.get(f.id) ?? 0}
                  selected={selected.has(f.id)}
                  selecting={selecting}
                  cut={cutIds.has(f.id)}
                  renaming={renaming === f.id}
                  onRenamed={(name) => finishRename(it, name)}
                  onOpen={() => openFolder(f)}
                  onToggle={() => {
                    anchor.current = f.id;
                    toggle(f.id);
                  }}
                  onMouseSelect={mouseSelect(f.id)}
                  onMenu={itemMenu(it)}
                  dragItems={dragFor(it)}
                  onFileDrop={(d, copy) => moveTo(d, f.id, f.name, copy)}
                  onUpload={(dt) => uploadTo(dt, f.id, f.name)}
                  onUploadHover={(on) => setHoverFolder(on ? f.name : null)}
                />
              );
            })}
          </div>
        )}

        {here.list.length > 0 ? (
          <section>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-sm font-bold text-muted truncate">
                {current ? '' : 'Sueltos · '}
                {here.list.length} {here.list.length === 1 ? 'archivo' : 'archivos'}
              </h2>
              <div className="flex items-center gap-1 shrink-0 whitespace-nowrap">
                <button
                  onClick={() => (selecting ? clearSelection() : setSelectMode(true))}
                  className="h-9 px-2.5 rounded-xl text-sm font-semibold text-muted hover:text-ink hover:bg-sunken"
                >
                  {selecting ? 'Listo' : 'Seleccionar'}
                </button>
                <button
                  onClick={() => changeSort(sort === 'nombre' ? 'recientes' : 'nombre')}
                  title="Cambiar el orden"
                  className="h-9 px-3 rounded-xl bg-sunken text-sm font-semibold flex items-center gap-1.5"
                >
                  <SortIcon /> {sort === 'nombre' ? 'En orden' : 'Recientes'}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {here.list.map((f) => {
                const n = here.names.get(f.id)!;
                return tile(f, n.code, n.title);
              })}
            </div>
          </section>
        ) : (
          shownFolders.length === 0 && (
            <EmptyDrop onClick={() => fileInput.current?.click()} title={current ? 'Esta carpeta está vacía' : 'Todavía no hay nada acá'} />
          )
        )}
      </>
    );

  return (
    <div
      className="min-h-dvh"
      onDragOver={(e) => {
        e.preventDefault();
        // Solo archivos que vienen de la compu; los cuadraditos de la app se mueven entre carpetas.
        if (e.dataTransfer.types.includes('Files')) setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <input ref={fileInput} type="file" multiple hidden onChange={pickInput} />
      <input ref={folderInput} type="file" multiple hidden onChange={pickInput} />
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={pickInput} />

      <div className="lg:flex">
        {/* Compu: barra lateral con la materia y sus carpetas */}
        <aside className="hidden lg:flex flex-col w-72 shrink-0 h-dvh sticky top-0 overflow-y-auto border-r border-line px-4 py-5 gap-5">
          <button onClick={() => go('/')} className="flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink -ml-1">
            <Back width={18} height={18} /> Inicio
          </button>
          <DropTarget onFile={(d, copy) => moveTo(d, m.id, m.name, copy)}>
            {(over) => (
              <button
                onClick={() => openFolder()}
                className={`text-left rounded-2xl p-2 -m-2 transition ${over ? 'bg-accent-soft ring-2 ring-accent' : ''}`}
              >
                <MateriaCover m={m} className="h-24 rounded-2xl mb-3" />
                <h1 className="text-xl font-extrabold tracking-tight leading-tight">{m.name}</h1>
                <p className="text-sm text-muted mt-0.5">{year?.name}</p>
              </button>
            )}
          </DropTarget>

          <MateriaSummary m={m} onOpen={() => setModal('info')} />

          <nav className="flex flex-col gap-0.5 -mx-2">
            <TreeItem
              label="Toda la materia"
              depth={0}
              on={!current}
              color={m.color}
              onClick={() => openFolder()}
              onFileDrop={(d, copy) => moveTo(d, m.id, m.name, copy)}
              onUpload={(dt) => uploadTo(dt, m.id, m.name)}
              onUploadHover={(on) => setHoverFolder(on ? m.name : null)}
            />
            {m.folders.map((f) => (
              <FolderTree key={f.id} folder={f} depth={0} current={current} path={path} counts={counts} color={m.color} open={openFolder} drop={moveTo} menu={treeMenu} upload={uploadTo} hover={setHoverFolder} />
            ))}
            <button
              onClick={newFolderInline}
              title="Ctrl+Shift+N"
              className="flex items-center gap-2 h-9 px-3 rounded-xl text-sm font-semibold text-muted hover:text-ink hover:bg-sunken"
            >
              <Plus width={18} height={18} /> Nueva carpeta{current && ` en ${current.name}`}
            </button>
          </nav>
        </aside>

        <main className="flex-1 min-w-0">
          {/* Celu y tablet: barra de arriba fija */}
          <header className="lg:hidden sticky top-0 z-20 bg-bg/90 backdrop-blur safe-top">
            <div className="flex items-center gap-1 h-14 px-2">
              <IconButton label="Volver" onClick={goBack}>
                <Back />
              </IconButton>
              {searchOpen ? (
                <div className="flex-1 min-w-0">{searchBox(true)}</div>
              ) : (
                <button onClick={() => openFolder()} className="flex-1 min-w-0 flex items-center gap-2 text-left">
                  <MateriaBadge m={m} size={28} />
                  <span className="font-bold text-[17px] truncate">{m.name}</span>
                </button>
              )}
              <IconButton
                label={searchOpen ? 'Cerrar búsqueda' : 'Buscar en la materia'}
                onClick={() => {
                  if (searchOpen) setQuery('');
                  setSearchOpen(!searchOpen);
                }}
              >
                {searchOpen ? <Close /> : <SearchIcon />}
              </IconButton>
              <Menu items={menu} />
            </div>
            {/* Pestañas de carpetas */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 pb-3">
              <Tab on={!current} onClick={() => openFolder()}>
                General
              </Tab>
              {m.folders.map((f) => (
                <Tab key={f.id} on={path[0]?.id === f.id} onClick={() => openFolder(f)} count={counts.get(f.id) ?? 0}>
                  {f.name}
                </Tab>
              ))}
              <button
                onClick={() => setModal('new-folder')}
                aria-label="Nueva carpeta"
                className="shrink-0 h-9 w-9 rounded-full border border-dashed border-line grid place-items-center text-muted"
              >
                <Plus width={18} height={18} />
              </button>
            </div>
          </header>

          {/* Compu: barra de herramientas */}
          <div className="hidden lg:flex items-center gap-3 px-8 pt-6 pb-4">
            <nav className="flex items-center gap-1 min-w-0 flex-1 text-[15px]">
              {!current && <span className="font-bold text-xl truncate">Toda la materia</span>}
              {path.map((f, i) => (
                <span key={f.id} className="flex items-center gap-1 min-w-0">
                  {i > 0 && <ChevronRight width={16} height={16} className="text-muted shrink-0" />}
                  <button
                    onClick={() => openFolder(f)}
                    className={`truncate ${i === path.length - 1 ? 'font-bold text-xl' : 'text-muted hover:text-ink font-medium'}`}
                  >
                    {f.name}
                  </button>
                </span>
              ))}
            </nav>
            <div className="w-56 xl:w-64">{searchBox(false)}</div>
            <Button variant="primary" onClick={() => fileInput.current?.click()}>
              <UploadIcon /> Subir archivos
            </Button>
            <Button onClick={() => folderInput.current?.click()} title="Subir carpeta">
              <FolderIcon /> <span className="hidden xl:inline">Subir carpeta</span>
            </Button>
            <Menu items={menu} />
          </div>

          <div
            ref={contentRef}
            onMouseDown={startMarquee}
            onContextMenu={backgroundMenu}
            className={`px-4 sm:px-6 lg:px-8 pb-28 lg:pb-12 min-h-[calc(100dvh-7rem)] ${marquee ? 'select-none' : ''}`}
          >
            {/* Celu: resumen de fechas y notas, y camino de subcarpetas */}
            <div className="lg:hidden">
              {!current && !results && (
                <div className="mb-5">
                  <MateriaSummary m={m} onOpen={() => setModal('info')} />
                </div>
              )}
              {path.length > 1 && !results && (
                <button
                  onClick={() => openFolder(current!.parent)}
                  className="flex items-center gap-1 text-sm font-semibold text-muted mb-3"
                >
                  <Back width={16} height={16} /> {path.slice(0, -1).map((f) => f.name).join(' › ')}
                  <span className="text-ink"> › {current!.name}</span>
                </button>
              )}
            </div>
            {content}
          </div>
        </main>
      </div>

      {/* Celu: botón + para subir */}
      {!selecting && (
        <button
          onClick={() => setModal('add')}
          aria-label="Agregar"
          className="lg:hidden fixed right-4 bottom-24 z-30 size-14 rounded-2xl bg-accent text-on-accent shadow-lg grid place-items-center active:scale-95 transition"
        >
          <Plus width={28} height={28} />
        </button>
      )}

      {modal === 'add' && (
        <Modal title={`Agregar a ${destName}`} onClose={() => setModal(null)}>
          <div className="grid gap-2">
            <SheetAction icon={<UploadIcon />} label="Subir archivos" hint="PDF, Word, fotos…" onClick={() => (setModal(null), fileInput.current?.click())} />
            <SheetAction icon={<Camera />} label="Sacar una foto" hint="Del pizarrón o de tus apuntes" onClick={() => (setModal(null), cameraInput.current?.click())} />
            <SheetAction icon={<FolderIcon />} label="Subir una carpeta entera" onClick={() => (setModal(null), folderInput.current?.click())} />
            <SheetAction icon={<Plus />} label="Nueva carpeta" onClick={() => setModal('new-folder')} />
          </div>
        </Modal>
      )}
      {modal === 'info' && <MateriaInfoModal m={m} onClose={() => setModal(null)} />}
      {modal === 'share' && <ShareModal target={current ?? m} onClose={() => setModal(null)} />}

      {selecting && (
        <div className="fixed inset-x-0 bottom-20 lg:bottom-0 z-40 flex justify-center px-3 pb-4 lg:pl-20 safe-bottom pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-1 bg-ink text-bg rounded-2xl shadow-xl p-1.5 pl-4 max-w-full overflow-x-auto no-scrollbar sheet-up">
            <span className="font-semibold text-[15px] whitespace-nowrap mr-2">
              {selected.size}
              <span className="hidden sm:inline"> {selected.size === 1 ? 'seleccionado' : 'seleccionados'}</span>
            </span>
            <BarButton onClick={() => setSelected(new Set(items.map((i) => i.id)))}>Todos</BarButton>
            <BarButton disabled={!selected.size} onClick={() => copyOrCut('copy')} label="Copiar">
              <Copy size={18} /> <span className="hidden sm:inline">Copiar</span>
            </BarButton>
            <BarButton disabled={!selected.size} onClick={() => copyOrCut('cut')} label="Cortar">
              <Scissors size={18} /> <span className="hidden sm:inline">Cortar</span>
            </BarButton>
            <BarButton disabled={!selectedFiles.length} onClick={sendSelected} label={canSendToApp() ? 'Enviar a otra app' : 'Descargar'}>
              {canSendToApp() ? <Share width={18} height={18} /> : <Download width={18} height={18} />}
              <span className="hidden sm:inline">{canSendToApp() ? 'Enviar' : 'Descargar'}</span>
            </BarButton>
            <BarButton disabled={!selected.size} onClick={() => setBulk('move')} label="Mover">
              <Move width={18} height={18} /> <span className="hidden sm:inline">Mover</span>
            </BarButton>
            <BarButton disabled={!selectedFiles.length} onClick={saveSelectedOffline} label="Guardar sin conexión">
              <Offline width={18} height={18} /> <span className="hidden xl:inline">Sin conexión</span>
            </BarButton>
            <BarButton disabled={!selected.size} onClick={() => setToDelete(selectedItems)} label="Eliminar">
              <Trash width={18} height={18} /> <span className="hidden sm:inline">Eliminar</span>
            </BarButton>
            <BarButton onClick={clearSelection} label="Cancelar selección">
              <Close width={18} height={18} />
            </BarButton>
          </div>
        </div>
      )}

      {/* Lo copiado o cortado espera acá hasta que lo pegues, aunque cambies de carpeta o de materia. */}
      {clip && !selecting && (
        <div className="fixed inset-x-0 bottom-20 lg:bottom-0 z-40 flex justify-center px-3 pb-4 lg:pl-20 safe-bottom pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-1 bg-ink text-bg rounded-2xl shadow-xl p-1.5 pl-4 max-w-full sheet-up">
            <span className="text-[15px] whitespace-nowrap mr-2 truncate">
              {plural(clip.items.length)} {clip.mode === 'cut' ? 'cortados' : 'copiados'}
            </span>
            <BarButton onClick={() => doPaste()}>
              <ClipboardPaste size={18} /> Pegar acá
            </BarButton>
            <BarButton onClick={() => setClipboard(null)} label="Vaciar portapapeles">
              <Close width={18} height={18} />
            </BarButton>
          </div>
        </div>
      )}
      {bulk === 'move' && (
        <MoveModal
          files={selectedItems.map((i) => ({ id: i.id, name: i.name, mimeType: i.kind === 'folder' ? FOLDER : '', modifiedTime: '', parents: [i.parentId] }))}
          exclude={selectedItems.filter((i) => i.kind === 'folder').map((i) => i.id)}
          initialMateria={m.id}
          initialFolder={current?.id}
          onClose={() => setBulk(null)}
          onMoved={(moved, where) => {
            recordMove(selectedItems.filter((i) => moved.some((x) => x.id === i.id)), moved[0]?.parents?.[0] ?? '');
            undoToast(`${plural(moved.length)} movidos a ${where}`);
            clearSelection();
            refresh();
          }}
        />
      )}
      {toDelete && (
        <ConfirmModal
          title={toDelete.length === 1 ? `¿Eliminar ${toDelete[0].name}?` : `¿Eliminar ${toDelete.length} elementos?`}
          text={`${toDelete.some((i) => i.kind === 'folder') ? 'Las carpetas se eliminan con todo lo que tienen adentro. ' : ''}Van a la papelera de Google Drive y se pueden recuperar desde ahí durante 30 días.`}
          action="Eliminar"
          onClose={() => setToDelete(null)}
          onConfirm={async () => {
            await removeItems(toDelete);
            undoToast(`${plural(toDelete.length)} en la papelera de Drive`);
            clearSelection();
            await refresh();
          }}
        />
      )}
      {renameTarget && (
        <PromptModal
          title="Cambiar nombre"
          initial={renameTarget.name}
          onClose={() => setRenameTarget(null)}
          onSubmit={async (name) => {
            await renameItem(renameTarget, name);
            await refresh();
          }}
        />
      )}
      {shareFor && <ShareModal target={shareFor} onClose={() => setShareFor(null)} />}
      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={() => setCtx(null)} />}
      {marquee && (
        <div
          className="fixed z-30 pointer-events-none rounded-sm border border-accent bg-accent/10"
          style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
        />
      )}

      {dragging && (
        <div className="fixed inset-3 z-40 rounded-3xl border-4 border-dashed border-accent bg-accent-soft/20 flex justify-center items-start pt-6 pointer-events-none">
          <p className="px-5 py-2.5 rounded-full bg-accent text-on-accent font-bold shadow-lg text-center">
            Soltá para subir a {hoverFolder ?? destName}
          </p>
        </div>
      )}

      {picked && (
        <UploadSheet
          items={picked}
          parentId={uploadDest?.id ?? destId}
          destName={uploadDest?.name ?? destName}
          onClose={() => {
            setPicked(null);
            setUploadDest(null);
            reload();
          }}
          onDone={async (n) => {
            const where = uploadDest?.name ?? destName;
            setPicked(null);
            setUploadDest(null);
            toast(n === 1 ? `Guardado en ${where}` : `${n} archivos guardados en ${where}`);
            await refresh();
          }}
        />
      )}
      {modal === 'new-folder' && (
        <PromptModal
          title={current ? `Nueva carpeta en ${current.name}` : 'Nueva carpeta'}
          placeholder="Ej: Trabajos prácticos"
          action="Crear carpeta"
          onClose={() => setModal(null)}
          onSubmit={async (name) => {
            const f = await addFolder(name, destId);
            await reload();
            go(`/m/${m.id}/${f.id}`);
          }}
        />
      )}
      {modal === 'rename-folder' && current && (
        <PromptModal
          title="Nombre de la carpeta"
          initial={current.name}
          onClose={() => setModal(null)}
          onSubmit={async (name) => {
            await renameFolder(current.id, name);
            await reload();
          }}
        />
      )}
      {modal === 'unwrap-folder' && current && (
        <ConfirmModal
          title={`¿Sacar todo de ${current.name}?`}
          text={`Las carpetas y archivos de adentro pasan a ${current.parent?.name ?? m.name}, y la carpeta “${current.name}” vacía se borra.`}
          action="Sacar contenido"
          danger={false}
          onClose={() => setModal(null)}
          onConfirm={async () => {
            const target = current.parent?.id ?? m.id;
            // Se pregunta a Drive lo que queda adentro, así reintentar después de un corte funciona.
            const children = await list(`'${current.id}' in parents and trashed=false`);
            for (const c of children) await move(c.id, [current.id], target);
            // Solo se borra si de verdad quedó vacía.
            const left = await list(`'${current.id}' in parents and trashed=false`);
            if (left.length) throw new Error(`Quedaron ${left.length} elementos sin mover. Reintentá.`);
            await trashFolder(current.id);
            openFolder(current.parent);
            await reload();
            toast(`Listo, ${children.length} elementos pasaron a ${current.parent?.name ?? m.name}`);
          }}
        />
      )}
      {modal === 'delete-folder' && current && (
        <ConfirmModal
          title={`¿Eliminar ${current.name}?`}
          text="La carpeta y todo lo que tiene adentro van a la papelera de Google Drive. Podés recuperarlos desde ahí durante 30 días."
          action="Eliminar"
          onClose={() => setModal(null)}
          onConfirm={async () => {
            await trashFolder(current.id);
            openFolder(current.parent);
            await reload();
            toast('Carpeta en la papelera de Drive');
          }}
        />
      )}
      {modal === 'rename-materia' && (
        <PromptModal
          title="Nombre de la materia"
          initial={m.name}
          onClose={() => setModal(null)}
          onSubmit={async (name) => {
            await renameFolder(m.id, name);
            await reload();
          }}
        />
      )}
      {modal === 'delete-materia' && (
        <ConfirmModal
          title={`¿Eliminar ${m.name}?`}
          text="La materia y todos sus archivos van a la papelera de Google Drive. Podés recuperarlos desde ahí durante 30 días."
          action="Eliminar"
          onClose={() => setModal(null)}
          onConfirm={async () => {
            await trashFolder(m.id);
            go('/');
            await reload();
            toast('Listo. Está en la papelera de Drive por 30 días.');
          }}
        />
      )}
    </div>
  );
}

function SearchResults({
  query,
  results,
  searching,
  materia,
  tile,
}: {
  query: string;
  results: { byName: FileItem[]; byContent: FileItem[] };
  searching: boolean;
  materia: Materia;
  tile: (f: FileItem, code: string | undefined, title: string, subtitle?: string) => ReactNode;
}) {
  if (results.byName.length + results.byContent.length === 0)
    return (
      <p className="text-muted text-center py-10">
        {searching ? 'Buscando…' : `No encontramos nada con “${query.trim()}” en ${materia.name}.`}
      </p>
    );
  return (
    <section>
      {results.byName.length > 0 && (
        <>
          <h2 className="text-sm font-bold text-muted mb-3">
            {results.byName.length} {results.byName.length === 1 ? 'archivo' : 'archivos'} con ese nombre
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {results.byName.map((f) => tile(f, undefined, baseName(f.name), placeLabel(f)))}
          </div>
        </>
      )}
      {results.byContent.length > 0 && (
        <>
          <h2 className="text-sm font-bold text-muted mb-3 mt-8">Lo mencionan adentro</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {results.byContent.map((f) => tile(f, undefined, baseName(f.name), placeLabel(f)))}
          </div>
        </>
      )}
    </section>
  );
}

// Árbol de carpetas de la barra lateral. Se despliega solo el camino de la carpeta abierta.
function FolderTree({
  folder,
  depth,
  current,
  path,
  counts,
  color,
  open,
  drop,
  menu,
  upload,
  hover,
}: {
  folder: Folder;
  depth: number;
  current?: Folder;
  path: Folder[];
  counts: Map<string, number>;
  color: string;
  open: (f?: Folder) => void;
  drop: (d: DragFile[], id: string, name: string, copy: boolean) => void;
  menu: (f: Folder) => (e: React.MouseEvent) => void;
  upload: (dt: DataTransfer, id: string, name: string) => void;
  hover: (name: string | null) => void;
}) {
  const inPath = path.some((p) => p.id === folder.id);
  const [expanded, setExpanded] = useState(inPath);
  useEffect(() => {
    if (inPath) setExpanded(true);
  }, [inPath]);
  return (
    <>
      <TreeItem
        label={folder.name}
        depth={depth}
        on={current?.id === folder.id}
        color={color}
        count={counts.get(folder.id) ?? 0}
        expandable={folder.children.length > 0}
        expanded={expanded}
        onToggle={() => setExpanded(!expanded)}
        onClick={() => {
          open(folder);
          setExpanded(true);
        }}
        onFileDrop={(d, copy) => drop(d, folder.id, folder.name, copy)}
        onMenu={menu(folder)}
        onUpload={(dt) => upload(dt, folder.id, folder.name)}
        onUploadHover={(on) => hover(on ? folder.name : null)}
      />
      {expanded &&
        folder.children.map((c) => (
          <FolderTree key={c.id} folder={c} depth={depth + 1} current={current} path={path} counts={counts} color={color} open={open} drop={drop} menu={menu} upload={upload} hover={hover} />
        ))}
    </>
  );
}

function TreeItem({
  label,
  depth,
  on,
  color,
  count,
  expandable,
  expanded,
  onToggle,
  onClick,
  onFileDrop,
  onMenu,
  onUpload,
  onUploadHover,
}: {
  label: string;
  depth: number;
  on: boolean;
  color: string;
  count?: number;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  onClick: () => void;
  onFileDrop: (d: DragFile[], copy: boolean) => void;
  onMenu?: (e: React.MouseEvent) => void;
  onUpload?: (dt: DataTransfer) => void;
  onUploadHover?: (on: boolean) => void;
}) {
  return (
    <DropTarget onFile={onFileDrop} onUpload={onUpload} onUploadHover={onUploadHover}>
      {(over) => (
        <div
          className={`group flex items-center h-9 rounded-xl text-sm transition ${
            over ? 'bg-accent-soft ring-2 ring-accent' : on ? 'bg-accent-soft text-ink font-bold' : 'hover:bg-sunken'
          }`}
          style={{ paddingLeft: 4 + depth * 16 }}
          onContextMenu={onMenu}
        >
          <button
            onClick={onToggle}
            aria-label={expanded ? 'Plegar' : 'Desplegar'}
            className={`size-6 grid place-items-center text-muted shrink-0 ${expandable ? '' : 'invisible'}`}
          >
            <ChevronRight width={14} height={14} className={`transition ${expanded ? 'rotate-90' : ''}`} />
          </button>
          <button onClick={onClick} className="flex-1 min-w-0 flex items-center gap-2 h-full pr-3 text-left">
            <svg viewBox="0 0 48 40" className="w-5 h-auto shrink-0" aria-hidden>
              <path d="M4 8a4 4 0 0 1 4-4h11l5 5h16a4 4 0 0 1 4 4v3H4z" fill={color} opacity=".55" />
              <rect x="4" y="13" width="40" height="23" rx="4" fill={count === 0 ? 'var(--line)' : color} />
            </svg>
            <span className="truncate flex-1">{label}</span>
            {count !== undefined && count > 0 && <span className="text-xs text-muted font-medium">{count}</span>}
          </button>
        </div>
      )}
    </DropTarget>
  );
}

function Tab({ on, onClick, count, children }: { on: boolean; onClick: () => void; count?: number; children: ReactNode }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!on) return;
    // Solo se mueve la fila de pestañas (scrollIntoView movería toda la página).
    const id = setTimeout(() => {
      const el = ref.current;
      const row = el?.parentElement;
      if (!el || !row) return;
      const delta = el.getBoundingClientRect().left - row.getBoundingClientRect().left;
      row.scrollTo({ left: row.scrollLeft + delta - row.clientWidth / 2 + el.clientWidth / 2, behavior: 'smooth' });
    }, 0);
    return () => clearTimeout(id);
  }, [on]);
  return (
    <button
      ref={ref}
      onClick={onClick}
      className={`shrink-0 h-9 px-4 rounded-full text-sm font-semibold border transition flex items-center gap-1.5 whitespace-nowrap ${
        on ? 'bg-ink text-bg border-ink' : 'bg-surface border-line'
      }`}
    >
      {children}
      {!!count && <span className={on ? 'opacity-70' : 'text-muted'}>{count}</span>}
    </button>
  );
}

function SheetAction({ icon, label, hint, onClick }: { icon: ReactNode; label: string; hint?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-4 p-3 rounded-2xl hover:bg-sunken text-left">
      <span className="size-11 rounded-xl bg-accent-soft text-accent grid place-items-center shrink-0">{icon}</span>
      <span>
        <span className="font-semibold block">{label}</span>
        {hint && <span className="text-sm text-muted">{hint}</span>}
      </span>
    </button>
  );
}

// Carpeta en la grilla. Con el mouse funciona como en Windows (clic elige, doble clic abre, clic derecho, arrastrar);
// en el celu se abre con un toque y se elige manteniendo apretado.
function FolderCard({
  id,
  name,
  color,
  count,
  selected,
  selecting,
  cut,
  renaming,
  onRenamed,
  onOpen,
  onToggle,
  onMouseSelect,
  onMenu,
  dragItems,
  onFileDrop,
  onUpload,
  onUploadHover,
}: {
  id: string;
  name: string;
  color: string;
  count: number;
  selected: boolean;
  selecting: boolean;
  cut: boolean;
  renaming: boolean;
  onRenamed: (name: string | null) => void;
  onOpen: () => void;
  onToggle: () => void;
  onMouseSelect: (e: React.MouseEvent) => void;
  onMenu: (e: React.MouseEvent) => void;
  dragItems: () => DragFile[];
  onFileDrop: (d: DragFile[], copy: boolean) => void;
  onUpload: (dt: DataTransfer) => void;
  onUploadHover: (on: boolean) => void;
}) {
  const pointer = useRef('mouse');
  const press = useRef<number>(undefined);
  const longPressed = useRef(false);
  return (
    <DropTarget onFile={onFileDrop} onUpload={onUpload} onUploadHover={onUploadHover}>
      {(over) => (
        <div data-item={id} className={cut ? 'opacity-50' : ''}>
          <button
            onPointerDown={(e) => (pointer.current = e.pointerType)}
            onClick={(e) => {
              if (longPressed.current) return void (longPressed.current = false);
              if (pointer.current === 'mouse') return onMouseSelect(e);
              if (selecting) onToggle();
              else onOpen();
            }}
            onDoubleClick={() => pointer.current === 'mouse' && onOpen()}
            onContextMenu={(e) => (pointer.current === 'mouse' ? onMenu(e) : e.preventDefault())}
            onTouchStart={() => {
              press.current = window.setTimeout(() => {
                longPressed.current = true;
                navigator.vibrate?.(15);
                onToggle();
              }, 450);
            }}
            onTouchEnd={() => clearTimeout(press.current)}
            onTouchMove={() => clearTimeout(press.current)}
            draggable={!renaming}
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(dragItems()));
              e.dataTransfer.effectAllowed = 'copyMove';
            }}
            className={`w-full text-left border rounded-2xl flex items-center gap-3 p-3 transition select-none [-webkit-touch-callout:none] ${
              over
                ? 'bg-accent-soft border-accent ring-2 ring-accent'
                : selected
                  ? 'bg-accent-soft border-accent ring-2 ring-accent'
                  : 'bg-surface border-line hover:border-muted/40 hover:shadow-sm'
            }`}
          >
            <svg viewBox="0 0 48 40" className="w-9 h-auto shrink-0" aria-hidden>
              <path d="M4 8a4 4 0 0 1 4-4h11l5 5h16a4 4 0 0 1 4 4v3H4z" fill={color} opacity=".55" />
              <rect x="4" y="13" width="40" height="23" rx="4" fill={count ? color : 'var(--line)'} />
            </svg>
            <div className="min-w-0 flex-1">
              {renaming ? (
                <RenameInput initial={name} isFile={false} onDone={onRenamed} />
              ) : (
                <div className="font-semibold leading-snug line-clamp-2 text-[15px]">{name}</div>
              )}
              <div className="text-xs text-muted mt-0.5">
                {over ? 'Soltá acá' : count ? `${count} ${count === 1 ? 'archivo' : 'archivos'}` : 'Vacía'}
              </div>
            </div>
          </button>
        </div>
      )}
    </DropTarget>
  );
}

// Recibe archivos o carpetas arrastrados. Con Ctrl apretado se copian en vez de moverse. "contents" no altera la grilla.
// También recibe archivos y carpetas que se sueltan desde la compu: se suben adentro de esta carpeta.
function DropTarget({
  onFile,
  onUpload,
  onUploadHover,
  children,
}: {
  onFile: (d: DragFile[], copy: boolean) => void;
  onUpload?: (dt: DataTransfer) => void;
  onUploadHover?: (on: boolean) => void;
  children: (over: boolean) => ReactNode;
}) {
  const [over, setOver] = useState(false);
  const fromApp = (e: DragEvent) => e.dataTransfer.types.includes(DRAG_TYPE);
  const fromPc = (e: DragEvent) => !!onUpload && e.dataTransfer.types.includes('Files');
  const leave = () => {
    setOver(false);
    onUploadHover?.(false);
  };
  return (
    <div
      className="contents"
      onDragOver={(e) => {
        if (!fromApp(e) && !fromPc(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = fromPc(e) || e.ctrlKey ? 'copy' : 'move';
        if (!over && fromPc(e)) onUploadHover?.(true);
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) leave();
      }}
      onDrop={(e) => {
        const raw = e.dataTransfer.getData(DRAG_TYPE);
        if (raw) {
          e.preventDefault();
          e.stopPropagation();
          leave();
          onFile(JSON.parse(raw), e.ctrlKey);
        } else if (fromPc(e)) {
          e.preventDefault();
          e.stopPropagation();
          leave();
          onUpload!(e.dataTransfer);
        }
      }}
    >
      {children(over)}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3" aria-label="Cargando">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="rounded-2xl border border-line overflow-hidden bg-surface">
          <div className="aspect-[4/3] skeleton" />
          <div className="p-3 space-y-2">
            <div className="h-3.5 rounded skeleton w-4/5" />
            <div className="h-3 rounded skeleton w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyDrop({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-3xl border border-dashed border-line py-14 px-6 text-center hover:border-accent transition"
    >
      <p className="font-bold text-lg">{title}</p>
      <p className="text-muted mt-1">
        Tocá acá para subir archivos
        <span className="hidden md:inline">, o arrastrá archivos y carpetas enteras a esta ventana</span>.
      </p>
    </button>
  );
}

function BarButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="h-10 px-3 rounded-xl text-sm font-semibold flex items-center gap-1.5 hover:bg-white/15 disabled:opacity-40 whitespace-nowrap"
    >
      {children}
    </button>
  );
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

// Dónde está un archivo dentro de la materia: 'Trabajos prácticos › TP1' o 'Suelto en la materia'.
function placeLabel(f: FileItem) {
  return (
    folderPath(f.folder)
      .map((x) => x.name)
      .join(' › ') || 'Suelto en la materia'
  );
}

function SortIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" />
    </svg>
  );
}
