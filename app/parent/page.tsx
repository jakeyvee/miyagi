import Link from "next/link";

export default function ParentPage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        padding: "1.5rem",
        gap: "1rem",
      }}
    >
      <Link href="/" style={{ color: "#555", fontSize: "0.875rem" }}>
        ← Home
      </Link>
      <h1 style={{ margin: 0 }}>Parent</h1>
      <p style={{ margin: 0, color: "#555" }}>
        Setup and settings live here. Wired up by a follow-on ticket against
        the <code>ParentSettings</code> contract.
      </p>
    </main>
  );
}
