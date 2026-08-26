import { BUDDY_KINDS, type BuddyKind } from "@shared/types";

export type BuddyMood = "idle" | "thinking" | "waiting";

const COLORS: Record<BuddyKind, string> = {
  mound: "#F4F4F4",
  drop: "#5EC8F2",
  pebble: "#E85D9A",
  puff: "#FF5A5A",
  wedge: "#7CFF6B",
  bean: "#FFC93C",
  loaf: "#C084FC",
  pip: "#FF7A59",
};

type Frames = { a: string[]; b: string[] };

const SPRITES: Record<BuddyKind, Frames> = {
  mound: {
    a: [
      "..#....#..",
      "...#..#...",
      "..######..",
      ".##.##.##.",
      "##########",
      "#.######.#",
      "#.#....#.#",
      "...#..#...",
    ],
    b: [
      "..#....#..",
      "#..#..#..#",
      "..######..",
      ".##.##.##.",
      "##########",
      "#.######.#",
      "..#....#..",
      ".#......#.",
    ],
  },
  drop: {
    a: [
      "..#.....#..",
      "#..#...#..#",
      "#.###.###.#",
      "###.#.#.###",
      "###########",
      ".#########.",
      "..#.....#..",
      ".#.......#.",
    ],
    b: [
      "..#.....#..",
      "...#...#...",
      "#.###.###.#",
      "###.#.#.###",
      "###########",
      ".#########.",
      "#..#...#..#",
      "..#.....#..",
    ],
  },
  pebble: {
    a: [
      "....####....",
      ".##########.",
      "############",
      "###..##..###",
      "############",
      "..###..###..",
      ".##..##..##.",
      "##........##",
    ],
    b: [
      "....####....",
      ".##########.",
      "############",
      "###..##..###",
      "############",
      ".##..##..##.",
      "#..##..##..#",
      ".##......##.",
    ],
  },
  puff: {
    a: [
      "......#.......",
      "....#####.....",
      "..##########..",
      ".############.",
      "#.##.####.##.#",
      "##############",
      "..###....###..",
    ],
    b: [
      "......#.......",
      "....#####.....",
      "..##########..",
      ".############.",
      "#.##.####.##.#",
      "##############",
      "###........###",
    ],
  },
  wedge: {
    a: [
      "...#...#...",
      "....#.#....",
      "..#######..",
      ".##.#.#.##.",
      "###########",
      "#.#######.#",
      "#.#.....#.#",
      "..##...##..",
    ],
    b: [
      "...#...#...",
      "#...#.#...#",
      "..#######..",
      ".##.#.#.##.",
      "###########",
      "#.#######.#",
      ".#.#...#.#.",
      "#..#...#..#",
    ],
  },
  bean: {
    a: [
      ".#.........#.",
      "#.#.......#.#",
      ".###########.",
      "##..#####..##",
      "#############",
      ".###########.",
      "..#.#...#.#..",
      ".#.........#.",
    ],
    b: [
      ".#.........#.",
      "..#.......#..",
      ".###########.",
      "##..#####..##",
      "#############",
      ".###########.",
      "#.#.#...#.#.#",
      "...#.....#...",
    ],
  },
  loaf: {
    a: [
      "..##....##..",
      ".##########.",
      "############",
      "##.###.###.#",
      "############",
      ".##.#..#.##.",
      "#..#....#..#",
      ".##......##.",
    ],
    b: [
      "..##....##..",
      ".##########.",
      "############",
      "##.###.###.#",
      "############",
      "#.##.#..##.#",
      "..#......#..",
      "##........##",
    ],
  },
  pip: {
    a: [
      "...##...",
      "..####..",
      ".######.",
      "##.##.##",
      "########",
      "#.####.#",
      ".#....#.",
      "#......#",
    ],
    b: [
      "...##...",
      "..####..",
      ".######.",
      "##.##.##",
      "########",
      "#.####.#",
      "#.#..#.#",
      ".#....#.",
    ],
  },
};

function cells(rows: string[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  rows.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      if (cell === "#") out.push({ x, y });
    });
  });
  return out;
}

export function kindFromSeed(seed: string): BuddyKind {
  let hash = 0;
  for (const char of seed) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return BUDDY_KINDS[hash % BUDDY_KINDS.length];
}

export function buddyKindFor(bot: { id: string; character?: BuddyKind }): BuddyKind {
  if (bot.character && BUDDY_KINDS.includes(bot.character)) return bot.character;
  return kindFromSeed(bot.id);
}

export function BotFace({
  bot,
  mood = "idle",
  size,
  className = "",
}: {
  bot: { id: string; character?: BuddyKind; avatar?: string };
  mood?: BuddyMood;
  size: number;
  className?: string;
}) {
  if (bot.avatar) {
    return (
      <img
        src={bot.avatar}
        alt=""
        width={size}
        height={size}
        className={`bot-face shrink-0 rounded-full object-cover${mood === "thinking" ? " bot-face-thinking" : ""} ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return <Buddy kind={buddyKindFor(bot)} mood={mood} size={size} className={className} />;
}

function PixelFrame({
  rows,
  color,
  className,
}: {
  rows: string[];
  color: string;
  className: string;
}) {
  const width = Math.max(...rows.map((row) => row.length), 0);
  const height = rows.length;
  const originX = (16 - width) / 2;
  const originY = (16 - height) / 2;
  return (
    <g className={className} fill={color}>
      {cells(rows).map((cell) => (
        <rect
          key={`${cell.x}-${cell.y}`}
          x={originX + cell.x}
          y={originY + cell.y}
          width={1}
          height={1}
        />
      ))}
    </g>
  );
}

export function Buddy({
  kind,
  mood = "idle",
  size = 48,
  className = "",
}: {
  kind: BuddyKind;
  mood?: BuddyMood;
  size?: number;
  className?: string;
}) {
  const color = COLORS[kind];
  const sprite = SPRITES[kind];
  return (
    <svg
      className={`buddy buddy-${mood} ${className}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <g className="invader-pack">
        <PixelFrame rows={sprite.a} color={color} className="invader-a" />
        <PixelFrame rows={sprite.b} color={color} className="invader-b" />
      </g>
    </svg>
  );
}
