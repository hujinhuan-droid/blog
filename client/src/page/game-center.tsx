import { useState, type ComponentType } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useSiteConfig } from "../hooks/useSiteConfig";
import { GameShell, type GameProps } from "../components/games/GameShell";
import { GameDiablo } from "../components/games/GameDiablo";

interface GameDef {
  id: string;
  nameKey: string;
  descKey: string;
  icon: string;
  Game: ComponentType<GameProps>;
}

const GAMES: GameDef[] = [
  { id: "diablo", nameKey: "games.diablo.name", descKey: "games.diablo.desc", icon: "🔥", Game: GameDiablo },
];

export function GameCenterPage() {
  const { t } = useTranslation();
  const siteConfig = useSiteConfig();
  const [active, setActive] = useState<string | null>(null);
  const current = GAMES.find((g) => g.id === active);

  return (
    <>
      <Helmet>
        <title>{`${t("game.title")} - ${siteConfig.name}`}</title>
        <meta property="og:site_name" content={siteConfig.name} />
      </Helmet>
      <main className="wauto flex flex-col items-center mb-12 ani-show">
        {/* Hero 区 */}
        <div className="w-full mb-8 rounded-3xl bg-gradient-to-br from-theme/10 via-theme/5 to-transparent p-8 shadow-light border border-theme/10">
          <div className="flex items-center gap-5">
            <div className="shrink-0 w-16 h-16 rounded-2xl bg-gradient-to-br from-theme to-theme/70 flex items-center justify-center text-4xl shadow-lg">
              🎮
            </div>
            <div>
              <h1 className="text-4xl font-bold t-primary">{t("game.title")}</h1>
              <p className="text-sm mt-2 t-secondary max-w-prose">{t("game.subtitle")}</p>
            </div>
          </div>
        </div>

        {!current ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 w-full">
            {GAMES.map((g) => (
              <button
                key={g.id}
                onClick={() => setActive(g.id)}
                className="group relative overflow-hidden bg-w rounded-3xl p-6 text-left shadow-lg shadow-light hover:shadow-2xl hover:shadow-deep hover:-translate-y-1 transition-all duration-300 border border-neutral-200/60 dark:border-neutral-700/60"
              >
                {/* 悬停光晕 */}
                <div className="absolute -right-10 -top-10 w-32 h-32 rounded-full bg-theme/10 blur-2xl group-hover:bg-theme/20 transition" />
                <div className="relative flex items-start gap-4">
                  <div className="shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-theme/25 to-theme/5 flex items-center justify-center text-3xl shadow-inner">
                    {g.icon}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold t-primary">{t(g.nameKey)}</h3>
                    <p className="text-sm t-secondary mt-1.5 leading-relaxed">{t(g.descKey)}</p>
                  </div>
                </div>
                <div className="relative mt-6 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-theme text-sm font-semibold">
                    {t("game.play")}
                    <span className="transition-transform group-hover:translate-x-1">→</span>
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="w-full">
            <button
              onClick={() => setActive(null)}
              className="text-sm t-secondary mb-4 hover:text-theme inline-flex items-center gap-1 transition"
            >
              ← {t("game.backToGames")}
            </button>
            <h2 className="text-2xl font-bold t-primary mb-5 flex items-center gap-2">
              <span>{current.icon}</span>
              {t(current.nameKey)}
            </h2>
            <GameShell key={current.id} gameId={current.id} Game={current.Game} />
          </div>
        )}
      </main>
    </>
  );
}
