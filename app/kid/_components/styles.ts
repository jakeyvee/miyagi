import type { CSSProperties } from "react";

/**
 * Aura design tokens projected into the kid surface. Hero card pattern:
 * the tree slot is the soft-sage feature card; the streaming response is
 * the dark `surface` card (white text on forest green) — the conversion
 * focus of the screen. Input + send live below as the calm baseline.
 */

export const screen: CSSProperties = {
  minHeight: "100dvh",
  display: "flex",
  flexDirection: "column",
  background: "var(--color-background)",
  color: "var(--color-text-primary)",
};

export const screenInner: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  padding: "var(--space-4)",
  gap: "var(--space-4)",
  maxWidth: "32rem",
  margin: "0 auto",
  width: "100%",
  boxSizing: "border-box",
};

export const treeSlot: CSSProperties = {
  flex: "0 0 56vh",
  minHeight: "16rem",
  borderRadius: "var(--radius-card)",
  background:
    "radial-gradient(circle at 50% 95%, rgba(122,158,126,0.18), rgba(122,158,126,0.04) 70%), var(--color-surface-soft)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "var(--space-4)",
  border: "1px solid var(--color-border)",
  boxShadow: "var(--shadow-card)",
  position: "relative",
  overflow: "hidden",
};

export const verdictSlot: CSSProperties = {
  minHeight: "24px",
  fontSize: "11px",
  fontFamily: "var(--font-mono)",
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--color-text-secondary)",
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
};

export const echoBubble: CSSProperties = {
  background: "var(--color-surface-soft)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-card)",
  padding: "12px 14px",
  fontSize: "14px",
  color: "var(--color-text-secondary)",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontStyle: "italic",
};

export const streamPanel: CSSProperties = {
  background: "var(--color-surface)",
  color: "var(--color-text-on-surface)",
  border: "1px solid var(--color-border-strong)",
  borderRadius: "var(--radius-card)",
  padding: "20px 22px",
  fontSize: "16px",
  lineHeight: 1.55,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  minHeight: "3.5rem",
  boxShadow: "var(--shadow-card)",
  fontFamily: "var(--font-body)",
};

export const responseArea: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-3)",
  overflowY: "auto",
};

export const inputRow: CSSProperties = {
  display: "flex",
  alignItems: "stretch",
  gap: "var(--space-2)",
};

export const textInput: CSSProperties = {
  flex: 1,
  appearance: "none",
  WebkitAppearance: "none",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-control)",
  padding: "14px 16px",
  fontSize: "16px",
  background: "var(--color-secondary)",
  color: "var(--color-text-primary)",
  fontFamily: "var(--font-body)",
  width: "100%",
  minHeight: "48px",
  resize: "none",
  lineHeight: 1.4,
  outline: "none",
  transition: "border-color 200ms var(--ease-out)",
};

export const submitButton: CSSProperties = {
  appearance: "none",
  border: "none",
  background: "var(--color-primary)",
  color: "var(--color-secondary)",
  borderRadius: "var(--radius-pill)",
  padding: "0 22px",
  fontSize: "15px",
  fontWeight: 500,
  cursor: "pointer",
  minHeight: "48px",
  minWidth: "84px",
  boxShadow: "var(--shadow-card)",
  transition: "transform 200ms var(--ease-out)",
};

export const submitButtonDisabled: CSSProperties = {
  ...submitButton,
  background: "var(--color-surface-soft)",
  color: "var(--color-text-secondary)",
  cursor: "not-allowed",
  boxShadow: "none",
};

export const hintButton: CSSProperties = {
  appearance: "none",
  border: "1px solid var(--color-border-strong)",
  background: "var(--color-secondary)",
  color: "var(--color-primary)",
  borderRadius: "var(--radius-pill)",
  padding: "10px 18px",
  fontSize: "14px",
  fontWeight: 500,
  cursor: "pointer",
  alignSelf: "flex-start",
  minHeight: "44px",
  transition: "background 200ms var(--ease-out)",
};

/**
 * Urgent / consequential button. Visually distinct from the calm hint
 * button so the kid can see this is the "expensive" option.
 */
export const giveAnswerButton: CSSProperties = {
  appearance: "none",
  border: "1px solid var(--color-danger)",
  background: "var(--color-danger-soft)",
  color: "var(--color-danger)",
  borderRadius: "var(--radius-pill)",
  padding: "10px 18px",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
  alignSelf: "flex-start",
  minHeight: "44px",
};

export const socraticControls: CSSProperties = {
  display: "flex",
  gap: "var(--space-2)",
  flexWrap: "wrap",
};

export const errorText: CSSProperties = {
  color: "var(--color-danger)",
  fontSize: "13px",
  margin: 0,
  fontWeight: 500,
};

export const refusalBubble: CSSProperties = {
  background: "var(--color-surface-soft)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-card)",
  padding: "16px 18px",
  fontSize: "15px",
  color: "var(--color-text-primary)",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontStyle: "italic",
};

export const noteText: CSSProperties = {
  color: "var(--color-text-secondary)",
  fontSize: "13px",
  margin: 0,
};

export const link: CSSProperties = {
  color: "var(--color-accent)",
  textDecoration: "underline",
  textUnderlineOffset: "3px",
};
