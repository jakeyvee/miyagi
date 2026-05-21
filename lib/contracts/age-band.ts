export const AGE_BANDS = ["4-6", "7-9", "10-12"] as const;

export type AgeBand = (typeof AGE_BANDS)[number];

export function isAgeBand(value: unknown): value is AgeBand {
  return typeof value === "string" && (AGE_BANDS as readonly string[]).includes(value);
}
