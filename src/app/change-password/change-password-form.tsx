"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { changePasswordAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const [state, action, pending] = useActionState(changePasswordAction, undefined);
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <h1 className="text-xl font-semibold">Change password</h1>
        <p className="text-sm text-muted-foreground">
          {forced ? "You must set a new password before continuing." : "You will be signed out after changing it."}
        </p>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="current">Current password</Label>
            <Input id="current" name="current" type="password" autoComplete="current-password" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="next">New password</Label>
            <Input id="next" name="next" type="password" autoComplete="new-password" minLength={10} required />
            <p className="text-xs text-muted-foreground">At least 10 characters, with letters and numbers.</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm">Confirm new password</Label>
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
          </div>
          {state?.error && (
            <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{state.error}</p>
          )}
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Change password
          </Button>
          {!forced && (
            <Button asChild variant="ghost"><Link href="/dashboard">Cancel</Link></Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
