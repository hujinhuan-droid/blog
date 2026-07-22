import { useEffect, useRef } from "react";
import type { GameProps } from "./GameShell";

const W = 560;
const H = 400;

interface Monster {
  id: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attack: number;
  exp: number;
  speed: number;
  color: string;
  emoji: string;
  lastHit: number;
}

const MONSTER_TYPES = [
  { emoji: "👹", hp: 30, attack: 6, exp: 12, speed: 0.6 },
  { emoji: "🦇", hp: 18, attack: 4, exp: 8, speed: 1.0 },
  { emoji: "🐉", hp: 60, attack: 10, exp: 24, speed: 0.45 },
  { emoji: "🕷️", hp: 22, attack: 5, exp: 10, speed: 0.8 },
];

const MOVE_KEYS = [
  "w",
  "a",
  "s",
  "d",
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
  " ",
];

export function GameLegend({ onGameOver }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onOverRef = useRef(onGameOver);
  onOverRef.current = onGameOver;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx0 = canvas.getContext("2d");
    if (!ctx0) return;
    const ctx = ctx0;

    let raf = 0;
    let idc = 0;
    const keys: Record<string, boolean> = {};

    const player = {
      x: W / 2,
      y: H / 2,
      hp: 100,
      maxHp: 100,
      level: 1,
      exp: 0,
      expToNext: 40,
      attack: 12,
      defense: 0,
      kills: 0,
    };
    let monsters: Monster[] = [];
    let dead = false;
    let lastAttack = 0;
    let lastSpawn = 0;
    let flash = 0;
    let msg = "";
    let msgUntil = 0;

    function setMsg(text: string, now: number) {
      msg = text;
      msgUntil = now + 1500;
    }

    function spawn() {
      const t = MONSTER_TYPES[Math.floor(Math.random() * MONSTER_TYPES.length)];
      const side = Math.floor(Math.random() * 4);
      let x = 0;
      let y = 0;
      if (side === 0) {
        x = Math.random() * W;
        y = -20;
      } else if (side === 1) {
        x = W + 20;
        y = Math.random() * H;
      } else if (side === 2) {
        x = Math.random() * W;
        y = H + 20;
      } else {
        x = -20;
        y = Math.random() * H;
      }
      monsters.push({
        id: idc++,
        x,
        y,
        hp: t.hp,
        maxHp: t.hp,
        attack: t.attack,
        exp: t.exp,
        speed: t.speed,
        color: "#e05a5a",
        emoji: t.emoji,
        lastHit: 0,
      });
    }

    function attackMonster(now: number) {
      let target: Monster | null = null;
      let best = 9999;
      for (const m of monsters) {
        const d = Math.hypot(m.x - player.x, m.y - player.y);
        if (d < 52 && d < best) {
          best = d;
          target = m;
        }
      }
      if (!target) return;
      target.hp -= player.attack;
      lastAttack = now;
      if (target.hp > 0) return;

      target.hp = 0;
      player.kills += 1;
      player.exp += target.exp;
      const r = Math.random();
      if (r < 0.12) {
        player.attack += 3;
        setMsg("⚔️ 获得武器 攻击+3", now);
      } else if (r < 0.24) {
        player.defense += 2;
        setMsg("🛡️ 获得护甲 防御+2", now);
      } else if (r < 0.42) {
        player.hp = Math.min(player.maxHp, player.hp + 25);
        setMsg("🧪 回复生命 +25", now);
      }
      monsters = monsters.filter((mm) => mm.id !== target!.id);

      while (player.exp >= player.expToNext) {
        player.exp -= player.expToNext;
        player.level += 1;
        player.expToNext = 30 + player.level * 30;
        player.maxHp += 20;
        player.hp = player.maxHp;
        player.attack += 3;
        player.defense += 1;
        setMsg(`⬆️ 升到 ${player.level} 级！`, now);
      }
    }

    function loop(now: number) {
      if (dead) return;

      const sp = 2.6;
      let dx = 0;
      let dy = 0;
      if (keys["w"] || keys["arrowup"]) dy -= 1;
      if (keys["s"] || keys["arrowdown"]) dy += 1;
      if (keys["a"] || keys["arrowleft"]) dx -= 1;
      if (keys["d"] || keys["arrowright"]) dx += 1;
      if (dx || dy) {
        const len = Math.hypot(dx, dy);
        player.x = Math.max(14, Math.min(W - 14, player.x + (dx / len) * sp));
        player.y = Math.max(14, Math.min(H - 14, player.y + (dy / len) * sp));
      }

      if (now - lastAttack > 380) attackMonster(now);

      if (now - lastSpawn > 1100 && monsters.length < 10) {
        spawn();
        lastSpawn = now;
      }

      for (const m of monsters) {
        const ddx = player.x - m.x;
        const ddy = player.y - m.y;
        const d = Math.hypot(ddx, ddy) || 1;
        if (d > 22) {
          m.x += (ddx / d) * m.speed;
          m.y += (ddy / d) * m.speed;
        } else if (now - m.lastHit > 600) {
          const dmg = Math.max(1, m.attack - player.defense);
          player.hp -= dmg;
          m.lastHit = now;
          flash = now;
        }
      }

      if (player.hp <= 0 && !dead) {
        dead = true;
        const score = player.level * 1000 + player.kills;
        onOverRef.current(score);
        return;
      }

      draw(now);
      raf = requestAnimationFrame(loop);
    }

    function draw(now: number) {
      ctx.fillStyle = "#2b3a2f";
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= W; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 0; y <= H; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      ctx.strokeStyle = "#1c271f";
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, W - 4, H - 4);

      for (const m of monsters) {
        ctx.font = "26px serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(m.emoji, m.x, m.y);
        const bw = 28;
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(m.x - bw / 2, m.y - 22, bw, 4);
        ctx.fillStyle = "#e05a5a";
        ctx.fillRect(m.x - bw / 2, m.y - 22, bw * (m.hp / m.maxHp), 4);
      }

      ctx.font = "28px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🧝", player.x, player.y);

      if (now - flash < 120) {
        ctx.fillStyle = "rgba(255,0,0,0.18)";
        ctx.fillRect(0, 0, W, H);
      }

      drawHUD(now);
    }

    function drawHUD(now: number) {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(0, 0, W, 46);
      ctx.fillStyle = "#3a3a3a";
      ctx.fillRect(10, 10, 180, 14);
      ctx.fillStyle = "#e23b3b";
      ctx.fillRect(10, 10, 180 * Math.max(0, player.hp / player.maxHp), 14);
      ctx.fillStyle = "#fff";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(`HP ${Math.max(0, Math.ceil(player.hp))}/${player.maxHp}`, 14, 17);
      ctx.fillStyle = "#3a3a3a";
      ctx.fillRect(10, 28, 180, 8);
      ctx.fillStyle = "#3b9be2";
      ctx.fillRect(10, 28, 180 * (player.exp / player.expToNext), 8);
      ctx.fillStyle = "#fff";
      ctx.font = "13px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`Lv.${player.level}   击杀 ${player.kills}`, W - 12, 14);
      ctx.fillStyle = "#ffd966";
      ctx.fillText(`⚔️${player.attack}  🛡️${player.defense}`, W - 12, 32);
      if (msg && now < msgUntil) {
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(W / 2 - 110, H - 30, 220, 22);
        ctx.fillStyle = "#fff";
        ctx.font = "13px sans-serif";
        ctx.fillText(msg, W / 2, H - 19);
      }
    }

    function onKey(e: KeyboardEvent, down: boolean) {
      const k = e.key.toLowerCase();
      if (MOVE_KEYS.includes(k)) {
        keys[k] = down;
        if (k === " ") e.preventDefault();
      }
    }
    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    for (let i = 0; i < 3; i++) spawn();
    lastSpawn = performance.now();
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, []);

  return (
    <div className="flex flex-col items-center">
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="bg-black rounded-xl ring-1 ring-black/20"
        style={{ maxWidth: "100%", touchAction: "none" }}
      />
      <p className="text-sm t-secondary mt-3 text-center">
        WASD / 方向键移动，靠近怪物自动攻击 · 升级变强，小心被围殴！
      </p>
    </div>
  );
}
