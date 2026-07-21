import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { GameProps } from "./GameShell";

const DURATION = 30;

export function GameWhack({ onGameOver }: GameProps) {
  const { t } = useTranslation();
  const [score, setScore] = useState(0);
  const [mole, setMole] = useState<number | null>(null);
  const [time, setTime] = useState(DURATION);
  const [running, setRunning] = useState(true);
  const scoreRef = useRef(0);
  const endRef = useRef(onGameOver);
  endRef.current = onGameOver;

  useEffect(() => {
    if (!running) return;
    const spawn = setInterval(() => {
      setMole(Math.floor(Math.random() * 9));
    }, 650);
    const countdown = setInterval(() => {
      setTime((tm) => {
        if (tm <= 1) {
          clearInterval(spawn);
          clearInterval(countdown);
          setRunning(false);
          setMole(null);
          setTimeout(() => endRef.current(scoreRef.current), 0);
          return 0;
        }
        return tm - 1;
      });
    }, 1000);
    return () => {
      clearInterval(spawn);
      clearInterval(countdown);
    };
  }, [running]);

  function hit(i: number) {
    if (mole === i) {
      const s = scoreRef.current + 1;
      scoreRef.current = s;
      setScore(s);
      setMole(null);
    }
  }

  return (
    <div className="max-w-xs mx-auto select-none">
      <div className="flex justify-between items-center mb-3">
        <span className="font-bold t-primary">{t("games.whack.name")}</span>
        <span className="t-secondary text-sm">
          {t("game.timeLeft")}: {time}s | {t("game.score")}: {score}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 9 }).map((_, i) => (
          <button
            key={i}
            onClick={() => hit(i)}
            className={`aspect-square rounded-xl flex items-center justify-center text-4xl transition ${
              mole === i ? "bg-theme text-white" : "bg-secondary"
            }`}
          >
            {mole === i ? "🐹" : ""}
          </button>
        ))}
      </div>
      <p className="text-center text-xs t-secondary mt-2">{t("games.whack.hint")}</p>
    </div>
  );
}
