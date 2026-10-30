// Contenido de un archivo: usa la copia guardada sin conexión si está al día,
// y si no hay internet usa la copia aunque sea vieja.

import { download, slidesPdf, type DFile } from './drive';
import { getList, getOffline, isNetworkError, putList, removeOffline, saveOffline } from './offline';

export async function fileBlob(file: DFile): Promise<Blob> {
  const saved = await getOffline(file.id);
  if (saved && saved.modifiedTime === file.modifiedTime) return saved.blob;
  try {
    const blob = await download(file.id);
    // Si estaba guardado pero cambió en Drive, se actualiza la copia.
    if (saved) await saveOffline({ ...saved, name: file.name, modifiedTime: file.modifiedTime, blob });
    return blob;
  } catch (e) {
    if (saved) return saved.blob;
    if (isNetworkError(e)) throw new Error('Sin conexión. Este archivo no está guardado para verlo sin internet.');
    throw e;
  }
}

// Las presentaciones se ven como PDF. El PDF convertido queda guardado, así la próxima vez
// abre al instante y también sin internet.
export async function slidesBlob(file: DFile): Promise<Blob> {
  const key = `pdf:${file.id}`;
  const saved = await getList<{ modifiedTime: string; blob: Blob }>(key);
  if (saved && saved.modifiedTime === file.modifiedTime) return saved.blob;
  try {
    const blob = await slidesPdf(file.id);
    await putList(key, { modifiedTime: file.modifiedTime, blob });
    return blob;
  } catch (e) {
    if (saved) return saved.blob;
    if (isNetworkError(e)) throw new Error('Sin conexión. Esta presentación todavía no se abrió con internet.');
    throw e;
  }
}

export async function keepOffline(file: DFile) {
  const blob = await fileBlob(file);
  await saveOffline({ id: file.id, name: file.name, mimeType: file.mimeType, modifiedTime: file.modifiedTime, blob });
}

export const dropOffline = removeOffline;

// Datos mínimos de un archivo guardado, para abrirlo sin internet aunque no esté en ninguna lista.
export async function offlineMeta(id: string): Promise<DFile | null> {
  const s = await getOffline(id);
  return s ? { id: s.id, name: s.name, mimeType: s.mimeType, modifiedTime: s.modifiedTime } : null;
}
