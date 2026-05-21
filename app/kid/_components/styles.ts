import type { CSSProperties } from "react";

/**
 * Mobile-first layout: full-viewport flex column, dominant tree slot at the
 * top (~60%), small verdict slot, scrollable response area, fixed input
 * affordance at the bottom. Tone matches the parent surface — rounded,
 * generous padding, neutral palette.
 */

export const screen: CSSProperties = {
  minHeight: "100dvh",
  display: "flex",
  flexDirection: "column",
  background: "#fafaf7",
  color: "#111",
};

export const screenInner: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  padding: "1rem",
  gap: "0.75rem",
  maxWidth: "32rem",
  margin: "0 auto",
  width: "100%",
  boxSizing: "border-box",
};

export const treeSlot: CSSProperties = {
  flex: "0 0 60vh",
  minHeight: "16rem",
  borderRadius: "1rem",
  background: "#eef3ec",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#516a55",
  fontSize: "0.875rem",
  textAlign: "center",
  padding: "1rem",
  border: "1px dashed #bcd1c1",
};

export const verdictSlot: CSSProperties = {
  minHeight: "1.5rem",
  fontSize: "0.8125rem",
  color: "#555",
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: "0.5rem",
};

export const echoBubble: CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e5e0",
  borderRadius: "0.75rem",
  padding: "0.625rem 0.75rem",
  fontSize: "0.9375rem",
  color: "#222",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

export const streamPanel: CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e5e0",
  borderRadius: "0.75rem",
  padding: "0.75rem 0.875rem",
  fontSize: "1rem",
  lineHeight: 1.45,
  color: "#111",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  minHeight: "3rem",
};

export const responseArea: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  overflowY: "auto",
};

export const inputRow: CSSProperties = {
  display: "flex",
  alignItems: "stretch",
  gap: "0.5rem",
};

export const textInput: CSSProperties = {
  flex: 1,
  appearance: "none",
  WebkitAppearance: "none",
  border: "1px solid #ccc",
  borderRadius: "0.75rem",
  padding: "0.875rem 0.875rem",
  fontSize: "1rem",
  background: "#fff",
  color: "#111",
  width: "100%",
  minHeight: "44px",
  resize: "none",
  fontFamily: "inherit",
  lineHeight: 1.35,
};

export const submitButton: CSSProperties = {
  appearance: "none",
  border: "none",
  background: "#111",
  color: "#fff",
  borderRadius: "0.75rem",
  padding: "0 1.125rem",
  fontSize: "1rem",
  cursor: "pointer",
  minHeight: "44px",
  minWidth: "72px",
};

export const submitButtonDisabled: CSSProperties = {
  ...submitButton,
  background: "#888",
  cursor: "not-allowed",
};

export const hintButton: CSSProperties = {
  appearance: "none",
  border: "1px solid #111",
  background: "#fff",
  color: "#111",
  borderRadius: "0.75rem",
  padding: "0.625rem 1rem",
  fontSize: "0.9375rem",
  cursor: "pointer",
  alignSelf: "flex-start",
  minHeight: "44px",
};

export const errorText: CSSProperties = {
  color: "#a40000",
  fontSize: "0.875rem",
  margin: 0,
};

export const lockedBanner: CSSProperties = {
  background: "#fff7e0",
  border: "1px solid #f1d68a",
  borderRadius: "0.75rem",
  padding: "0.875rem 1rem",
  fontSize: "0.9375rem",
  color: "#5a4500",
};

export const refusalBubble: CSSProperties = {
  ...streamPanel,
  background: "#fff7f0",
  borderColor: "#f1c6a0",
  color: "#5a3a1a",
};

export const noteText: CSSProperties = {
  color: "#555",
  fontSize: "0.8125rem",
  margin: 0,
};

export const link: CSSProperties = {
  color: "#0b5cad",
  textDecoration: "underline",
};
