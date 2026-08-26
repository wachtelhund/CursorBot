import type { ReactNode } from "react";
import type { Block, Inline } from "@shared/markdown";
import { parseMarkdown } from "@shared/markdown";

function openHttps(href: string) {
  void window.cursorBots?.openExternal(href);
}

function renderInline(nodes: Inline[], prefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${prefix}-${index}`;
    switch (node.type) {
      case "text":
        return <span key={key}>{node.value}</span>;
      case "bold":
        return <strong key={key}>{renderInline(node.children, key)}</strong>;
      case "italic":
        return <em key={key}>{renderInline(node.children, key)}</em>;
      case "code":
        return (
          <code key={key} className="chat-code">
            {node.value}
          </code>
        );
      case "mention":
        return (
          <span key={key} className="mention">
            {node.value}
          </span>
        );
      case "link":
        return (
          <a
            key={key}
            href={node.href}
            className="chat-link"
            onClick={(event) => {
              event.preventDefault();
              openHttps(node.href);
            }}
          >
            {renderInline(node.children, key)}
          </a>
        );
    }
  });
}

function renderBlock(block: Block, index: number): ReactNode {
  const key = `b${index}`;
  switch (block.type) {
    case "p":
      return <p key={key}>{renderInline(block.children, key)}</p>;
    case "h": {
      const Tag = block.level === 1 ? "h3" : block.level === 2 ? "h4" : "h5";
      return <Tag key={key}>{renderInline(block.children, key)}</Tag>;
    }
    case "ul":
      return (
        <ul key={key}>
          {block.items.map((item, itemIndex) => (
            <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol key={key}>
          {block.items.map((item, itemIndex) => (
            <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>
          ))}
        </ol>
      );
  }
}

export function ChatMarkdown({ text }: { text: string }) {
  return <div className="chat-md">{parseMarkdown(text).map(renderBlock)}</div>;
}
