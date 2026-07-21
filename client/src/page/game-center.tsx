import { useState, type ComponentType } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useSiteConfig } from "../hooks/useSiteConfig";
import { GameShell, type GameProps } from "../components/games/GameShell";
import { Game2048 } from "../components/games/Game2048";
import { GameSnake } from "../components/games/GameSnake";
import { GameMemory } from "../components/games/GameMemory";
import { GameWhack } from "../components/games/GameWhack";
import { GameTicTacToe } from "../components/games/GameTicTacToe";

interface GameDef {
  id: string;
  nameKey: string;
  descKey: string;
  Game: ComponentType<GameProps>;
}

const GAMES: GameDef[] = [
  { id: "2048", nameKey: "games.2048.name", descKey: "games.2048.desc", Game: Game2048 },
  { id: "snake", nameKey: "games.snake.name", descKey: "games.snake.desc", Game: GameSnake },
  { id: "memory", nameKey: "games.memory.name", descKey: "games.memory.desc", Game: GameMemory },
  { id: "whack", nameKey: "games.whack.name", descKey: "games.whack.desc", Game: GameWhack },
  { id: "tictactoe", nameKey: "games.tictactoe.name", descKey: "games.tictactoe.desc", Game: GameTicTacToe },
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
      <main className="wauto flex flex-col items-center mb-8 ani-show">
        <div className="w-full text-start text-black dark:text-white py-4">
          <h1 className="text-4xl font-bold">{t("game.title")}</h1>
          <p className="text-sm mt-2 t-secondary">{t("game.subtitle")}</p>
        </div>

        {!current ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
            {GAMES.map((g) => (
              <button
                key={g.id}
                onClick={() => setActive(g.id)}
                className="bg-w rounded-2xl p-5 text-left hover:ring-2 ring-theme transition"
              >
                <h3 className="text-lg font-bold t-primary">{t(g.nameKey)}</h3>
                <p className="text-sm t-secondary mt-1">{t(g.descKey)}</p>
                <span className="inline-block mt-3 text-theme text-sm font-medium">{t("game.play")} →</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="w-full">
            <button
              onClick={() => setActive(null)}
              className="text-sm t-secondary mb-3 hover:text-theme"
            >
              ← {t("game.backToGames")}
            </button>
            <h2 className="text-2xl font-bold t-primary mb-4">{t(current.nameKey)}</h2>
            <GameShell key={current.id} gameId={current.id} title={t(current.nameKey)} Game={current.Game} />
          </div>
        )}
      </main>
    </>
  );
}
