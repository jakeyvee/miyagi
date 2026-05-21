import type { CSSProperties } from "react";

export const screen: CSSProperties = {
  minHeight: "100dvh",
  display: "flex",
  flexDirection: "column",
  padding: "1.5rem",
  gap: "1rem",
  maxWidth: "30rem",
  margin: "0 auto",
  width: "100%",
};

export const heading: CSSProperties = {
  margin: 0,
  fontSize: "1.5rem",
};

export const subheading: CSSProperties = {
  margin: 0,
  color: "#555",
  fontSize: "0.9375rem",
  lineHeight: 1.4,
};

export const fieldLabel: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.375rem",
  fontSize: "0.875rem",
  color: "#333",
};

export const input: CSSProperties = {
  appearance: "none",
  WebkitAppearance: "none",
  border: "1px solid #ccc",
  borderRadius: "0.5rem",
  padding: "0.75rem 0.875rem",
  fontSize: "1rem",
  background: "#fff",
  color: "#111",
  width: "100%",
};

export const primaryButton: CSSProperties = {
  appearance: "none",
  border: "none",
  background: "#111",
  color: "#fff",
  borderRadius: "0.75rem",
  padding: "0.875rem 1rem",
  fontSize: "1rem",
  cursor: "pointer",
  width: "100%",
};

export const secondaryButton: CSSProperties = {
  appearance: "none",
  background: "#fff",
  color: "#111",
  border: "1px solid #111",
  borderRadius: "0.75rem",
  padding: "0.875rem 1rem",
  fontSize: "1rem",
  cursor: "pointer",
  width: "100%",
  textDecoration: "none",
  textAlign: "center",
};

export const errorText: CSSProperties = {
  color: "#a40000",
  fontSize: "0.875rem",
  margin: 0,
};

export const noteText: CSSProperties = {
  color: "#666",
  fontSize: "0.8125rem",
  margin: 0,
  lineHeight: 1.4,
};

export const segmentedGroup: CSSProperties = {
  display: "flex",
  gap: "0.5rem",
};

export const segmentedButton = (active: boolean): CSSProperties => ({
  flex: 1,
  appearance: "none",
  border: active ? "2px solid #111" : "1px solid #ccc",
  background: active ? "#111" : "#fff",
  color: active ? "#fff" : "#111",
  borderRadius: "0.5rem",
  padding: "0.625rem 0.5rem",
  fontSize: "0.9375rem",
  cursor: "pointer",
});
