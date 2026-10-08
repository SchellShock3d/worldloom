"use client";

/** Last-resort boundary when the root layout itself fails: no app styles are guaranteed here. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#13161e", color: "#e6e8ee", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 28, margin: "0 0 8px" }}>Worldloom couldn&apos;t start this page</h1>
          <p style={{ color: "#9aa1b2", margin: "0 0 20px" }}>Nothing was changed. Try again in a moment.</p>
          <button onClick={reset} style={{ background: "#5bb3a4", color: "#0d1117", border: 0, borderRadius: 6, padding: "8px 16px", fontSize: 15, cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
