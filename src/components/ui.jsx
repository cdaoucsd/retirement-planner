import { useState, useId } from "react";

// ─── NumberInput ──────────────────────────────────────────────────────────────
// Local draft while typing; commits (clamped) on blur. No effects needed —
// when not editing, the shown value tracks the prop.
export function NumberInput({ label, value, onChange, prefix = "$", min = 0, max, step = 1, suffix, small, ariaLabel }) {
  const id = useId();
  const [draft, setDraft] = useState(null); // null = not editing
  const shown = draft ?? String(value ?? 0);

  const commit = () => {
    if (draft == null) return;
    const n = Number(draft);
    setDraft(null);
    if (!Number.isFinite(n) || draft.trim() === "") return;
    const c = max !== undefined ? Math.min(Math.max(n, min), max) : Math.max(n, min);
    onChange(c);
  };

  return (
    <div className={small ? "flex-1 min-w-0" : ""}>
      {label && <label htmlFor={id} className="block text-xs font-medium text-haze mb-1">{label}</label>}
      <div className="relative">
        {prefix && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-haze/70 text-sm" aria-hidden="true">{prefix}</span>}
        <input id={id} type="number" inputMode="decimal" value={shown}
          onChange={e => setDraft(e.target.value)} onBlur={commit}
          min={min} max={max} step={step} aria-label={ariaLabel || label || undefined}
          className={`w-full border border-ink/15 rounded-md bg-white py-2 text-sm font-mono tnum focus:ring-2 focus:ring-evergreen focus:border-transparent outline-none ${prefix ? "pl-7" : "pl-3"} ${suffix ? "pr-8" : "pr-3"}`} />
        {suffix && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-haze/70 text-sm" aria-hidden="true">{suffix}</span>}
      </div>
    </div>
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────────
export function Toggle({ checked, onToggle, ariaLabel, ariaLabelledBy }) {
  return (
    <button onClick={onToggle} role="switch" aria-checked={checked}
      aria-label={ariaLabel} aria-labelledby={ariaLabelledBy}
      className={`relative w-10 h-5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-evergreen focus:ring-offset-1 ${checked ? "bg-evergreen" : "bg-ink/20"}`}>
      <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all" style={{ left: checked ? "22px" : "2px" }} />
    </button>
  );
}

// ─── ClearButton ──────────────────────────────────────────────────────────────
export function ClearButton({ onClick, label = "Clear" }) {
  return (
    <button onClick={onClick}
      className="text-xs text-haze hover:text-danger border border-ink/15 hover:border-danger/40 px-2.5 py-1 rounded-md transition-colors"
      aria-label={label}>
      {label}
    </button>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, className = "" }) {
  return <div className={`bg-white rounded-lg border border-ink/10 shadow-sm ${className}`}>{children}</div>;
}

// ─── SectionHeader — numbered, with an age-range annotation (the age spine) ───
export function SectionHeader({ n, title, ages, sub, id }) {
  return (
    <div id={id} className="flex items-baseline gap-3 mb-4 mt-10 scroll-mt-24">
      <span className="font-display text-3xl font-semibold text-evergreen/30 select-none" aria-hidden="true">{n}</span>
      <div>
        <h2 className="font-display text-xl font-semibold text-ink">
          {title}
          {ages && <span className="ml-3 text-sm font-mono tnum font-medium text-copper align-middle">{ages}</span>}
        </h2>
        {sub && <p className="text-sm text-haze mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}
