import { useEffect, useState } from "react";

export interface ScoreEntry {
  name: string;
  score: number;
  date: string;
}

const STORAGE_KEY = "ai-agent:leaderboard";
const NAME_KEY = "ai-agent:playerName";

function readAll(): Record<string, ScoreEntry[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ScoreEntry[]>) : {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, ScoreEntry[]>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function getScores(gameId: string, limit = 10): ScoreEntry[] {
  const list = readAll()[gameId] ?? [];
  return [...list].sort((a, b) => b.score - a.score).slice(0, limit);
}

export function submitScore(gameId: string, name: string, score: number): ScoreEntry[] {
  const all = readAll();
  const list = all[gameId] ?? [];
  list.push({ name, score, date: new Date().toISOString() });
  list.sort((a, b) => b.score - a.score);
  all[gameId] = list.slice(0, 50);
  writeAll(all);
  return getScores(gameId);
}

export function getPlayerName(): string {
  return localStorage.getItem(NAME_KEY) ?? "";
}

export function setPlayerName(name: string): void {
  localStorage.setItem(NAME_KEY, name);
}

export function useLeaderboard(gameId: string) {
  const [scores, setScores] = useState<ScoreEntry[]>(() => getScores(gameId));

  useEffect(() => {
    setScores(getScores(gameId));
  }, [gameId]);

  function submit(name: string, score: number) {
    setPlayerName(name);
    setScores(submitScore(gameId, name, score));
  }

  return { scores, submit };
}
