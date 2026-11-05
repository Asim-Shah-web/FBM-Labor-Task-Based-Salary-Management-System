import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string; sv: number; loginAt: number } & DefaultSession["user"];
  }
}
