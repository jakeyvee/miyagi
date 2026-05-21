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
        gap: "var(--space-7)",
        padding: "var(--space-7) var(--space-5)",
        background:
          "radial-gradient(circle at 50% 0%, rgba(122,158,126,0.10), transparent 60%), var(--color-background)",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "var(--space-4)",
          textAlign: "center",
        }}
      >
        <span
          className="mono"
          style={{
            fontSize: "12px",
            color: "var(--color-text-secondary)",
            padding: "6px 12px",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-pill)",
            background: "var(--color-surface-soft)",
          }}
        >
          KID-QUEST · v1
        </span>
        <h1
          className="display"
          style={{
            margin: 0,
            fontSize: "clamp(44px, 12vw, 72px)",
            color: "var(--color-text-primary)",
          }}
        >
          Curious minds,
          <br />
          <span
            style={{
              fontStyle: "italic",
              color: "var(--color-accent)",
            }}
          >
            grown gently.
          </span>
        </h1>
        <p
          style={{
            margin: 0,
            color: "var(--color-text-secondary)",
            maxWidth: "26rem",
            fontSize: "16px",
            lineHeight: 1.6,
          }}
        >
          A parent-guided study companion. Set the topic, hand over the
          phone — the tree grows when learning happens.
        </p>
      </div>

      <nav
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
          width: "min(20rem, 100%)",
        }}
      >
        <Link
          href="/parent"
          style={{
            padding: "16px 20px",
            background: "var(--color-primary)",
            color: "var(--color-secondary)",
            borderRadius: "var(--radius-pill)",
            textAlign: "center",
            textDecoration: "none",
            fontSize: "16px",
            fontWeight: 500,
            letterSpacing: "0.01em",
            boxShadow: "var(--shadow-card)",
            transition: "transform 200ms var(--ease-out), box-shadow 200ms var(--ease-out)",
          }}
        >
          I&rsquo;m the parent
        </Link>
        <Link
          href="/kid"
          style={{
            padding: "16px 20px",
            background: "var(--color-secondary)",
            color: "var(--color-primary)",
            border: "1px solid var(--color-border-strong)",
            borderRadius: "var(--radius-pill)",
            textAlign: "center",
            textDecoration: "none",
            fontSize: "16px",
            fontWeight: 500,
            letterSpacing: "0.01em",
            transition: "background 200ms var(--ease-out)",
          }}
        >
          I&rsquo;m the kid
        </Link>
      </nav>

      <div
        className="mono"
        style={{
          display: "flex",
          gap: "var(--space-5)",
          fontSize: "11px",
          color: "var(--color-text-secondary)",
          textTransform: "uppercase",
        }}
      >
        <span>local-first</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>typed-only</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>no mic</span>
      </div>
    </main>
  );
}
