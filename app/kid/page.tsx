import Link from "next/link";

export default function KidPage() {
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
      <h1 style={{ margin: 0 }}>Kid</h1>
      <p style={{ margin: 0, color: "#555" }}>
        Quest surface. Wired up by a follow-on ticket against the
        {" "}
        <code>ClassifierRequest</code>/<code>ClassifierResponse</code>{" "}
        contracts.
      </p>
    </main>
  );
}
