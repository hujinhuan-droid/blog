/**
 * Structured logger for Cloudflare Workers.
 * Replaces scattered console.error calls with consistent structured logging.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getMinLevel(): LogLevel {
  // In production, only warn and error
  return (globalThis as Record<string, unknown>).ENVIRONMENT === "production" ? "warn" : "debug";
}

function formatLog(entry: LogEntry): string {
  const ctx = entry.context ? ` ${JSON.stringify(entry.context)}` : "";
  return `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}${ctx}`;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[getMinLevel()];
}

export const logger = {
  debug(message: string, context?: Record<string, unknown>) {
    if (!shouldLog("debug")) return;
    const entry: LogEntry = { timestamp: new Date().toISOString(), level: "debug", message, context };
    console.debug(formatLog(entry));
  },

  info(message: string, context?: Record<string, unknown>) {
    if (!shouldLog("info")) return;
    const entry: LogEntry = { timestamp: new Date().toISOString(), level: "info", message, context };
    console.info(formatLog(entry));
  },

  warn(message: string, context?: Record<string, unknown>) {
    if (!shouldLog("warn")) return;
    const entry: LogEntry = { timestamp: new Date().toISOString(), level: "warn", message, context };
    console.warn(formatLog(entry));
  },

  error(message: string, context?: Record<string, unknown>) {
    if (!shouldLog("error")) return;
    const entry: LogEntry = { timestamp: new Date().toISOString(), level: "error", message, context };
    console.error(formatLog(entry));
  },
};

/** Request-scoped logger with request metadata */
export function createRequestLogger(
  method: string,
  path: string,
  requestId: string,
  clientIp?: string,
) {
  return {
    info(msg: string, ctx?: Record<string, unknown>) {
      logger.info(msg, {
        method,
        path,
        requestId,
        ...(clientIp ? { clientIp } : {}),
        ...ctx,
      });
    },
    warn(msg: string, ctx?: Record<string, unknown>) {
      logger.warn(msg, {
        method,
        path,
        requestId,
        ...(clientIp ? { clientIp } : {}),
        ...ctx,
      });
    },
    error(msg: string, ctx?: Record<string, unknown>) {
      logger.error(msg, {
        method,
        path,
        requestId,
        ...(clientIp ? { clientIp } : {}),
        ...ctx,
      });
    },
  };
}
