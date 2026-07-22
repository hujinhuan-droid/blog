import { useTranslation } from "react-i18next";
import type { ScoreEntry } from "../../utils/leaderboard";

function rankClass(i: number): string {
  if (i === 0) return "bg-amber-400 text-amber-950";
  if (i === 1) return "bg-neutral-300 text-neutral-800";
  if (i === 2) return "bg-orange-700 text-orange-100";
  return "bg-secondary t-primary";
}

export function Leaderboard({ scores }: { scores: ScoreEntry[] }) {
  const { t } = useTranslation();

  return (
    <div className="bg-w rounded-2xl p-5 mt-6 border border-neutral-200/60 dark:border-neutral-700/60">
      <h3 className="text-lg font-bold t-primary mb-3 flex items-center gap-2">
        <span>🏅</span>
        {t("game.leaderboard")}
      </h3>
      {scores.length === 0 ? (
        <p className="text-sm t-secondary">{t("game.noScores")}</p>
      ) : (
        <ol className="space-y-1.5">
          {scores.map((s, i) => (
            <li
              key={i}
              className="flex items-center justify-between text-sm t-primary rounded-xl px-2.5 py-1.5 hover:bg-neutral-200/70 dark:hover:bg-neutral-600/70 transition"
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`w-7 h-7 shrink-0 rounded-full text-center leading-7 text-xs font-bold shadow-sm ${rankClass(i)}`}
                >
                  {i + 1}
                </span>
                <span className="font-medium truncate">{s.name}</span>
              </span>
              <span className="font-bold text-theme ml-2 tabular-nums">{s.score}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
