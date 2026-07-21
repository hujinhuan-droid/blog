import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { GameProps } from "./GameShell";

const COLS = 17;
const ROWS = 17;
const TICK = 120;

type Cell = { x: number; y: number };

function randomFood(snake: Cell[]): Cell {
  let c: Cell;
  do {
    c = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
  } while (snake.some((s) => s.x === c.x && s.y === c.y));
  return c;
}

export function GameSnake({ onGameOver }: GameProps) {
  const { t } = useTranslation();
  const [snake, setSnake] = useState<Cell[]>(() => [
    { x: 8, y: 8 },
    { x: 7, y: 8 },
    { x: 6, y: 8 },
  ]);
  const [food, setFood] = useState<Cell>(() => ({ x: 12, y: 8 }));
  const [dir, setDir] = useState<Cell>({ x: 1, y: 0 });
  const [over, setOver] = useState(false);

  const dirRef = useRef(dir);
  dirRef.current = dir;
  const foodRef = useRef(food);
  foodRef.current = food;
  const endRef = useRef(onGameOver);
  endRef.current = onGameOver;

  useEffect(() => {
    const id = setInterval(() => {
      setSnake((prev) => {
        const d = dirRef.current;
        const head = { x: prev[0].x + d.x, y: prev[0].y + d.y };
        const hitWall = head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS;
        const hitSelf = prev.some((s) => s.x === head.x && s.y === head.y);
        if (hitWall || hitSelf) {
          setOver(true);
          return prev;
        }
        let newSnake = [head, ...prev];
        if (head.x === foodRef.current.x && head.y === foodRef.current.y) {
          setFood(randomFood(newSnake));
        } else {
          newSnake = newSnake.slice(0, newSnake.length - 1);
        }
        return newSnake;
      });
    }, TICK);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (over) {
      setTimeout(() => endRef.current(snake.length - 3), 0);
    }
  }, [over, snake.length]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const d = dirRef.current;
      const apply = (nx: number, ny: number) => {
        if (d.x === -nx && d.y === -ny) return;
        setDir({ x: nx, y: ny });
      };
      switch (e.key) {
        case "ArrowUp":
        case "w":
          apply(0, -1);
          break;
        case "ArrowDown":
        case "s":
          apply(0, 1);
          break;
        case "ArrowLeft":
        case "a":
          apply(-1, 0);
          break;
        case "ArrowRight":
        case "d":
          apply(1, 0);
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const score = snake.length - 3;

  return (
    <div className="max-w-sm mx-auto select-none">
      <div className="flex justify-between items-center mb-3">
        <span className="font-bold t-primary">{t("games.snake.name")}</span>
        <span className="t-secondary text-sm">
          {t("game.score")}: {score}
        </span>
      </div>
      <div
        className="grid gap-0.5 bg-secondary p-1 rounded-xl"
        style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}
      >
        {Array.from({ length: ROWS * COLS }).map((_, idx) => {
          const x = idx % COLS;
          const y = Math.floor(idx / COLS);
          const isHead = snake[0]?.x === x && snake[0]?.y === y;
          const isBody = snake.some((s, i) => i > 0 && s.x === x && s.y === y);
          const isFood = food.x === x && food.y === y;
          return (
            <div
              key={idx}
              className={`w-3.5 h-3.5 rounded-sm ${
                isFood ? "bg-red-500" : isHead ? "bg-theme" : isBody ? "bg-green-600" : "bg-w/50"
              }`}
            />
          );
        })}
      </div>
      <p className="text-center text-xs t-secondary mt-2">{t("games.snake.hint")}</p>
    </div>
  );
}
