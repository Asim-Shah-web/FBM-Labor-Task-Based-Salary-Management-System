import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader><h1 className="text-lg font-semibold">Page not found</h1></CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <p className="text-muted-foreground">That page or record does not exist.</p>
          <Button asChild className="self-start"><Link href="/dashboard">Go to dashboard</Link></Button>
        </CardContent>
      </Card>
    </div>
  );
}
