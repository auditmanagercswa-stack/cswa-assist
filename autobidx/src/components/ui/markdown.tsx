import type { ReactNode } from "react";

/**
 * Minimal, safe Markdown renderer for CMS content (## / ### headings, - lists, **bold**, *italic*, [links](/path)).
 * Produces React elements only — no raw HTML is ever injected, so CMS content can't cause XSS.
 */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\((?:\/[^\s)]*|https:\/\/[^\s)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) out.push(<strong key={`${key}-${i++}`}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("[")) {
      const [, label, href] = t.match(/\[([^\]]+)\]\(([^)]+)\)/)!;
      out.push(<a key={`${key}-${i++}`} href={href} className="font-semibold text-ignite-600 underline" rel={href.startsWith("http") ? "noopener noreferrer" : undefined}>{label}</a>);
    } else out.push(<em key={`${key}-${i++}`}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  const lines = source.replace(/\r/g, "").split("\n");
  let list: string[] = [];
  let para: string[] = [];
  const flushList = () => {
    if (list.length) blocks.push(<ul key={`ul${blocks.length}`}>{list.map((l, i) => <li key={i}>{inline(l, `li${blocks.length}-${i}`)}</li>)}</ul>);
    list = [];
  };
  const flushPara = () => {
    if (para.length) blocks.push(<p key={`p${blocks.length}`}>{inline(para.join(" "), `p${blocks.length}`)}</p>);
    para = [];
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^###\s+/.test(line)) { flushList(); flushPara(); blocks.push(<h3 key={`h${blocks.length}`}>{line.replace(/^###\s+/, "")}</h3>); }
    else if (/^##\s+/.test(line)) { flushList(); flushPara(); blocks.push(<h2 key={`h${blocks.length}`}>{line.replace(/^##\s+/, "")}</h2>); }
    else if (/^[-*]\s+/.test(line)) { flushPara(); list.push(line.replace(/^[-*]\s+/, "")); }
    else if (!line.trim()) { flushList(); flushPara(); }
    else { flushList(); para.push(line.trim()); }
  }
  flushList();
  flushPara();
  return <div className="prose-cms">{blocks}</div>;
}
