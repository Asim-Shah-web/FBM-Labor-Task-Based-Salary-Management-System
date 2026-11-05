import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ changed?: string }> }) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { changed } = await searchParams;
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <LoginForm passwordChanged={changed === "1"} />
    </div>
  );
}
