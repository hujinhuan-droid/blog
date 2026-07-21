import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { GameProps } from "./GameShell";

const EMOJIS = ["🍎", "🍌", "🍇", "🍉", "🍓", "🍒", "🥝", "🍑"];

function shuffle<T>(a: T[]): T[] {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function GameMemory({ onGameOver }: GameProps) {
  const { t } = useTranslation();
  const [cards] = useState<string[]>(() => shuffle([...EMOJIS, ...EMOJIS]));
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<boolean[]>(() => Array(EMOJIS.length * 2).fill(false));
  const [moves, setMoves] = useState(0);
  const [lock, setLock] = useState(false);
  const endRef = useRef(onGameOver);
  endRef.current = onGameOver;

  function click(i: number) {
    if (lock || matched[i] || flipped.includes(i) || flipped.length === 2) return;
    const nf = [...flipped, i];
    setFlipped(nf);
    if (nf.length === 2) {
      setMoves((m) => m + 1);
      setLock(true);
      const [a, b] = nf;
      if (cards[a] === cards[b]) {
        const nm = [...matched];
        nm[a] = true;
        nm[b] = true;
        setMatched(nm);
        setFlipped([]);
        setLock(false);
      } else {
        setTimeout(() => {
          setFlipped([]);
          setLock(false);
        }, 700);
      }
    }
  }

  useEffect(() => {
    if (matched.length > 0 && matched.every(Boolean)) {
      const score = Math.max(10, 1000 - moves * 15);
      setTimeout(() => endRef.current(score), 300);
    }
  }, [matched, moves]);

  return (
    <div className="max-w-sm mx-auto">
      <div className="flex justify-between items-center mb-3">
        <span className="font-bold t-primary">{t("games.memory.name")}</span>
        <span className="t-secondary text-sm">
          {t("game.moves")}: {moves}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {cards.map((c, i) => {
          const faceUp = matched[i] || flipped.includes(i);
          return (
            <button
              key={i}
              onClick={() => click(i)}
              className={`aspect-square rounded-lg flex items-center justify-center text-2xl transition ${
                faceUp ? "bg-w" : "bg-secondary"
              }`}
            >
              {faceUp ? c : "❓"}
            </button>
          );
        })}
      </div>
      <p className="text-center text-xs t-secondary mt-2">{t("games.memory.hint")}</p>
    </div>
  );
}
