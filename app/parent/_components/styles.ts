import type { CSSProperties } from "react";

/**
 * Aura design tokens projected as React inline styles. The CSS variables are
 * declared in app/globals.css; this module is just the typed shorthand that
 * the parent components reach for so the entire surface stays consistent.
 */

export const screen: CSSProperties = {
  minHeight: "100dvh",
  display: "flex",
  flexDirection: "column",
  padding: "var(--space-6) var(--space-5)",
  gap: "var(--space-5)",
  maxWidth: "32rem",
  margin: "0 auto",
  width: "100%",
  background: "var(--color-background)",
  color: "var(--color-text-primary)",
};

export const heading: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-display)",
  fontWeight: 500,
  fontSize: "clamp(32px, 9vw, 44px)",
  lineHeight: 1.05,
  color: "var(--color-text-primary)",
  letterSpacing: "-0.005em",
};

export const subheading: CSSProperties = {
  margin: 0,
  color: "var(--color-text-secondary)",
  fontSize: "15px",
  lineHeight: 1.5,
};

export const fieldLabel: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
  fontFamily: "var(--font-mono)",
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--color-text-secondary)",
};

export const input: CSSProperties = {
  appearance: "none",
  WebkitAppearance: "none",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-control)",
  padding: "14px 16px",
  fontSize: "16px",
  fontFamily: "var(--font-body)",
  background: "var(--color-secondary)",
  color: "var(--color-text-primary)",
  width: "100%",
  outline: "none",
  transition: "border-color 200ms var(--ease-out), box-shadow 200ms var(--ease-out)",
};

export const primaryButton: CSSProperties = {
  appearance: "none",
  border: "none",
  background: "var(--color-primary)",
  color: "var(--color-secondary)",
  borderRadius: "var(--radius-pill)",
  padding: "14px 20px",
  fontSize: "15px",
  fontWeight: 500,
  letterSpacing: "0.01em",
  cursor: "pointer",
  width: "100%",
  minHeight: "48px",
  boxShadow: "var(--shadow-card)",
  transition: "transform 200ms var(--ease-out), box-shadow 200ms var(--ease-out)",
};

export const secondaryButton: CSSProperties = {
  appearance: "none",
  background: "var(--color-secondary)",
  color: "var(--color-primary)",
  border: "1px solid var(--color-border-strong)",
  borderRadius: "var(--radius-pill)",
  padding: "14px 20px",
  fontSize: "15px",
  fontWeight: 500,
  cursor: "pointer",
  width: "100%",
  minHeight: "48px",
  textDecoration: "none",
  textAlign: "center",
  transition: "background 200ms var(--ease-out)",
};

export const errorText: CSSProperties = {
  color: "var(--color-danger)",
  fontSize: "13px",
  margin: 0,
  fontWeight: 500,
};

export const noteText: CSSProperties = {
  color: "var(--color-text-secondary)",
  fontSize: "13px",
  margin: 0,
  lineHeight: 1.5,
};

export const segmentedGroup: CSSProperties = {
  display: "flex",
  gap: "var(--space-2)",
  background: "var(--color-surface-soft)",
  padding: "4px",
  borderRadius: "var(--radius-pill)",
  border: "1px solid var(--color-border)",
};

export const segmentedButton = (active: boolean): CSSProperties => ({
  flex: 1,
  appearance: "none",
  border: "none",
  background: active ? "var(--color-primary)" : "transparent",
  color: active ? "var(--color-secondary)" : "var(--color-text-primary)",
  borderRadius: "var(--radius-pill)",
  padding: "10px 14px",
  fontSize: "14px",
  fontFamily: "var(--font-mono)",
  fontWeight: 600,
  letterSpacing: "0.04em",
  cursor: "pointer",
  transition: "background 200ms var(--ease-out), color 200ms var(--ease-out)",
});
