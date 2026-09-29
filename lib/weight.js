export const WEIGHT_UNITS = ["g", "kg"];

// Cleans whatever the client sends.
// Returns undefined if weight wasn't sent at all.
export function normalizeWeight(input) {
  if (input === undefined) return undefined;
  const unit = WEIGHT_UNITS.includes(input?.unit) ? input.unit : "g";
  const value = Number(input?.value);
  if (!Number.isFinite(value) || value <= 0) return { value: 0, unit };
  return { value, unit };
}

// "250 g", or null when no weight is set (old products included)
export function formatWeight(weight) {
  if (!weight || !(weight.value > 0)) return null;
  return `${weight.value} ${weight.unit || "g"}`;
}