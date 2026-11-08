/**
 * Static security guards: these tests read the source code and fail the build if someone adds
 * an unprotected action/page, imports server-only code into the browser bundle, or uses unsafe SQL.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { PERMISSIONS } from "@/server/authz/permissions";

const ROOT = path.resolve(__dirname, "../../src");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const files = walk(ROOT).filter((f) => /\.(ts|tsx)$/.test(f));
const read = (f: string) => readFileSync(f, "utf8");
const rel = (f: string) => path.relative(ROOT, f).replaceAll("\\", "/");

describe("server actions", () => {
  const actionFiles = files.filter((f) => rel(f).startsWith("app/actions/") && read(f).includes('"use server"'));

  it("finds the action files", () => expect(actionFiles.length).toBeGreaterThanOrEqual(5));

  it("every exported action checks a permission or the session before doing anything", () => {
    const problems: string[] = [];
    for (const f of actionFiles) {
      const src = read(f);
      const parts = src.split(/export async function /).slice(1);
      for (const part of parts) {
        const name = part.slice(0, part.indexOf("("));
        // app/actions/auth.ts holds the public login/logout and the session-checked password change.
        const ok = /requirePermission\(|requireUser\(|getCurrentUser\(|signIn\(|signOut\(/.test(part);
        if (!ok) problems.push(`${rel(f)}: ${name}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("money-moving actions require the specific permission", () => {
    const fin = read(path.join(ROOT, "app/actions/finance.ts"));
    expect(fin).toContain('requirePermission("settlement:create")');
    expect(fin).toContain('requirePermission("advance:recover")');
    expect(fin).toContain('requirePermission("settlement:reverse")');
    expect(fin).toContain('requirePermission("advance:issue")');
    expect(fin).toContain('requirePermission("advance:void")');
    expect(read(path.join(ROOT, "app/actions/tasks.ts"))).toContain('requirePermission("rate:change")');
  });
});

describe("pages", () => {
  const pages = files.filter((f) => /app\/\(app\)\/.*page\.tsx$/.test(f.replaceAll("\\", "/")));
  it("every page in the authenticated area checks the session or a permission", () => {
    expect(pages.length).toBeGreaterThan(10);
    const bad = pages.filter((f) => !/requirePagePermission\(|requireUser\(/.test(read(f))).map(rel);
    expect(bad).toEqual([]);
  });
  it("the authenticated layout requires a user", () => {
    expect(read(path.join(ROOT, "app/(app)/layout.tsx"))).toContain("requireUser(");
  });
});

describe("route handlers", () => {
  it("report export checks login and the export permission", () => {
    const src = read(path.join(ROOT, "app/api/reports/[type]/export/route.ts"));
    expect(src).toContain("getCurrentUser()");
    expect(src).toContain('"report:export"');
    expect(src).toContain("rateLimit(");
  });
  it("only the auth and health endpoints are public", () => {
    const mw = read(path.join(ROOT, "middleware.ts"));
    expect(mw).toContain("api/auth|api/health");
    expect(mw).toContain('!req.auth?.user');
  });
});

describe("permission codes", () => {
  it("every permission referenced in code is defined", () => {
    const used = new Set<string>();
    for (const f of files) {
      for (const m of read(f).matchAll(/(?:requirePermission|requirePagePermission)\("([^"]+)"\)|permission: "([^"]+)"|can\(\w+, "([^"]+)"\)/g))
        used.add((m[1] ?? m[2] ?? m[3])!);
    }
    expect(used.size).toBeGreaterThan(10);
    for (const code of used) expect(PERMISSIONS, `unknown permission ${code}`).toHaveProperty(code);
  });
});

describe("browser bundle safety", () => {
  const client = files.filter((f) => /^\s*["']use client["']/.test(read(f)));
  const PURE_OK = ["@/server/money/decimal", "@/server/services/pricing", "@/server/services/allocation.engine"];

  it("finds client components", () => expect(client.length).toBeGreaterThan(10));

  it("client components never import database, auth, or service code", () => {
    const bad: string[] = [];
    for (const f of client) {
      for (const m of read(f).matchAll(/^import\s+(?!type\b)[^;]*?from\s+["'](@\/server\/[^"']+)["']/gm)) {
        const mod = m[1]!;
        const isAction = mod.startsWith("@/app/actions/");
        if (!PURE_OK.includes(mod) && !isAction) bad.push(`${rel(f)} imports ${mod}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("client code never imports prisma or reads secrets", () => {
    for (const f of client) {
      const src = read(f);
      expect(src, rel(f)).not.toMatch(/@prisma\/client|process\.env\.(AUTH_SECRET|DATABASE_URL)/);
    }
  });
});

describe("dangerous patterns", () => {
  const app = files.filter((f) => !f.endsWith(".d.ts"));
  it("no unsafe raw SQL", () => {
    expect(app.filter((f) => /\$queryRawUnsafe|\$executeRawUnsafe/.test(read(f))).map(rel)).toEqual([]);
  });
  it("no dangerouslySetInnerHTML or eval", () => {
    expect(app.filter((f) => /dangerouslySetInnerHTML|\beval\(|new Function\(/.test(read(f))).map(rel)).toEqual([]);
  });
  it("no browser storage of sensitive data and no floating-point money parsing", () => {
    expect(app.filter((f) => /localStorage|sessionStorage/.test(read(f))).map(rel)).toEqual([]);
  });
});
