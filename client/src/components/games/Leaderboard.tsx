import { useTranslation } from "react-i18next";
import type { ScoreEntry } from "../../utils/leaderboard";

export function Leaderboard({ scores }: { scores: ScoreEntry[] }) {
  const { t } = useTranslation();

  return (
    <div className="bg-w rounded-2xl p-5 mt-5">
      <h3 className="text-lg font-bold t-primary mb-3">{t("game.leaderboard")}</h3>
      {scores.length === 0 ? (
        <p className="text-sm t-secondary">{t("game.noScores")}</p>
      ) : (
        <ol className="space-y-2">
          {scores.map((s, i) => (
            <li key={i} className="flex items-center justify-between text-sm t-primary">
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-6 h-6 shrink-0 rounded-full text-center leading-6 text-xs font-bold ${
                    i < 3 ? "bg-theme text-white" : "bg-secondary"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="font-medium truncate">{s.name}</span>
              </span>
              <span className="font-bold text-theme ml-2">{s.score}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
