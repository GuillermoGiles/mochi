// Proceso de fondo de la extensión: abre Mochi en la app instalada (no en una pestaña del navegador).
// La ventanita se cierra al tocar el link, por eso esto corre acá.

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const chrome: any;

const MOCHI = 'https://mochi-facu.vercel.app';

// Espera a que aparezca una ventana de Mochi recién abierta.
function waitForMochiTab(timeout = 10_000): Promise<any | null> {
  return new Promise((resolve) => {
    const done = (tab: any | null) => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timer);
      resolve(tab);
    };
    const onUpdated = (_id: number, _info: unknown, tab: any) => {
      if (tab.url?.startsWith(MOCHI)) done(tab);
    };
    const timer = setTimeout(() => done(null), timeout);
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

async function openMochi(url: string) {
  // 1. Si la app ya está abierta, se la lleva a la materia y se la trae adelante.
  for (const tab of await chrome.tabs.query({ url: `${MOCHI}/*` })) {
    const win = await chrome.windows.get(tab.windowId);
    if (win.type === 'app') {
      await chrome.tabs.update(tab.id, { url });
      await chrome.windows.update(tab.windowId, { focused: true });
      return;
    }
  }
  // 2. Si está instalada, se abre la app y después se navega a la materia.
  const apps = await chrome.management.getAll();
  const app = apps.find((a: any) => a.isApp && a.enabled && String(a.appLaunchUrl ?? '').startsWith(MOCHI));
  if (app) {
    const opened = waitForMochiTab();
    await chrome.management.launchApp(app.id);
    const tab = await opened;
    if (tab) {
      if (tab.url !== url) await chrome.tabs.update(tab.id, { url });
      return;
    }
  }
  // 3. Si no está instalada, en una pestaña común.
  await chrome.tabs.create({ url });
}

chrome.runtime.onMessage.addListener((msg: any) => {
  if (msg?.type === 'open-mochi' && typeof msg.url === 'string' && msg.url.startsWith(MOCHI)) openMochi(msg.url);
});
