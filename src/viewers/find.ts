// Búsqueda de palabras dentro de un documento (como Ctrl+F).
// No distingue mayúsculas ni tildes: "pagina" encuentra "Página".

const fold = (c: string) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Arma el texto "plano" y, para cada letra, en qué posición del texto original estaba.
// Los espacios seguidos cuentan como uno solo.
function flatten(text: string) {
  let flat = '';
  const at: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (/\s/.test(c)) {
      if (flat.endsWith(' ') || flat === '') continue;
      flat += ' ';
      at.push(i);
      continue;
    }
    for (const f of fold(c)) {
      flat += f;
      at.push(i);
    }
  }
  return { flat, at };
}

export function normalizeQuery(q: string) {
  return flatten(q.trim()).flat;
}

// Devuelve [inicio, fin) de cada coincidencia, en posiciones del texto original.
export function findAll(text: string, query: string): [number, number][] {
  const q = normalizeQuery(query);
  if (!q) return [];
  const { flat, at } = flatten(text);
  const out: [number, number][] = [];
  for (let i = flat.indexOf(q); i !== -1; i = flat.indexOf(q, i + q.length)) {
    out.push([at[i], at[i + q.length - 1] + 1]);
  }
  return out;
}

// Mueve el contenedor con scroll para que el rectángulo quede en el medio de la pantalla.
export function scrollToRect(from: Element, rect: DOMRect) {
  const scroller = from.closest('[data-scroll]');
  if (!scroller) return;
  const box = scroller.getBoundingClientRect();
  scroller.scrollBy({
    top: rect.top + rect.height / 2 - (box.top + box.height / 2),
    left: rect.left < box.left || rect.right > box.right ? rect.left + rect.width / 2 - (box.left + box.width / 2) : 0,
    behavior: 'smooth',
  });
}
