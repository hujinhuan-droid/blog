import { useCallback, useState, type ComponentType } from "react";
import { Button } from "@rin/ui";
import { useTranslation } from "react-i18next";
import { useLeaderboard, getPlayerName, setPlayerName } from "../../utils/leaderboard";
import { Leaderboard } from "./Leaderboard";

export interface GameProps {
  onGameOver: (score: number) => void;
}

export function GameShell({
  gameId,
  Game,
}: {
  gameId: string;
  Game: ComponentType<GameProps>;
}) {
  const { t } = useTranslation();
  const { scores, submit } = useLeaderboard(gameId);
  const [round, setRound] = useState(0);
  const [finished, setFinished] = useState(false);
  const [saved, setSaved] = useState(false);
  const [score, setScore] = useState(0);
  const [name, setName] = useState(() => getPlayerName());

  const handleOver = useCallback((finalScore: number) => {
    setScore(finalScore);
    setFinished(true);
  }, []);

  function handleSave() {
    const player = name.trim() || t("game.player_default");
    setPlayerName(player);
    submit(player, score);
    setSaved(true);
  }

  function handleAgain() {
    setFinished(false);
    setSaved(false);
    setScore(0);
    setRound((r) => r + 1);
  }

  if (finished) {
    return (
      <div className="relative overflow-hidden bg-w rounded-3xl shadow-2xl shadow-deep border border-neutral-200/60 dark:border-neutral-700/60 p-8 max-w-md mx-auto text-center">
        {/* 顶部渐变条 */}
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-theme/60 via-theme to-theme/60" />
        <div className="text-4xl mb-2">🏆</div>
        <h3 className="text-2xl font-bold t-primary mb-1">{t("game.gameOver")}</h3>
        <p className="t-secondary mb-3">{t("game.yourScore")}</p>
        <div className="text-5xl font-extrabold text-theme mb-6 tabular-nums">{score}</div>
        {!saved ? (
          <div className="flex flex-col gap-3 mb-2">
            <input
              className="bg-secondary rounded-full px-4 py-2.5 t-primary outline-none focus:ring-2 focus:ring-theme text-center border border-transparent transition"
              placeholder={t("game.namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button title={t("game.saveScore")} onClick={handleSave} />
          </div>
        ) : (
          <p className="text-sm text-theme mb-2">{t("game.saved")}</p>
        )}
        <Leaderboard scores={scores} />
        <div className="mt-5">
          <Button secondary title={t("game.playAgain")} onClick={handleAgain} />
        </div>
      </div>
    );
  }

  return (
    <div key={round} className="bg-w rounded-3xl shadow-2xl shadow-deep border border-neutral-200/60 dark:border-neutral-700/60 p-5">
      {/* 游戏"屏幕"外框 */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-neutral-50 to-neutral-100 dark:from-neutral-800 dark:to-neutral-900 ring-1 ring-black/5">
        <Game onGameOver={handleOver} />
      </div>
    </div>
  );
}
