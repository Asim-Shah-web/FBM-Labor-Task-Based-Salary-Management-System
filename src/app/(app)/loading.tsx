import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex items-center justify-center p-12 text-muted-foreground" role="status" aria-label="Loading">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}
