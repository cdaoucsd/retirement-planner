import { RETURN_PRESETS, INPUT_LIMITS, accountStockPct, accountReturnAtYear } from "../engine.js";
import { NumberInput } from "./ui.jsx";

// breakdown: [{ label, value, color?, bold? }] — shown as "At retirement" rows
// showContribBasis: renders a contribution-basis input (for Roth accounts)
// showCostBasis: renders a cost-basis input (for brokerage)
// proRataNote: shows the 401(k) pro-rata rule warning
export default function AccountCard({ title, icon, account, onChange, color, subtitle, breakdown, showContribBasis, showCostBasis, proRataNote, market }) {
  const stockPct = accountStockPct(account);
  const effRet = accountReturnAtYear(account, 0, market) * 100;

  return (
    <div className="bg-white rounded-lg border border-ink/10 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-md flex items-center justify-center text-white text-sm font-bold font-display" style={{ backgroundColor: color }} aria-hidden="true">{icon}</div>
        <div className="min-w-0">
          <h3 className="font-semibold text-ink">{title}</h3>
          {subtitle && <p className="text-xs text-haze leading-tight">{subtitle}</p>}
        </div>
      </div>
      <div className="space-y-3">
        <NumberInput label="Current Balance"      value={account.balance} onChange={v => onChange({ ...account, balance: v })} max={INPUT_LIMITS.balance.max} ariaLabel={`${title} current balance`} />
        {showContribBasis && (
          <NumberInput label="Contribution Basis (your cost basis)" value={account.contribBasis ?? account.balance}
            onChange={v => onChange({ ...account, contribBasis: Math.min(v, account.balance) })}
            max={account.balance} ariaLabel={`${title} contribution basis`} />
        )}
        {showCostBasis && (
          <NumberInput label="Cost Basis (total amount invested)" value={account.costBasis ?? account.balance}
            onChange={v => onChange({ ...account, costBasis: Math.min(v, account.balance) })}
            max={account.balance} ariaLabel={`${title} cost basis`} />
        )}
        <NumberInput label="Monthly Contribution" value={account.monthly} onChange={v => onChange({ ...account, monthly: v })} max={INPUT_LIMITS.monthly.max} ariaLabel={`${title} monthly contribution`} />
        <fieldset>
          <legend className="block text-xs font-medium text-haze mb-1">Asset Allocation (stocks/bonds)</legend>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`${title} asset allocation`}>
            {RETURN_PRESETS.map((p, i) => (
              <button key={p.id} onClick={() => onChange({ ...account, returnPreset: i })}
                role="radio" aria-checked={account.returnPreset === i}
                className={`text-xs px-2.5 py-1.5 rounded-full border transition-all ${account.returnPreset === i ? "bg-evergreen-light border-evergreen/40 text-evergreen-dark font-medium" : "border-ink/15 text-haze hover:border-ink/30"}`}>
                {p.label}
              </button>
            ))}
          </div>
          {account.returnPreset === 3 && (
            <div className="mt-2 space-y-2">
              <div className="flex gap-1.5" role="radiogroup" aria-label={`${title} custom mode`}>
                {[["alloc", "Stock/bond mix"], ["return", "Flat return %"]].map(([mode, lbl]) => (
                  <button key={mode} onClick={() => onChange({ ...account, customMode: mode })}
                    role="radio" aria-checked={(account.customMode ?? "return") === mode}
                    className={`flex-1 text-xs px-2 py-1.5 rounded-md border transition-all ${(account.customMode ?? "return") === mode ? "bg-evergreen-light border-evergreen/40 text-evergreen-dark font-medium" : "border-ink/15 text-haze hover:border-ink/30"}`}>
                    {lbl}
                  </button>
                ))}
              </div>
              {(account.customMode ?? "return") === "alloc" ? (
                <NumberInput label="Stocks" value={account.stockPct ?? 60} onChange={v => onChange({ ...account, stockPct: v })} prefix="" suffix="%" min={0} max={100} step={5} small ariaLabel={`${title} stock percentage`} />
              ) : (
                <NumberInput label="Annual return" value={account.customReturn} onChange={v => onChange({ ...account, customReturn: v })} prefix="" suffix="%" min={0} max={25} step={0.5} small ariaLabel={`${title} custom return rate`} />
              )}
            </div>
          )}
          {stockPct != null && (
            <div className="mt-2">
              <label className="flex items-center gap-2 text-xs text-ink/70 cursor-pointer">
                <input type="checkbox" checked={!!account.glide} onChange={e => onChange({ ...account, glide: e.target.checked })}
                  className="rounded border-ink/25 text-evergreen focus:ring-evergreen" aria-label={`${title} glide path`} />
                Glide path: shift 1% from stocks to bonds each year
              </label>
              {account.glide && (
                <div className="mt-2">
                  <NumberInput label="Stock floor (stop de-risking at)" value={account.glideFloor ?? 30} onChange={v => onChange({ ...account, glideFloor: v })} prefix="" suffix="%" min={0} max={100} step={5} small ariaLabel={`${title} glide floor`} />
                </div>
              )}
            </div>
          )}
        </fieldset>
        <div className="pt-2 border-t border-ink/5 text-xs text-haze">
          {stockPct != null ? (
            <>
              <span className="text-ink/80 font-medium font-mono tnum">{stockPct}/{100 - stockPct}</span> stocks/bonds
              {" — ~"}<span className="text-ink/80 font-medium font-mono tnum">{effRet.toFixed(1)}%</span>/yr expected
              {account.glide && <span> · glides to {Math.min(stockPct, account.glideFloor ?? 30)}% stocks</span>}
            </>
          ) : (
            <>Effective return: <span className="text-ink/80 font-medium font-mono tnum">{effRet.toFixed(1)}%</span> / year (flat)</>
          )}
        </div>
        {breakdown?.length > 0 && (
          <div className="pt-2 border-t border-ink/5">
            <p className="text-xs font-medium text-haze mb-1.5">At retirement</p>
            <div className="space-y-1">
              {breakdown.map(({ label, value, color: rc, bold, divider }) => divider
                ? <div key={label} className="border-t border-ink/5 my-1" />
                : (
                  <div key={label} className="flex justify-between text-xs">
                    <span className="text-haze">{label}</span>
                    <span className={`font-medium font-mono tnum ${rc || "text-ink/80"} ${bold ? "font-semibold" : ""}`}>{value}</span>
                  </div>
                )
              )}
            </div>
            {proRataNote && (
              <p className="mt-2 text-xs text-amber2 bg-amber2-light rounded px-2 py-1">
                ⚠ 401(k) withdrawals before 59½ mix contributions &amp; earnings (pro-rata rule) — you cannot take only contributions.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
