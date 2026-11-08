"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

// Shown when a page crashes unexpectedly. Details are deliberately NOT shown to the user;
// the digest lets you find the matching server log line.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader><h1 className="text-lg font-semibold">Something went wrong</h1></CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <p className="text-muted-foreground">The page could not be loaded. Your data is safe: nothing is half-saved, because every change is all-or-nothing.</p>
          {error.digest && <p className="font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>}
          <div className="flex gap-2">
            <Button onClick={reset}>Try again</Button>
            <Button asChild variant="outline"><a href="/dashboard">Go to dashboard</a></Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
