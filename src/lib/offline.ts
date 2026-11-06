// Guardado local para usar la app sin internet (IndexedDB del navegador).
//  - "lists": la última respuesta de cada búsqueda en Drive, para poder navegar sin conexión.
//  - "files": los archivos que elegiste guardar sin conexión.

export type Saved = { id: string; name: string; mimeType: string; modifiedTime: string; blob: Blob };

let dbp: Promise<IDBDatabase> | null = null;
function db() {
  dbp ??= new Promise((ok, err) => {
    const r = indexedDB.open('mochi', 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('lists');
      r.result.createObjectStore('files');
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => err(r.error);
  });
  return dbp;
}

async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((ok, err) => {
    const r = fn(d.transaction(store, mode).objectStore(store));
    r.onsuccess = () => ok(r.result);
    r.onerror = () => err(r.error);
  });
}

// Nunca deja que un problema del guardado local rompa la app.
const safe = async <T>(p: () => Promise<T>, fallback: T) => {
  try {
    return await p();
  } catch {
    return fallback;
  }
};

// Al cerrar sesión se borra lo guardado de las carpetas, para que otra cuenta no vea lo anterior al abrir.
export const clearLists = () => safe(() => run('lists', 'readwrite', (s) => s.clear()), undefined);

export const putList =(key: string, value: unknown) => safe(() => run('lists', 'readwrite', (s) => s.put(value, key)), undefined);
export const getList = <T>(key: string) => safe(() => run<T | undefined>('lists', 'readonly', (s) => s.get(key)), undefined);

export const saveOffline = (f: Saved) => safe(() => run('files', 'readwrite', (s) => s.put(f, f.id)), undefined);
export const getOffline = (id: string) => safe(() => run<Saved | undefined>('files', 'readonly', (s) => s.get(id)), undefined);
export const removeOffline = (id: string) => safe(() => run('files', 'readwrite', (s) => s.delete(id)), undefined);

// Ids de los archivos guardados, para marcarlos en la lista sin leer los archivos enteros.
export const offlineIds = () =>
  safe(async () => new Set((await run<IDBValidKey[]>('files', 'readonly', (s) => s.getAllKeys())).map(String)), new Set<string>());

export const isNetworkError = (e: unknown) => e instanceof TypeError || !navigator.onLine;
