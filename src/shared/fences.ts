/**
 * Routing parsers must not act on text a bot is quoting.
 * A line inside a ``` / ~~~ block, or wrapped in a single code span,
 * is documentation — never an assignment, spawn, or group command.
 */

export type ScannedLine = {
  text: string;
  fenced: boolean;
};

const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;
const CODE_SPAN_LINE_RE = /^\s*`[^`]+`\s*$/;

export function scanFences(text: string): ScannedLine[] {
  const out: ScannedLine[] = [];
  let open: string | null = null;

  for (const line of text.split(/\r?\n/)) {
    const marker = FENCE_RE.exec(line)?.[1];
    if (open) {
      out.push({ text: line, fenced: true });
      if (marker && marker[0] === open[0] && marker.length >= open.length) {
        open = null;
      }
      continue;
    }
    if (marker) {
      open = marker;
      out.push({ text: line, fenced: true });
      continue;
    }
    out.push({ text: line, fenced: false });
  }

  return out;
}

/** A whole line that is one code span: `@Name: do x` is a quote, not a wake. */
export function isCodeSpanLine(line: string): boolean {
  return CODE_SPAN_LINE_RE.test(line);
}

export function isRoutableLine(line: ScannedLine): boolean {
  return !line.fenced && !isCodeSpanLine(line.text);
}

/** Lines a routing parser may act on, in order. */
export function routableLines(text: string): string[] {
  return scanFences(text)
    .filter(isRoutableLine)
    .map((line) => line.text);
}

/** Same line count, quoted lines blanked — for parsers that scan every line. */
export function maskQuoted(text: string): string {
  return scanFences(text)
    .map((line) => (isRoutableLine(line) ? line.text : ""))
    .join("\n");
}
