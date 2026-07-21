import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { GameProps } from "./GameShell";

type Board = number[][];
type Dir = "up" | "down" | "left" | "right";
const SIZE = 4;

const TILE_COLORS: Record<number, string> = {
  2: "bg-[#eee4da]",
  4: "bg-[#ede0c8]",
  8: "bg-[#f2b179]",
  16: "bg-[#f59563]",
  32: "bg-[#f67c5f]",
  64: "bg-[#f65e3b]",
  128: "bg-[#edcf72]",
  256: "bg-[#edcc61]",
  512: "bg-[#edc850]",
  1024: "bg-[#edc53f]",
  2048: "bg-[#edc22e]",
};

function emptyBoard(): Board {
  return Array.from({ length: SIZE }, () => Array<number>(SIZE).fill(0));
}

function addRandom(board: Board): Board {
  const cells: [number, number][] = [];
  board.forEach((row, r) => row.forEach((v, c) => {
    if (v === 0) cells.push([r, c]);
  }));
  if (cells.length === 0) return board;
  const [r, c] = cells[Math.floor(Math.random() * cells.length)];
  const nb = board.map((row) => row.slice());
  nb[r][c] = Math.random() < 0.9 ? 2 : 4;
  return nb;
}

function mergeLeft(row: number[]): { row: number[]; gained: number } {
  const filtered = row.filter((v) => v !== 0);
  const result: number[] = [];
  let gained = 0;
  for (let i = 0; i < filtered.length; i++) {
    if (filtered[i] === filtered[i + 1]) {
      const merged = filtered[i] * 2;
      result.push(merged);
      gained += merged;
      i++;
    } else {
      result.push(filtered[i]);
    }
  }
  while (result.length < SIZE) result.push(0);
  return { row: result, gained };
}

function move(board: Board, dir: Dir): { board: Board; gained: number; moved: boolean } {
  let working = board;
  if (dir === "right") working = board.map((row) => [...row].reverse());
  else if (dir === "up") working = board[0].map((_, c) => board.map((row) => row[c]));
  else if (dir === "down") working = board[0].map((_, c) => board.map((row) => row[c]).reverse());

  let gained = 0;
  const movedRows = working.map((row) => {
    const { row: nr, gained: g } = mergeLeft(row);
    gained += g;
    return nr;
  });

  let result = movedRows;
  if (dir === "right") result = movedRows.map((row) => [...row].reverse());
  else if (dir === "up") result = movedRows[0].map((_, c) => movedRows.map((row) => row[c]));
  else if (dir === "down") result = movedRows[0].map((_, c) => movedRows.map((row) => row[c]).reverse());

  const moved = JSON.stringify(result) !== JSON.stringify(board);
  return { board: result, gained, moved };
}

function hasMoves(board: Board): boolean {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] === 0) return true;
      if (c < SIZE - 1 && board[r][c] === board[r][c + 1]) return true;
      if (r < SIZE - 1 && board[r][c] === board[r + 1][c]) return true;
    }
  }
  return false;
}

export function Game2048({ onGameOver }: GameProps) {
  const { t } = useTranslation();
  const [board, setBoard] = useState<Board>(() => addRandom(addRandom(emptyBoard())));
  const [score, setScore] = useState(0);
  const [, setOver] = useState(false);
  const scoreRef = useRef(0);
  const overRef = useRef(false);

  const doMove = useCallback(
    (dir: Dir) => {
      if (overRef.current) return;
      setBoard((prev) => {
        const { board: nb, gained, moved } = move(prev, dir);
        if (!moved) return prev;
        const newScore = scoreRef.current + gained;
        scoreRef.current = newScore;
        setScore(newScore);
        const withNew = addRandom(nb);
        if (!hasMoves(withNew)) {
          overRef.current = true;
          setOver(true);
          setTimeout(() => onGameOver(newScore), 0);
        }
        return withNew;
      });
    },
    [onGameOver],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const map: Record<string, Dir> = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
        w: "up",
        s: "down",
        a: "left",
        d: "right",
      };
      const dir = map[e.key];
      if (dir) {
        e.preventDefault();
        doMove(dir);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doMove]);

  return (
    <div className="max-w-sm mx-auto select-none">
      <div className="flex justify-between items-center mb-3">
        <span className="font-bold t-primary">{t("games.2048.name")}</span>
        <span className="t-secondary text-sm">
          {t("game.score")}: {score}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2 bg-secondary p-2 rounded-xl">
        {board.flat().map((v, i) => (
          <div
            key={i}
            className={`aspect-square rounded-lg flex items-center justify-center font-bold text-lg ${
              v ? TILE_COLORS[v] ?? "bg-[#3c3a32] text-white" : "bg-w/40"
            }`}
          >
            {v || ""}
          </div>
        ))}
      </div>
      <p className="text-center text-xs t-secondary mt-2">{t("games.2048.hint")}</p>
    </div>
  );
}
