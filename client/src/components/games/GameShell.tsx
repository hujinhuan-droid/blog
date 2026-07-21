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
      <div className="bg-w rounded-2xl p-6 max-w-md mx-auto text-center">
        <h3 className="text-xl font-bold t-primary mb-1">{t("game.gameOver")}</h3>
        <p className="t-secondary mb-4">
          {t("game.yourScore")}: <span className="font-bold text-theme text-3xl">{score}</span>
        </p>
        {!saved ? (
          <div className="flex flex-col gap-3 mb-2">
            <input
              className="bg-secondary rounded-full px-4 py-2 t-primary outline-none focus:ring-2 ring-theme text-center"
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
        <div className="mt-4">
          <Button secondary title={t("game.playAgain")} onClick={handleAgain} />
        </div>
      </div>
    );
  }

  return (
    <div key={round}>
      <Game onGameOver={handleOver} />
    </div>
  );
}
