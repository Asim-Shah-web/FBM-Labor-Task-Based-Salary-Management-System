"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
        <h1>Something went wrong</h1>
        <p>The application hit an unexpected error. Your data is safe.</p>
        {error.digest && <p style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>Reference: {error.digest}</p>}
        <button onClick={reset} style={{ padding: "0.6rem 1rem" }}>Try again</button>
      </body>
    </html>
  );
}
