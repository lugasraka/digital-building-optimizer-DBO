// Shared chart palette matching the clean-tech light theme:
// teal brand ramp for primary series, emerald for savings/clean energy,
// slate for secondary/neutral series.
export const PALETTE = {
  brand: "#0f766e",
  brandLight: "#5eead4",
  emerald: "#059669",
  amber: "#d97706",
  slate: "#64748b",
  slateDark: "#334155",
  red: "#dc2626",
} as const;

export const dispatchRamp = ["#f1f5f9", "#5eead4", "#0f766e"] as const;
export const storageRamp = ["#ecfdf5", "#34d399", "#065f46"] as const;
