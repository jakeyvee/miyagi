import Link from "next/link";

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1.5rem",
        padding: "1.5rem",
      }}
    >
      <h1 style={{ fontSize: "1.75rem", margin: 0 }}>kid-quest</h1>
      <p style={{ margin: 0, color: "#555", textAlign: "center" }}>
        Choose a surface to enter. Later tickets fill in each flow.
      </p>
      <nav
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          width: "min(20rem, 100%)",
        }}
      >
        <Link
          href="/parent"
          style={{
            padding: "0.875rem 1rem",
            background: "#111",
            color: "#fff",
            borderRadius: "0.75rem",
            textAlign: "center",
            textDecoration: "none",
          }}
        >
          Parent
        </Link>
        <Link
          href="/kid"
          style={{
            padding: "0.875rem 1rem",
            background: "#fff",
            color: "#111",
            border: "1px solid #111",
            borderRadius: "0.75rem",
            textAlign: "center",
            textDecoration: "none",
          }}
        >
          Kid
        </Link>
      </nav>
    </main>
  );
}
