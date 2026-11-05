"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { loginAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({ passwordChanged }: { passwordChanged: boolean }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-xl font-bold text-primary-foreground">F</div>
        <h1 className="mt-2 text-xl font-semibold">FBM Labor</h1>
        <p className="text-sm text-muted-foreground">Sign in to continue</p>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          {passwordChanged && (
            <p role="status" className="rounded-md bg-secondary p-3 text-sm">Password changed. Please sign in again.</p>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="username">Username or email</Label>
            <Input id="username" name="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          {state?.error && (
            <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{state.error}</p>
          )}
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Sign in
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
