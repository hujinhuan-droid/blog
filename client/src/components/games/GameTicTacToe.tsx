import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { GameProps } from "./GameShell";

type Mark = "X" | "O" | null;

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function winner(b: Mark[]): "X" | "O" | "draw" | null {
  for (const [a, c, d] of LINES) {
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a] as "X" | "O";
  }
  if (b.every(Boolean)) return "draw";
  return null;
}

function aiMove(b: Mark[]): number {
  for (let i = 0; i < 9; i++) {
    if (!b[i]) {
      const nb = [...b];
      nb[i] = "O";
      if (winner(nb) === "O") return i;
    }
  }
  for (let i = 0; i < 9; i++) {
    if (!b[i]) {
      const nb = [...b];
      nb[i] = "X";
      if (winner(nb) === "X") return i;
    }
  }
  if (!b[4]) return 4;
  const empty = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  return empty[Math.floor(Math.random() * empty.length)];
}

export function GameTicTacToe({ onGameOver }: GameProps) {
  const { t } = useTranslation();
  const [board, setBoard] = useState<Mark[]>(() => Array<Mark>(9).fill(null));
  const [turn, setTurn] = useState<"X" | "O">("X");
  const [over, setOver] = useState<null | "X" | "O" | "draw">(null);
  const endRef = useRef(onGameOver);
  endRef.current = onGameOver;

  const finish = (w: "X" | "O" | "draw") => {
    setOver(w);
    const score = w === "X" ? 100 : w === "draw" ? 40 : 0;
    setTimeout(() => endRef.current(score), 250);
  };

  function playerClick(i: number) {
    if (over || turn !== "X" || board[i]) return;
    const nb = [...board];
    nb[i] = "X";
    setBoard(nb);
    const w = winner(nb);
    if (w) {
      finish(w);
      return;
    }
    setTurn("O");
  }

  useEffect(() => {
    if (turn !== "O" || over) return;
    const id = setTimeout(() => {
      const i = aiMove(board);
      const nb = [...board];
      nb[i] = "O";
      setBoard(nb);
      const w = winner(nb);
      if (w) finish(w);
      else setTurn("X");
    }, 400);
    return () => clearTimeout(id);
  }, [turn, over, board]);

  const status = over
    ? over === "X"
      ? t("games.tictactoe.win")
      : over === "draw"
        ? t("games.tictactoe.draw")
        : t("games.tictactoe.lose")
    : t("games.tictactoe.yourTurn");

  return (
    <div className="max-w-xs mx-auto select-none">
      <div className="flex justify-between items-center mb-3">
        <span className="font-bold t-primary">{t("games.tictactoe.name")}</span>
        <span className="t-secondary text-sm">{status}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 bg-secondary p-2 rounded-xl">
        {board.map((m, i) => (
          <button
            key={i}
            onClick={() => playerClick(i)}
            className="aspect-square rounded-lg flex items-center justify-center text-4xl font-bold bg-w"
          >
            {m === "X" ? (
              <span className="text-theme">X</span>
            ) : m === "O" ? (
              <span className="text-green-600">O</span>
            ) : (
              ""
            )}
          </button>
        ))}
      </div>
      <p className="text-center text-xs t-secondary mt-2">{t("games.tictactoe.hint")}</p>
    </div>
  );
}
