// Client-safe weight helpers (no database imports).
// item.weight = { value: Number, unit: "g" | "kg" }

// Cleans incoming weight data from API payloads.
// Returns undefined when missing/invalid so the model default applies.
export function normalizeWeight(w) {
  if (!w) return undefined;
  const value = Number(w.value);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const unit = w.unit === "kg" ? "kg" : "g";
  return { value, unit };
}

// Converts a weight object to grams. Tolerates string values.
export function toGrams(w) {
  if (!w) return 0;
  const value = Number(w.value);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return w.unit === "kg" ? value * 1000 : value;
}

// Accepts grams (number or numeric string) OR a weight object { value, unit }.
export function formatWeight(input) {
  const grams =
    input && typeof input === "object" ? toGrams(input) : Number(input);

  if (!Number.isFinite(grams) || grams <= 0) return "—";
  if (grams >= 1000) return `${+(grams / 1000).toFixed(2)} kg`;
  return `${+grams.toFixed(1)} g`;
}

export function orderTotalGrams(items) {
  return (items || []).reduce(
    (sum, i) => sum + toGrams(i.weight) * (Number(i.quantity) || 0),
    0
  );
}

export function itemsMissingWeight(items) {
  return (items || []).filter((i) => !toGrams(i.weight)).length;
}