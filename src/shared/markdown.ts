export type Inline =
  | { type: "text"; value: string }
  | { type: "bold"; children: Inline[] }
  | { type: "italic"; children: Inline[] }
  | { type: "code"; value: string }
  | { type: "mention"; value: string }
  | { type: "link"; href: string; children: Inline[] };

export type Block =
  | { type: "p"; children: Inline[] }
  | { type: "h"; level: 1 | 2 | 3; children: Inline[] }
  | { type: "ul"; items: Inline[][] }
  | { type: "ol"; items: Inline[][] };

import { matchRosterMention, type RosterEntry } from "./mentions.ts";

export function safeHttps(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function parseInline(text: string, roster: RosterEntry[]): Inline[] {
  const out: Inline[] = [];
  let rest = text;

  while (rest.length > 0) {
    const hit = nextInline(rest, roster);
    if (!hit) {
      out.push({ type: "text", value: rest });
      break;
    }
    if (hit.index > 0) out.push({ type: "text", value: rest.slice(0, hit.index) });
    out.push(hit.node);
    rest = rest.slice(hit.index + hit.length);
  }

  return out;
}

type Hit = { index: number; length: number; node: Inline };

function nextInline(text: string, roster: RosterEntry[]): Hit | null {
  let best: Hit | null = null;

  function take(index: number, length: number, node: Inline) {
    if (index < 0) return;
    if (!best || index < best.index) best = { index, length, node };
  }

  const code = /`([^`]+)`/.exec(text);
  if (code?.index !== undefined) {
    take(code.index, code[0].length, { type: "code", value: code[1] });
  }

  const mdLink = /\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/.exec(text);
  if (mdLink?.index !== undefined) {
    const href = safeHttps(mdLink[2]);
    if (href) {
      take(mdLink.index, mdLink[0].length, {
        type: "link",
        href,
        children: parseInline(mdLink[1], roster),
      });
    }
  }

  const url = /https:\/\/[^\s<>[\]`'"]+/.exec(text);
  if (url?.index !== undefined) {
    const raw = url[0].replace(/[.,;:!?)]+$/, "");
    const href = safeHttps(raw);
    if (href) {
      take(url.index, raw.length, {
        type: "link",
        href,
        children: [{ type: "text", value: raw }],
      });
    }
  }

  const bold = /\*\*([^\n]+?)\*\*/.exec(text);
  if (bold?.index !== undefined) {
    take(bold.index, bold[0].length, { type: "bold", children: parseInline(bold[1], roster) });
  }

  const italic = /(?<!\*)\*(?!\*)([^\n*]+)\*(?!\*)/.exec(text);
  if (italic?.index !== undefined) {
    take(italic.index, italic[0].length, {
      type: "italic",
      children: parseInline(italic[1], roster),
    });
  }

  const at = text.indexOf("@");
  if (at >= 0) {
    if (roster.length > 0) {
      const hit = matchRosterMention(text.slice(at + 1), roster);
      if (hit) {
        const value = `@${text.slice(at + 1, at + 1 + hit.consumed)}`;
        take(at, value.length, { type: "mention", value });
      }
    } else {
      const mention = /@[A-Za-zÅÄÖåäö0-9_\-]+/.exec(text);
      if (mention?.index !== undefined) {
        take(mention.index, mention[0].length, { type: "mention", value: mention[0] });
      }
    }
  }

  return best;
}

const HEADING = /^(#{1,3})\s+(.+)$/;
const UL = /^[-*]\s+(.+)$/;
const OL = /^\d+\.\s+(.+)$/;

export function parseMarkdown(src: string, names: string[] = []): Block[] {
  const roster = names.map((name) => ({ id: name, name }));
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3;
      blocks.push({ type: "h", level, children: parseInline(heading[2], roster) });
      i += 1;
      continue;
    }

    if (UL.test(line)) {
      const items: Inline[][] = [];
      while (i < lines.length) {
        const item = UL.exec(lines[i]);
        if (!item) break;
        items.push(parseInline(item[1], roster));
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    if (OL.test(line)) {
      const items: Inline[][] = [];
      while (i < lines.length) {
        const item = OL.exec(lines[i]);
        if (!item) break;
        items.push(parseInline(item[1], roster));
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    blocks.push({ type: "p", children: parseInline(line, roster) });
    i += 1;
  }

  return blocks;
}
