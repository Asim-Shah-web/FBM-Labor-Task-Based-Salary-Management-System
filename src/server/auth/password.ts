import { hash, verify } from "@node-rs/argon2";

// Argon2id is the library default algorithm. Parameters follow OWASP guidance.
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (plain: string) => hash(plain, OPTS);

export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain);
  } catch {
    return false;
  }
}

// Used to burn equal time when the username does not exist (timing side-channel).
let dummy: Promise<string> | undefined;
export const dummyHash = () => (dummy ??= hashPassword("dummy-password-for-timing"));

const COMMON = new Set([
  "password", "password1", "password123", "123456789", "1234567890", "qwertyuiop",
  "admin12345", "letmein123", "welcome123", "iloveyou12", "changeme123", "pakistan123",
]);

export type PasswordCheck = { ok: true } | { ok: false; message: string };

export function checkPasswordPolicy(password: string, username?: string): PasswordCheck {
  if (password.length < 10) return { ok: false, message: "Password must be at least 10 characters." };
  if (password.length > 128) return { ok: false, message: "Password must be at most 128 characters." };
  if (COMMON.has(password.toLowerCase())) return { ok: false, message: "That password is too common." };
  if (username && password.toLowerCase().includes(username.toLowerCase()))
    return { ok: false, message: "Password must not contain your username." };
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password))
    return { ok: false, message: "Use a mix of letters and numbers." };
  return { ok: true };
}
