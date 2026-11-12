// Rutas con "#" para que funcione el botón Atrás del celular.
//   #/              inicio
//   #/m/<id>        una materia
//   #/buscar?q=     buscador
//   #/fechas        próximas fechas
//   #/entregas      TPs y actividades para entregar
//   #/carrera       plan de estudios y porcentaje de la carrera
//   #/yo            tu perfil, promedio y ajustes
//   #/importar/<id> recibir apuntes que te compartieron
//   #/ia            preguntarle a la IA
//   #/repaso        repaso del día (preguntas y racha)
//   ...?f=<id>      archivo abierto encima de cualquier pantalla

import { useEffect, useState } from 'react';

export type Route = { name: 'home' | 'materia' | 'search' | 'fechas' | 'entregas' | 'carrera' | 'yo' | 'importar' | 'ia' | 'repaso'; id?: string; folder?: string; q?: string; file?: string };

function split() {
  const [path, qs = ''] = location.hash.replace(/^#/, '').split('?');
  return { path: path || '/', params: new URLSearchParams(qs) };
}

export function parse(): Route {
  const { path, params } = split();
  const parts = path.split('/').filter(Boolean);
  const file = params.get('f') ?? undefined;
  if (parts[0] === 'm' && parts[1]) return { name: 'materia', id: parts[1], folder: parts[2], file };
  if (parts[0] === 'buscar') return { name: 'search', q: params.get('q') ?? '', file };
  if (parts[0] === 'fechas') return { name: 'fechas', file };
  if (parts[0] === 'entregas') return { name: 'entregas', file };
  if (parts[0] === 'carrera') return { name: 'carrera', file };
  if (parts[0] === 'yo') return { name: 'yo', file };
  if (parts[0] === 'ia') return { name: 'ia', file };
  if (parts[0] === 'repaso') return { name: 'repaso' };
  if (parts[0] === 'importar' && parts[1]) return { name: 'importar', id: parts[1] };
  return { name: 'home', file };
}

const notify = () => dispatchEvent(new Event('facu:route'));

export function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const f = () => setRoute(parse());
    for (const e of ['hashchange', 'popstate', 'facu:route']) addEventListener(e, f);
    return () => {
      for (const e of ['hashchange', 'popstate', 'facu:route']) removeEventListener(e, f);
    };
  }, []);
  return route;
}

export function go(path: string) {
  location.hash = path;
}

function build(path: string, params: URLSearchParams) {
  const qs = params.toString();
  return `#${path}${qs ? `?${qs}` : ''}`;
}

export function setParam(key: string, value: string | null) {
  const { path, params } = split();
  if (value) params.set(key, value);
  else params.delete(key);
  history.replaceState(history.state, '', build(path, params));
  notify();
}

export function openFile(id: string) {
  const { path, params } = split();
  params.set('f', id);
  history.pushState({ viewer: true }, '', build(path, params));
  notify();
}

export function closeFile() {
  if (history.state?.viewer) return history.back();
  setParam('f', null);
}

// Archivos que se están viendo (en el orden de la pantalla), para pasar al anterior o siguiente en el lector.
let viewerList: string[] = [];
export const setViewerList = (ids: string[]) => {
  viewerList = ids;
};
export const getViewerList = () => viewerList;
export const switchFile = (id: string) => setParam('f', id);

// Última materia que se abrió, para que la IA sepa de qué estás hablando.
let lastMateria: string | undefined;
export const setLastMateria = (id: string) => {
  lastMateria = id;
};
export const getLastMateria = () => lastMateria;
