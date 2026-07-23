import { useEffect, useRef } from "react";
import type { GameProps } from "./GameShell";

/**
 * 暗影地牢 —— 暗黑破坏神2 风格的地牢 ARPG。
 * 游戏本体是一个自包含的 HTML 文件（client/public/games/diablo-game.html），
 * 通过 iframe 嵌入，避免其内部的 Canvas / 全局样式与博客的 React/Tailwind 互相干扰。
 * 玩家阵亡时，游戏通过 postMessage 上报到达的地牢层数（深度=得分）。
 */
export function GameDiablo({ onGameOver }: GameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (!e.data || e.data.type !== "diablo:gameover") return;
      // score = 到达的地牢层数（闯关深度）
      const score = Number(e.data.score) || 1;
      onGameOver(score);
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [onGameOver]);

  return (
    <iframe
      ref={iframeRef}
      src="/games/diablo-game.html"
      title="暗影地牢 · Shadow Dungeon"
      className="w-full"
      style={{
        height: "600px",
        border: "none",
        background: "#0b0d17",
        borderRadius: "1rem",
        display: "block",
      }}
      allow="fullscreen"
    />
  );
}
