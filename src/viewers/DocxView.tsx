import mammoth from 'mammoth/mammoth.browser.js';
import { useEffect, useRef, useState } from 'react';
import { Spinner } from '../components/ui';
import FindBar from './FindBar';
import { findAll, scrollToRect } from './find';

// Los resaltados usan CSS.highlights: marcan el texto sin tocar el documento.
const highlights = (globalThis.CSS as { highlights?: Map<string, unknown> } | undefined)?.highlights;
const HighlightCtor = (globalThis as { Highlight?: new (...r: Range[]) => unknown }).Highlight;

export default function DocxView({ blob, find, onCloseFind }: { blob: Blob; find?: boolean; onCloseFind?: () => void }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState('');
  const article = useRef<HTMLElement>(null);
  const [ranges, setRanges] = useState<Range[]>([]);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    let alive = true;
    blob
      .arrayBuffer()
      .then((arrayBuffer) => mammoth.convertToHtml({ arrayBuffer }))
      .then((r) => alive && setHtml(r.value))
      .catch(() => alive && setError('No se pudo abrir este documento.'));
    return () => {
      alive = false;
    };
  }, [blob]);

  function onQuery(q: string) {
    const root = article.current;
    if (!root || !q.trim()) return setRanges([]);
    // Junta todo el texto del documento recordando de qué nodo sale cada parte.
    const nodes: { node: Text; start: number }[] = [];
    let text = '';
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const blockOf = (n: Node) => n.parentElement?.closest('p,li,td,th,h1,h2,h3,h4,h5,h6');
    let prevBlock: Element | null | undefined;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      // Entre párrafos va un espacio para que no se peguen las palabras.
      const block = blockOf(n);
      if (nodes.length && block !== prevBlock) text += ' ';
      prevBlock = block;
      nodes.push({ node: n as Text, start: text.length });
      text += (n as Text).data;
    }
    const locate = (pos: number, end: boolean) => {
      let i = nodes.length - 1;
      while (i > 0 && (end ? nodes[i].start >= pos : nodes[i].start > pos)) i--;
      return { node: nodes[i].node, offset: Math.min(pos - nodes[i].start, nodes[i].node.length) };
    };
    const found = findAll(text, q).map(([a, b]) => {
      const r = document.createRange();
      const s = locate(a, false);
      const e = locate(b, true);
      r.setStart(s.node, s.offset);
      r.setEnd(e.node, e.offset);
      return r;
    });
    setRanges(found);
    setCurrent(0);
  }

  const step = (dir: 1 | -1) => ranges.length && setCurrent((c) => (c + dir + ranges.length) % ranges.length);

  useEffect(() => {
    if (!find) setRanges([]);
  }, [find]);

  useEffect(() => {
    if (!highlights || !HighlightCtor) return;
    highlights.delete('find');
    highlights.delete('find-on');
    if (!ranges.length) return;
    const on = ranges[current];
    highlights.set('find', new HighlightCtor(...ranges.filter((r) => r !== on)));
    if (on) {
      highlights.set('find-on', new HighlightCtor(on));
      scrollToRect(article.current!, on.getBoundingClientRect());
    }
  }, [ranges, current]);

  useEffect(
    () => () => {
      highlights?.delete('find');
      highlights?.delete('find-on');
    },
    [],
  );

  if (error) return <p className="text-center text-muted py-10">{error}</p>;
  if (html === null)
    return (
      <div className="py-16 grid place-items-center">
        <Spinner />
      </div>
    );
  return (
    <div className="px-3 sm:px-6 py-4">
      {find && (
        <FindBar count={ranges.length} current={current} onQuery={onQuery} onStep={step} onClose={() => onCloseFind?.()} />
      )}
      <article
        ref={article}
        className="doc-body max-w-[800px] mx-auto bg-surface border border-line rounded-2xl px-5 sm:px-12 py-8 sm:py-12 text-[16px]"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
