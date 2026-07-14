import { safeNum } from "./engine.js";

export function fmt$(v) {
  const n = safeNum(v);
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

export const fmtFull = (v) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(safeNum(v));

export const fmtPct = (v) => `${safeNum(v).toFixed(1)}%`;
