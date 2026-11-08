// Minimal structured logger (JSON lines). Never pass passwords, tokens, or full request bodies.
type Ctx = Record<string, unknown>;

function emit(level: "info" | "warn" | "error", message: string, ctx?: Ctx) {
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...ctx });
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}

const errCtx = (e: unknown): Ctx =>
  e instanceof Error ? { error: e.name, detail: e.message, stack: process.env.NODE_ENV === "production" ? undefined : e.stack } : { error: String(e) };

export const logger = {
  info: (m: string, c?: Ctx) => emit("info", m, c),
  warn: (m: string, c?: Ctx) => emit("warn", m, c),
  error: (m: string, e?: unknown, c?: Ctx) => emit("error", m, { ...(e ? errCtx(e) : {}), ...c }),
};
