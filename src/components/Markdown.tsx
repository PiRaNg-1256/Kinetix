// Minimal, dependency-free markdown renderer for agent output: headings, lists, bold, italics,
// strikethrough, inline code and links. Input is model text, so we never inject raw HTML.

import { Fragment, type ReactNode } from "react";

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|~~[^~]+~~|`[^`]+`|_[^_\n]+_|\*[^*\n]+\*|\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith("**")) out.push(<strong key={k}>{inline(tok.slice(2, -2), k)}</strong>);
    else if (tok.startsWith("~~")) out.push(<s key={k} className="text-slate-400">{tok.slice(2, -2)}</s>);
    else if (tok.startsWith("`")) out.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("[")) {
      const label = tok.slice(1, tok.indexOf("]"));
      out.push(
        <a key={k} href={m[2]} target="_blank" rel="noreferrer">
          {label}
        </a>,
      );
    } else out.push(<em key={k} className="text-slate-500">{inline(tok.slice(1, -1), k)}</em>);
    last = m.index! + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[][] } | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      const k = `p${blocks.length}`;
      blocks.push(<p key={k}>{inline(para.join(" "), k)}</p>);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const k = `l${blocks.length}`;
      const items = list.items.map((item, idx) => (
        <li key={`${k}-${idx}`}>
          {item.map((l, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              {inline(l, `${k}-${idx}-${j}`)}
            </Fragment>
          ))}
        </li>
      ));
      blocks.push(list.ordered ? <ol key={k}>{items}</ol> : <ul key={k}>{items}</ul>);
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const cont = line.match(/^\s{2,}(\S.*)$/);
    if (h) {
      flushPara();
      flushList();
      const k = `h${blocks.length}`;
      blocks.push(h[1].length <= 2 ? <h2 key={k}>{inline(h[2], k)}</h2> : <h3 key={k}>{inline(h[2], k)}</h3>);
    } else if (ul || ol) {
      flushPara();
      const ordered = Boolean(ol);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push([(ul ?? ol)![1]]);
    } else if (cont && list) {
      list.items[list.items.length - 1].push(cont[1]);
    } else if (!line.trim()) {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return <div className="prose-kx text-sm text-slate-700">{blocks}</div>;
}
