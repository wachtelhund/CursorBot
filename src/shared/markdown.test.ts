import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMarkdown, safeHttps } from "./markdown.ts";

function texts(nodes: { type: string; value?: string; children?: unknown; href?: string }[]): string {
  return JSON.stringify(nodes);
}

test("parses Chefen-style team bullets with bold and https links", () => {
  const blocks = parseMarkdown(
    [
      "**Team**",
      "- **Chefen** — role. https://cursor.com/agents/bc-abc",
      "- **Apputvecklare** — builds the app",
    ].join("\n"),
  );

  assert.equal(blocks[0]?.type, "p");
  assert.equal(blocks[0] && "children" in blocks[0] ? blocks[0].children[0]?.type : "", "bold");
  assert.equal(blocks[1]?.type, "ul");
  if (blocks[1]?.type !== "ul") throw new Error("expected ul");
  assert.equal(blocks[1].items.length, 2);
  assert.equal(blocks[1].items[0]?.[0]?.type, "bold");
  const link = blocks[1].items[0]?.find((node) => node.type === "link");
  assert.equal(link?.type, "link");
  if (link?.type === "link") {
    assert.equal(link.href, "https://cursor.com/agents/bc-abc");
  }
});

test("highlights a full spaced roster name, not just the first word", () => {
  const [p] = parseMarkdown("fråga @Ediel Expert vad senaste status är", [
    "Chief",
    "Ediel Expert",
  ]);
  assert.equal(p?.type, "p");
  if (p?.type !== "p") throw new Error("expected p");
  const mention = p.children.find((node) => node.type === "mention");
  assert.equal(mention?.type === "mention" ? mention.value : "", "@Ediel Expert");
  assert.equal(
    p.children.some((node) => node.type === "text" && node.value.startsWith(" Expert")),
    false,
  );
});

test("does not invent @Ediel when only Ediel Expert exists", () => {
  const [p] = parseMarkdown("@Ediel Expert: status", ["Ediel Expert"]);
  assert.equal(p?.type, "p");
  if (p?.type !== "p") throw new Error("expected p");
  assert.deepEqual(
    p.children.filter((node) => node.type === "mention").map((node) =>
      node.type === "mention" ? node.value : "",
    ),
    ["@Ediel Expert"],
  );
});

test("renders bold, italic, inline code, and mentions", () => {
  const [p] = parseMarkdown("see **bold** and *italic* plus `aws login` @Chefen");
  assert.equal(p?.type, "p");
  if (p?.type !== "p") throw new Error("expected p");
  assert.deepEqual(
    p.children.map((node) => node.type),
    ["text", "bold", "text", "italic", "text", "code", "text", "mention"],
  );
  assert.equal(p.children[5]?.type === "code" ? p.children[5].value : "", "aws login");
  assert.equal(p.children[7]?.type === "mention" ? p.children[7].value : "", "@Chefen");
});

test("headings and numbered lists", () => {
  const blocks = parseMarkdown("## Status\n1. first\n2. second");
  assert.equal(blocks[0]?.type, "h");
  if (blocks[0]?.type === "h") assert.equal(blocks[0].level, 2);
  assert.equal(blocks[1]?.type, "ol");
  if (blocks[1]?.type === "ol") assert.equal(blocks[1].items.length, 2);
});

test("only https links are safe", () => {
  assert.equal(safeHttps("https://cursor.com/agents"), "https://cursor.com/agents");
  assert.equal(safeHttps("http://example.com"), null);
  assert.equal(safeHttps("javascript:alert(1)"), null);
  const [p] = parseMarkdown("go http://evil.example and [x](javascript:alert(1))");
  if (p?.type !== "p") throw new Error("expected p");
  assert.equal(
    p.children.every((node) => node.type !== "link"),
    true,
    texts(p.children),
  );
});

test("keeps raw HTML as text", () => {
  const [p] = parseMarkdown("<script>alert(1)</script> **ok**");
  if (p?.type !== "p") throw new Error("expected p");
  assert.equal(p.children[0]?.type, "text");
  if (p.children[0]?.type === "text") {
    assert.equal(p.children[0].value.includes("<script>"), true);
  }
  assert.equal(p.children.some((node) => node.type === "bold"), true);
});
