import { useState, useMemo, useId, useEffect, useCallback } from "react";
import { XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Area, AreaChart, CartesianGrid, ReferenceLine, BarChart, Bar } from "recharts";
import {
  RETURN_PRESETS, INPUT_LIMITS, MC_SIMULATIONS, MILESTONE_AGES,
  ACCT_KEYS, ACCT_COLORS, ACCT_LABELS,
  safeNum, clamp,
  computeEmployerMatch, runProjection, runMonteCarlo,
} from "./engine.js";

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmt$(v) {
  const n = safeNum(v);
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}
const fmtFull = (v) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(safeNum(v));
const fmtPct  = (v) => `${safeNum(v).toFixed(1)}%`;

// ─── Error Boundary ───────────────────────────────────────────────────────────
function ErrorFallback({ onReset }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-6 m-4 text-center" role="alert">
      <h2 className="text-red-700 font-semibold mb-2">Something went wrong</h2>
      <p className="text-red-600 text-sm mb-4">An error occurred in the calculation engine. Please reset your inputs.</p>
      <button onClick={onReset} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">Reset to Defaults</button>
    </div>
  );
}

// ─── NumberInput ──────────────────────────────────────────────────────────────
function NumberInput({ label, value, onChange, prefix = "$", min = 0, max, step = 1, suffix, small, ariaLabel }) {
  const id = useId();
  const [local, setLocal] = useState(String(value ?? 0));
  useEffect(() => { setLocal(String(value ?? 0)); }, [value]);

  const onBlur = () => {
    const n = Number(local);
    if (!Number.isFinite(n) || local.trim() === "") { setLocal(String(value ?? 0)); return; }
    const c = max !== undefined ? Math.min(Math.max(n, min), max) : Math.max(n, min);
    setLocal(String(c));
    onChange(c);
  };

  return (
    <div className={small ? "flex-1 min-w-0" : ""}>
      {label && <label htmlFor={id} className="block text-xs font-medium text-gray-500 mb-1">{label}</label>}
      <div className="relative">
        {prefix && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm" aria-hidden="true">{prefix}</span>}
        <input id={id} type="number" inputMode="decimal" value={local}
          onChange={e => setLocal(e.target.value)} onBlur={onBlur}
          min={min} max={max} step={step} aria-label={ariaLabel || label || undefined}
          className={`w-full border border-gray-200 rounded-lg py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${prefix ? "pl-7" : "pl-3"} ${suffix ? "pr-8" : "pr-3"}`} />
        {suffix && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm" aria-hidden="true">{suffix}</span>}
      </div>
    </div>
  );
}

// ─── AccountCard ──────────────────────────────────────────────────────────────
function AccountCard({ title, icon, account, onChange, color, subtitle }) {
  const ret = RETURN_PRESETS[account.returnPreset]?.value ?? account.customReturn;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: color }} aria-hidden="true">{icon}</div>
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-800">{title}</h3>
          {subtitle && <p className="text-xs text-gray-400 leading-tight">{subtitle}</p>}
        </div>
      </div>
      <div className="space-y-3">
        <NumberInput label="Current Balance"      value={account.balance} onChange={v => onChange({ ...account, balance: v })} max={INPUT_LIMITS.balance.max} ariaLabel={`${title} current balance`} />
        <NumberInput label="Monthly Contribution" value={account.monthly} onChange={v => onChange({ ...account, monthly: v })} max={INPUT_LIMITS.monthly.max} ariaLabel={`${title} monthly contribution`} />
        <fieldset>
          <legend className="block text-xs font-medium text-gray-500 mb-1">Expected Annual Return</legend>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`${title} expected return`}>
            {RETURN_PRESETS.map((p, i) => (
              <button key={p.id} onClick={() => onChange({ ...account, returnPreset: i })}
                role="radio" aria-checked={account.returnPreset === i}
                className={`text-xs px-2.5 py-1.5 rounded-full border transition-all ${account.returnPreset === i ? "bg-blue-50 border-blue-300 text-blue-700 font-medium" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                {p.label}
              </button>
            ))}
          </div>
          {account.returnPreset === 3 && (
            <div className="mt-2">
              <NumberInput value={account.customReturn} onChange={v => onChange({ ...account, customReturn: v })} prefix="" suffix="%" min={0} max={25} step={0.5} small ariaLabel={`${title} custom return rate`} />
            </div>
          )}
        </fieldset>
        <div className="pt-2 border-t border-gray-100 text-xs text-gray-400">
          Effective return: <span className="text-gray-600 font-medium">{ret}%</span> / year
        </div>
      </div>
    </div>
  );
}

// ─── IncomeCard ───────────────────────────────────────────────────────────────
function IncomeCard({ title, icon, enabled, onToggle, children, color }) {
  const sid = useId();
  return (
    <div className={`bg-white rounded-xl border p-5 shadow-sm transition-all ${enabled ? "border-gray-200 hover:shadow-md" : "border-gray-100 opacity-60"}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: enabled ? color : "#9ca3af" }} aria-hidden="true">{icon}</div>
          <h3 id={sid} className="font-semibold text-gray-800">{title}</h3>
        </div>
        <button onClick={onToggle} role="switch" aria-checked={enabled} aria-labelledby={sid}
          className={`relative w-10 h-5 rounded-full transition-colors ${enabled ? "bg-blue-500" : "bg-gray-300"}`}>
          <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow" style={{ left: enabled ? "22px" : "2px" }} />
        </button>
      </div>
      {enabled && <div className="space-y-3">{children}</div>}
    </div>
  );
}

// ─── StatBox ──────────────────────────────────────────────────────────────────
function StatBox({ label, value, sub, color }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-xl font-bold" style={{ color: color || "#1e293b" }}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

// ─── Tooltips ─────────────────────────────────────────────────────────────────
function PortfolioTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm" role="status" aria-live="polite">
      <p className="font-medium text-gray-700 mb-1.5">Age {label}</p>
      {payload.map(e => (
        <div key={e.dataKey || e.name} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: e.color }} aria-hidden="true" />
          <span className="text-gray-600">{e.name}:</span>
          <span className="font-medium text-gray-800">{fmtFull(e.value)}</span>
        </div>
      ))}
    </div>
  );
}

function WithdrawalTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm" role="status" aria-live="polite">
      <p className="font-medium text-gray-700 mb-1.5">Age {label}</p>
      {payload.filter(e => e.value > 0).map(e => (
        <div key={e.dataKey || e.name} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: e.color }} aria-hidden="true" />
          <span className="text-gray-600">{e.name}:</span>
          <span className="font-medium text-gray-800">{fmtFull(e.value)}</span>
        </div>
      ))}
    </div>
  );
}

function MCTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm" role="status" aria-live="polite">
      <p className="font-medium text-gray-700 mb-1.5">Age {label}</p>
      <div className="space-y-1">
        {[["90th", d.p90], ["75th", d.p75], ["50th (Median)", d.p50], ["25th", d.p25], ["10th", d.p10]].map(([lbl, val]) => (
          <div key={lbl} className="flex justify-between gap-4 text-xs">
            <span className="text-gray-500">{lbl} percentile</span>
            <span className="font-medium">{fmtFull(val)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Withdrawal Strategy Panel ────────────────────────────────────────────────
function WithdrawalStrategyPanel({ projection, retirementAge, birthYear }) {
  const [selectedAge, setSelectedAge] = useState(retirementAge);
  const retiredData = projection.filter(d => d.age >= retirementAge);
  const selected    = projection.find(d => d.age === selectedAge) || retiredData[0];
  const strategy    = selected?.strategy;
  const rmdAge      = birthYear <= 1959 ? 73 : 75;

  const phases = [
    { id: "early",    label: "Early (before 59½)", active: selectedAge < 59.5,                         show: retirementAge < 59.5 },
    { id: "optimize", label: "Tax Optimization",        active: selectedAge >= 59.5 && selectedAge < rmdAge, show: true },
    { id: "rmd",      label: "RMD Phase",               active: selectedAge >= rmdAge,                       show: true },
  ];

  const wKeyMap = { trad401k: "wTrad401k", roth401k: "wRoth401k", rothIRA: "wRothIRA", brokerage: "wBrokerage" };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">Withdrawal Strategy</h3>
        <div className="flex items-center gap-2">
          <label htmlFor="age-sel" className="text-xs text-gray-500">Age:</label>
          <select id="age-sel" value={selectedAge} onChange={e => setSelectedAge(Number(e.target.value))}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:ring-2 focus:ring-blue-500 outline-none">
            {retiredData.map(d => <option key={d.age} value={d.age}>{d.age}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-1 mb-4" role="tablist" aria-label="Retirement phases">
        {phases.filter(p => p.show).map(p => (
          <div key={p.id} role="tab" aria-selected={p.active}
            className={`flex-1 text-center py-1.5 rounded-lg text-xs font-medium ${p.active ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-400"}`}>
            {p.label}
          </div>
        ))}
      </div>
      {strategy && (
        <>
          <p className="text-xs font-medium text-blue-600 mb-2">{strategy.phase}</p>
          {strategy.note && <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-3">{strategy.note}</p>}
          <div className="space-y-2" role="list">
            {strategy.order.map(({ key, reason }, i) => {
              const withdrawn = selected?.[wKeyMap[key]] ?? 0;
              const penalty   = key === "trad401k" && selectedAge < 59.5 && !(retirementAge >= 55 && retirementAge < 59.5);
              return (
                <div key={key} role="listitem" className={`border rounded-lg p-3 ${i === 0 ? "border-blue-200 bg-blue-50" : "border-gray-100"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: ACCT_COLORS[key] }} aria-hidden="true">{i + 1}</span>
                      <span className="text-sm font-medium text-gray-800">{ACCT_LABELS[key]}</span>
                      {penalty && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">10% Penalty</span>}
                      {i === 0 && <span className="text-xs bg-green-100 text-green-600 px-1.5 py-0.5 rounded font-medium">Primary</span>}
                    </div>
                    {withdrawn > 0 && <span className="text-sm font-medium text-gray-700">{fmtFull(withdrawn)}</span>}
                  </div>
                  <p className="text-xs text-gray-500 ml-7">{reason}</p>
                </div>
              );
            })}
          </div>
          {selected?.estTax > 0 && (
            <div className="mt-3 bg-gray-50 border border-gray-100 rounded-lg p-3 space-y-1">
              <div className="flex justify-between text-xs"><span className="text-gray-500">Est. Federal Tax</span><span className="font-medium">{fmtFull(selected.estTax)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-gray-500">Marginal Rate</span><span className="font-medium">{(safeNum(selected.marginalRate) * 100).toFixed(0)}%</span></div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Roth Conversion Panel ────────────────────────────────────────────────────
function RothConversionPanel({
  enabled, onToggleEnabled,
  bracket, onChangeBracket,
  projection, projectionNoConv, retirementAge, birthYear,
}) {
  const rmdAge = birthYear <= 1959 ? 73 : 75;
  const window = projection.filter(d => d.age >= retirementAge && d.age < rmdAge);

  const totalConverted = window.reduce((s, d) => s + (d.conversion || 0), 0);
  const totalConvTax   = window.reduce((s, d) => s + (d.conversionTax || 0), 0);

  const tradAtRMDWith   = projection.find(d => d.age === rmdAge)?.trad401k ?? 0;
  const tradAtRMDWithout = projectionNoConv?.find(d => d.age === rmdAge)?.trad401k ?? 0;
  const rmdReduction = Math.max(0, tradAtRMDWithout - tradAtRMDWith);

  const bracketOptions = [
    { value: 0.12, label: "12% bracket" },
    { value: 0.22, label: "22% bracket" },
    { value: 0.24, label: "24% bracket" },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Roth Conversion Ladder</h3>
          <p className="text-xs text-gray-400 mt-0.5">Convert Traditional → Roth IRA from retirement until RMDs at age {rmdAge}</p>
        </div>
        <button onClick={onToggleEnabled} role="switch" aria-checked={enabled} aria-label="Enable Roth conversions"
          className={`relative w-10 h-5 rounded-full transition-colors ${enabled ? "bg-blue-500" : "bg-gray-300"}`}>
          <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow" style={{ left: enabled ? "22px" : "2px" }} />
        </button>
      </div>

      {enabled && (
        <>
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-500 mb-2">Fill up to bracket ceiling</label>
            <div className="flex gap-1.5" role="radiogroup" aria-label="Target bracket">
              {bracketOptions.map(b => (
                <button key={b.value} onClick={() => onChangeBracket(b.value)}
                  role="radio" aria-checked={bracket === b.value}
                  className={`flex-1 text-xs px-2.5 py-2 rounded-lg border transition-all ${bracket === b.value ? "bg-blue-50 border-blue-300 text-blue-700 font-medium" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
              <p className="text-xs text-gray-500">Total Converted</p>
              <p className="text-lg font-bold text-gray-800">{fmtFull(totalConverted)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
              <p className="text-xs text-gray-500">Total Conv. Tax</p>
              <p className="text-lg font-bold text-gray-800">{fmtFull(totalConvTax)}</p>
            </div>
            <div className="bg-green-50 rounded-lg p-3 border border-green-100">
              <p className="text-xs text-green-700">RMD Bal. Reduction</p>
              <p className="text-lg font-bold text-green-700">{fmtFull(rmdReduction)}</p>
            </div>
          </div>

          {window.length > 0 && (
            <>
              <h4 className="text-xs font-semibold text-gray-600 mb-2">Conversions by Year</h4>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={window} margin={{ top: 5, right: 15, bottom: 5, left: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="age" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis tickFormatter={fmt$} tick={{ fontSize: 11 }} stroke="#94a3b8" width={55} />
                  <Tooltip formatter={(v) => fmtFull(v)} />
                  <Bar dataKey="conversion"    name="Conversion" fill="#2563eb" />
                  <Bar dataKey="conversionTax" name="Tax"        fill="#dc2626" />
                </BarChart>
              </ResponsiveContainer>
              <div className="max-h-56 overflow-y-auto mt-3 border border-gray-100 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500 sticky top-0">
                    <tr><th className="text-left px-3 py-1.5">Age</th><th className="text-right px-3 py-1.5">Convert</th><th className="text-right px-3 py-1.5">Tax</th><th className="text-right px-3 py-1.5">Tax From</th></tr>
                  </thead>
                  <tbody>
                    {window.map(d => (
                      <tr key={d.age} className="border-t border-gray-100">
                        <td className="px-3 py-1.5">{d.age}</td>
                        <td className="px-3 py-1.5 text-right">{fmtFull(d.conversion)}</td>
                        <td className="px-3 py-1.5 text-right">{fmtFull(d.conversionTax)}</td>
                        <td className="px-3 py-1.5 text-right text-gray-500">
                          {d.conversionTax === 0 ? "—" :
                           d.conversionTaxFromBrokerage >= d.conversionTax ? "Brokerage" :
                           d.conversionTaxFromBrokerage > 0 ? "Mixed" : "Netted"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      <details className="mt-4 group">
        <summary className="cursor-pointer text-xs font-semibold text-blue-700 hover:text-blue-900 select-none">
          📖 How Roth conversions work — best practices
        </summary>
        <div className="mt-3 space-y-3 text-xs text-gray-600 leading-relaxed">
          <div>
            <p className="font-semibold text-gray-700">When to convert (the sweet spot)</p>
            <p>The window between retirement and RMDs is usually the lowest-income period of your life — wages stop, Social Security is often delayed, and no RMDs yet. Your marginal tax rate is at its lowest, which makes converting cheapest. Convert <em>early</em> in the window so the converted dollars compound tax-free for longer, and spread amounts evenly to avoid pushing yourself into a higher bracket.</p>
          </div>
          <div>
            <p className="font-semibold text-gray-700">How much to convert</p>
            <p>The classic rule is "fill to the top of your current bracket" — convert just enough to reach the next bracket's threshold without crossing it. The 12% bracket is the no-brainer ceiling for most retirees. Going up to 22% or 24% can still pay off if your eventual RMDs would push you into 24%+ anyway. Compare your <em>current</em> marginal rate to your <em>projected RMD-era</em> rate; convert only when current ≤ projected.</p>
          </div>
          <div>
            <p className="font-semibold text-gray-700">Watch out for cliffs (not modeled here)</p>
            <ul className="list-disc ml-5 mt-1 space-y-1">
              <li><strong>IRMAA</strong> (age 65+): Medicare Part B/D premiums jump at MAGI thresholds (~$106K single / $212K MFJ in 2025). Conversions count toward MAGI with a 2-year lookback.</li>
              <li><strong>ACA premium tax credits</strong> (under 65): conversions can disqualify you from Marketplace subsidies.</li>
              <li><strong>NIIT</strong> (3.8%): kicks in at MAGI &gt; $200K single / $250K MFJ.</li>
              <li><strong>Social Security taxation</strong>: conversions can push more of your SS into the 85%-taxable tier.</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-gray-700">Pay the tax from outside the IRA</p>
            <p>Pay conversion tax from a taxable brokerage account, not from the conversion itself. Withholding tax from the conversion shrinks the amount that grows tax-free forever (and under 59½ the withheld portion is treated as a distribution, with a 10% penalty). This calculator pulls tax from brokerage first, falling back to netting only if brokerage runs out.</p>
          </div>
          <div>
            <p className="font-semibold text-gray-700">State tax & relocation</p>
            <p>Conversions are state-taxable in most states. If you're moving from a high-tax state (CA, NY) to a no-tax state (FL, TX, NV), convert <em>after</em> the move.</p>
          </div>
          <div>
            <p className="font-semibold text-gray-700">Heirs and the SECURE Act</p>
            <p>Inherited Traditional IRAs must be drained within 10 years by non-spouse heirs — at the heir's (often peak-earning) tax rate. Inherited Roths follow the same 10-year rule but are tax-free. If you're leaving money to high-earning kids, conversions transfer the tax bill from them (24–37%) to you (12–24%).</p>
          </div>
          <div>
            <p className="font-semibold text-gray-700">Widow's-tax trap</p>
            <p>A surviving spouse files single — same income, narrower brackets. Converting while still married-filing-jointly shields against this.</p>
          </div>
          <div>
            <p className="font-semibold text-gray-700">Two 5-year rules (often confused)</p>
            <ul className="list-disc ml-5 mt-1 space-y-1">
              <li><em>Per-conversion rule</em>: each conversion has its own clock for the 10% early-withdrawal penalty on principal. Irrelevant once you're 59½+.</li>
              <li><em>Account rule</em>: Roth IRA earnings are tax-free only after the <em>account</em> has been open 5 years. Open one with $1 today even if you don't plan to use it soon.</li>
            </ul>
          </div>
          <p className="text-gray-500 italic">This calculator models federal income tax only, with brackets inflating at your inflation rate. Actual brackets and laws change — consult a CPA or fee-only fiduciary advisor before executing a multi-year conversion strategy.</p>
        </div>
      </details>
    </div>
  );
}

// ─── Milestone Timeline ───────────────────────────────────────────────────────
function MilestoneTimeline({ currentAge, retirementAge, birthYear }) {
  const rmdAge = birthYear <= 1959 ? 73 : 75;
  const milestones = MILESTONE_AGES.filter(m => {
    if (m.age === 73 && rmdAge !== 73) return false;
    if (m.age === 75 && rmdAge !== 75) return false;
    return m.age > currentAge;
  });
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Key Age Milestones</h3>
      <div className="relative" role="list">
        <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-gray-200" aria-hidden="true" />
        <div className="space-y-3">
          {milestones.map(m => {
            const isRetire = m.age === retirementAge || (m.age === 55 && retirementAge >= 55 && retirementAge < 59.5);
            return (
              <div key={m.age} role="listitem" className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center z-10 bg-white shrink-0" style={{ borderColor: m.color }} aria-hidden="true">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold" style={{ color: m.color }}>Age {m.age}</span>
                    <span className="text-xs font-medium text-gray-700">{m.label}</span>
                    {isRetire && <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">Relevant</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{m.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Monte Carlo Panel ────────────────────────────────────────────────────────
function MonteCarloPanel({ mcResult, onRun, running }) {
  const successColor = mcResult
    ? mcResult.successRate >= 90 ? "#16a34a"
    : mcResult.successRate >= 75 ? "#d97706"
    : "#dc2626"
    : "#6b7280";

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Monte Carlo Simulation</h3>
            <p className="text-xs text-gray-500 mt-0.5">{MC_SIMULATIONS.toLocaleString()} simulations with randomised annual returns</p>
          </div>
          <button onClick={onRun} disabled={running}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white text-sm font-medium rounded-lg transition-colors">
            {running ? "Running…" : mcResult ? "Re-run" : "Run Simulation"}
          </button>
        </div>

        {mcResult && (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-lg p-3 text-center" style={{ backgroundColor: `${successColor}15`, border: `1px solid ${successColor}40` }}>
                <p className="text-xs text-gray-500 mb-1">Success Rate</p>
                <p className="text-2xl font-bold" style={{ color: successColor }}>{fmtPct(mcResult.successRate)}</p>
                <p className="text-xs mt-1" style={{ color: successColor }}>
                  {mcResult.successRate >= 90 ? "Very Safe" : mcResult.successRate >= 75 ? "Moderate Risk" : "High Risk"}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-100">
                <p className="text-xs text-gray-500 mb-1">Avg. Return Used</p>
                <p className="text-xl font-bold text-gray-800">{fmtPct(mcResult.blendedMean * 100)}</p>
                <p className="text-xs text-gray-400 mt-1">blended annual</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-100">
                <p className="text-xs text-gray-500 mb-1">Volatility (σ)</p>
                <p className="text-xl font-bold text-gray-800">{fmtPct(mcResult.blendedVol * 100)}</p>
                <p className="text-xs text-gray-400 mt-1">annual std dev</p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700 mb-4">
              <p><strong>How to read this:</strong> Each simulation uses a different sequence of random returns drawn from a normal distribution. The success rate shows how often the portfolio survived to your life expectancy age. A rate of 90%+ is generally considered safe by financial planners.</p>
            </div>

            <h4 className="text-xs font-semibold text-gray-600 mb-2">Portfolio Range Across Simulations</h4>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={mcResult.fanData} margin={{ top: 5, right: 15, bottom: 5, left: 10 }}>
                <defs>
                  <linearGradient id="gP90" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563eb" stopOpacity={0.08} /><stop offset="95%" stopColor="#2563eb" stopOpacity={0} /></linearGradient>
                  <linearGradient id="gP75" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} /><stop offset="95%" stopColor="#2563eb" stopOpacity={0} /></linearGradient>
                  <linearGradient id="gP50" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} /><stop offset="95%" stopColor="#2563eb" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="age" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tickFormatter={fmt$} tick={{ fontSize: 11 }} stroke="#94a3b8" width={55} />
                <Tooltip content={<MCTooltip />} />
                <Area type="monotone" dataKey="p90" name="90th %ile" stroke="#93c5fd" fill="url(#gP90)" strokeWidth={1} strokeDasharray="4 2" dot={false} />
                <Area type="monotone" dataKey="p75" name="75th %ile" stroke="#60a5fa" fill="url(#gP75)" strokeWidth={1.5} dot={false} />
                <Area type="monotone" dataKey="p50" name="Median"    stroke="#2563eb" fill="url(#gP50)" strokeWidth={2}   dot={false} />
                <Area type="monotone" dataKey="p25" name="25th %ile" stroke="#60a5fa" fill="none"       strokeWidth={1.5} dot={false} />
                <Area type="monotone" dataKey="p10" name="10th %ile" stroke="#93c5fd" fill="none"       strokeWidth={1} strokeDasharray="4 2" dot={false} />
              </AreaChart>
            </ResponsiveContainer>

            <div className="mt-3 grid grid-cols-5 gap-1 text-center text-xs text-gray-500">
              {[["10th", "#93c5fd"], ["25th", "#60a5fa"], ["Median", "#2563eb"], ["75th", "#60a5fa"], ["90th", "#93c5fd"]].map(([lbl, c]) => (
                <div key={lbl}><span className="inline-block w-3 h-0.5 mr-1 align-middle" style={{ backgroundColor: c }} />{lbl}</div>
              ))}
            </div>
          </>
        )}

        {!mcResult && (
          <div className="text-center py-8 text-gray-400">
            <p className="text-sm">Click "Run Simulation" to model {MC_SIMULATIONS.toLocaleString()} retirement scenarios</p>
            <p className="text-xs mt-1">Uses your current account balances, return rates, and withdrawal settings</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ClearButton ──────────────────────────────────────────────────────────────
function ClearButton({ onClick, label = "Clear" }) {
  return (
    <button onClick={onClick}
      className="text-xs text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-300 px-2.5 py-1 rounded-lg transition-colors"
      aria-label={label}>
      {label}
    </button>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
const CURRENT_YEAR  = new Date().getFullYear();
const CLEAR_ACCOUNT = { balance: 0, monthly: 0, returnPreset: 1, customReturn: 7 };

const DEFAULTS = {
  retirementAge: 65, lifeExpectancy: 90,
  annualSpending: 60000, withdrawalMode: "fixed", withdrawalRate: 4.0,
  inflationRate: 2.5, birthYear: 1995,
  accounts: {
    trad401k:  { balance: 50000, monthly: 1000, returnPreset: 1, customReturn: 7 },
    roth401k:  { balance: 0,     monthly: 0,    returnPreset: 1, customReturn: 7 },
    rothIRA:   { balance: 15000, monthly: 500,  returnPreset: 1, customReturn: 7 },
    brokerage: { balance: 10000, monthly: 300,  returnPreset: 1, customReturn: 7 },
  },
  ssEnabled: true, ssMonthly: 2000, ssStartAge: 67,
  pensionEnabled: false, pensionMonthly: 1500, pensionStartAge: 65,
  annualIncome: 0, employerMatchPct: 0, employerMatchCapPct: 6,
  rothConversionEnabled: false, rothConversionBracket: 0.12,
};

const STORAGE_KEY = "retirement_planner_state_v2";

function loadSavedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const saved = JSON.parse(raw);
    return { ...DEFAULTS, ...saved, accounts: { ...DEFAULTS.accounts, ...saved.accounts } };
  } catch {
    return DEFAULTS;
  }
}

export default function RetirementPlanner() {
  const [saved] = useState(loadSavedState);
  const [retirementAge, setRetirementAge] = useState(saved.retirementAge);
  const [lifeExpectancy, setLifeExpectancy] = useState(saved.lifeExpectancy);
  const [annualSpending, setAnnualSpending] = useState(saved.annualSpending);
  const [withdrawalMode, setWithdrawalMode] = useState(saved.withdrawalMode);
  const [withdrawalRate, setWithdrawalRate] = useState(saved.withdrawalRate);
  const [inflationRate, setInflationRate] = useState(saved.inflationRate);
  const [birthYear, setBirthYear] = useState(saved.birthYear);
  const [accounts, setAccounts] = useState(saved.accounts);

  const [ssEnabled, setSSEnabled] = useState(saved.ssEnabled);
  const [ssMonthly, setSSMonthly] = useState(saved.ssMonthly);
  const [ssStartAge, setSSStartAge] = useState(saved.ssStartAge);
  const [pensionEnabled, setPensionEnabled] = useState(saved.pensionEnabled);
  const [pensionMonthly, setPensionMonthly] = useState(saved.pensionMonthly);
  const [pensionStartAge, setPensionStartAge] = useState(saved.pensionStartAge);

  const [annualIncome, setAnnualIncome] = useState(saved.annualIncome);
  const [employerMatchPct, setEmployerMatchPct] = useState(saved.employerMatchPct);
  const [employerMatchCapPct, setEmployerMatchCapPct] = useState(saved.employerMatchCapPct);
  const [rothConversionEnabled, setRothConversionEnabled] = useState(saved.rothConversionEnabled);
  const [rothConversionBracket, setRothConversionBracket] = useState(saved.rothConversionBracket);

  const [activeTab, setActiveTab] = useState("accounts");
  const [hasError, setHasError] = useState(false);
  const [mcResult, setMcResult] = useState(null);
  const [mcRunning, setMcRunning] = useState(false);

  const currentAge        = clamp(CURRENT_YEAR - birthYear, 18, 99);
  const safeCurrentAge    = currentAge;
  const safeRetirementAge = clamp(retirementAge, safeCurrentAge + 1, 100);
  const safeLifeExpectancy = clamp(lifeExpectancy, safeRetirementAge + 1, 110);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        retirementAge, lifeExpectancy, annualSpending, withdrawalMode, withdrawalRate,
        inflationRate, birthYear, accounts,
        ssEnabled, ssMonthly, ssStartAge, pensionEnabled, pensionMonthly, pensionStartAge,
        annualIncome, employerMatchPct, employerMatchCapPct,
        rothConversionEnabled, rothConversionBracket,
      }));
    } catch { /* storage unavailable */ }
  }, [retirementAge, lifeExpectancy, annualSpending, withdrawalMode, withdrawalRate,
      inflationRate, birthYear, accounts,
      ssEnabled, ssMonthly, ssStartAge, pensionEnabled, pensionMonthly, pensionStartAge,
      annualIncome, employerMatchPct, employerMatchCapPct,
      rothConversionEnabled, rothConversionBracket]);

  const resetAll = useCallback(() => {
    setRetirementAge(DEFAULTS.retirementAge); setLifeExpectancy(DEFAULTS.lifeExpectancy);
    setAnnualSpending(DEFAULTS.annualSpending); setWithdrawalMode(DEFAULTS.withdrawalMode);
    setWithdrawalRate(DEFAULTS.withdrawalRate); setInflationRate(DEFAULTS.inflationRate);
    setBirthYear(DEFAULTS.birthYear); setAccounts(DEFAULTS.accounts);
    setSSEnabled(DEFAULTS.ssEnabled); setSSMonthly(DEFAULTS.ssMonthly);
    setSSStartAge(DEFAULTS.ssStartAge); setPensionEnabled(DEFAULTS.pensionEnabled);
    setPensionMonthly(DEFAULTS.pensionMonthly); setPensionStartAge(DEFAULTS.pensionStartAge);
    setAnnualIncome(DEFAULTS.annualIncome); setEmployerMatchPct(DEFAULTS.employerMatchPct);
    setEmployerMatchCapPct(DEFAULTS.employerMatchCapPct);
    setRothConversionEnabled(DEFAULTS.rothConversionEnabled);
    setRothConversionBracket(DEFAULTS.rothConversionBracket);
    setHasError(false); setMcResult(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  const baseProjectionParams = useMemo(() => ({
    accounts, currentAge: safeCurrentAge, retirementAge: safeRetirementAge,
    lifeExpectancy: safeLifeExpectancy, annualSpending, withdrawalMode, withdrawalRate,
    inflationRate, ssEnabled, ssMonthly, ssStartAge, pensionEnabled, pensionMonthly, pensionStartAge, birthYear,
    annualIncome, employerMatchPct, employerMatchCapPct,
    rothConversionBracket,
  }), [accounts, safeCurrentAge, safeRetirementAge, safeLifeExpectancy, annualSpending, withdrawalMode, withdrawalRate, inflationRate, ssEnabled, ssMonthly, ssStartAge, pensionEnabled, pensionMonthly, pensionStartAge, birthYear, annualIncome, employerMatchPct, employerMatchCapPct, rothConversionBracket]);

  const projection = useMemo(() => {
    try {
      return runProjection({ ...baseProjectionParams, rothConversionEnabled });
    } catch { setHasError(true); return []; }
  }, [baseProjectionParams, rothConversionEnabled]);

  const projectionNoConv = useMemo(() => {
    try {
      return runProjection({ ...baseProjectionParams, rothConversionEnabled: false });
    } catch { return []; }
  }, [baseProjectionParams]);

  const handleRunMC = useCallback(() => {
    setMcRunning(true);
    setTimeout(() => {
      try {
        const retD = projection.find(d => d.age === safeRetirementAge) || {};
        const retirementBalance = {
          trad401k:  retD.trad401k  || 0,
          roth401k:  retD.roth401k  || 0,
          rothIRA:   retD.rothIRA   || 0,
          brokerage: retD.brokerage || 0,
        };
        const result = runMonteCarlo({
          accounts, retirementBalance, retirementAge: safeRetirementAge, lifeExpectancy: safeLifeExpectancy,
          annualSpending, withdrawalMode, withdrawalRate, inflationRate,
          ssEnabled, ssMonthly, ssStartAge, pensionEnabled, pensionMonthly, pensionStartAge,
        });
        setMcResult(result);
      } catch { /* silent */ }
      setMcRunning(false);
    }, 30);
  }, [projection, accounts, safeRetirementAge, safeLifeExpectancy, annualSpending, withdrawalMode, withdrawalRate, inflationRate, ssEnabled, ssMonthly, ssStartAge, pensionEnabled, pensionMonthly, pensionStartAge]);

  // Employer match preview
  const employeeMonthlyTotal = safeNum(accounts.trad401k.monthly) + safeNum(accounts.roth401k.monthly);
  const matchAnnual = computeEmployerMatch({
    income: annualIncome,
    matchPct: employerMatchPct,
    capPct: employerMatchCapPct,
    employeeMonthly: employeeMonthlyTotal,
  });
  const empPctOfSalary = annualIncome > 0 ? (employeeMonthlyTotal * 12 / annualIncome) * 100 : 0;
  const matchCapped = annualIncome > 0 && empPctOfSalary < employerMatchCapPct && employerMatchPct > 0;
  const fullMatchAnnual = annualIncome * (employerMatchPct / 100) * (employerMatchCapPct / 100);
  const missedMatch = matchCapped ? Math.max(0, fullMatchAnnual - matchAnnual) : 0;

  if (hasError) return <ErrorFallback onReset={resetAll} />;

  const retD         = projection.find(d => d.age === safeRetirementAge) || {};
  const endD         = projection[projection.length - 1] || {};
  const peakD        = projection.reduce((mx, d) => (d.Total > (mx?.Total || 0) ? d : mx), projection[0]) || {};
  const totalContrib = ACCT_KEYS.reduce((s, k) => s + safeNum(accounts[k].monthly), 0);
  const willRunOut   = endD.Total <= 0;
  const withdrawalData = projection.filter(d => d.age >= safeRetirementAge);

  const tabs = [
    { id: "accounts",  label: "Accounts" },
    { id: "income",    label: "Income" },
    { id: "strategy",  label: "Withdrawal Strategy" },
    { id: "conversion", label: "Roth Conversion" },
    { id: "montecarlo", label: "Monte Carlo" },
    { id: "settings",  label: "Settings" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="max-w-6xl mx-auto px-4 py-6">

        <header className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Retirement Planner</h1>
            <p className="text-sm text-gray-500 mt-1">Model your path to retirement with optimized withdrawal strategies</p>
          </div>
          <button onClick={resetAll}
            className="text-sm text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-300 px-3 py-1.5 rounded-lg transition-colors mt-1 whitespace-nowrap"
            aria-label="Reset all inputs to defaults">
            Reset All
          </button>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6" role="region" aria-label="Portfolio summary">
          <StatBox label="At Retirement"      value={fmt$(retD.Total || 0)}   sub={`Age ${safeRetirementAge}`} color="#2563eb" />
          <StatBox label="Peak Portfolio"     value={fmt$(peakD?.Total || 0)} sub={`Age ${peakD?.age}`}       color="#16a34a" />
          <StatBox label={`At Age ${safeLifeExpectancy}`} value={fmt$(endD.Total || 0)} color={willRunOut ? "#dc2626" : "#7c3aed"} />
          <StatBox label="Monthly Contributions" value={fmtFull(totalContrib)} sub={`${fmtFull(totalContrib * 12)}/yr`} color="#0891b2" />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-4" role="img" aria-label="Portfolio projection chart">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Portfolio Projection</h2>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={projection} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <defs>
                <linearGradient id="gTrad401k" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} /><stop offset="95%" stopColor="#2563eb" stopOpacity={0} /></linearGradient>
                <linearGradient id="gRoth401k" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0d9488" stopOpacity={0.3} /><stop offset="95%" stopColor="#0d9488" stopOpacity={0} /></linearGradient>
                <linearGradient id="gRothIRA"  x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} /><stop offset="95%" stopColor="#16a34a" stopOpacity={0} /></linearGradient>
                <linearGradient id="gBrok"     x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#9333ea" stopOpacity={0.3} /><stop offset="95%" stopColor="#9333ea" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="age" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tickFormatter={fmt$} tick={{ fontSize: 11 }} stroke="#94a3b8" width={55} />
              <Tooltip content={<PortfolioTooltip />} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <ReferenceLine x={safeRetirementAge} stroke="#ef4444" strokeDasharray="6 3" label={{ value: "Retire", position: "top", fontSize: 11, fill: "#ef4444" }} />
              <Area type="monotone" dataKey="trad401k" name="Traditional 401(k)" stackId="1" stroke="#2563eb" fill="url(#gTrad401k)" strokeWidth={2} />
              <Area type="monotone" dataKey="roth401k" name="Roth 401(k)"        stackId="1" stroke="#0d9488" fill="url(#gRoth401k)" strokeWidth={2} />
              <Area type="monotone" dataKey="rothIRA"  name="Roth IRA"           stackId="1" stroke="#16a34a" fill="url(#gRothIRA)"  strokeWidth={2} />
              <Area type="monotone" dataKey="brokerage" name="Brokerage"          stackId="1" stroke="#9333ea" fill="url(#gBrok)"     strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
          {willRunOut && (
            <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700" role="alert">
              Your portfolio may be depleted before age {safeLifeExpectancy}. Consider increasing contributions or reducing spending.
            </div>
          )}
        </div>

        {withdrawalData.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6" role="img" aria-label="Annual withdrawals by source">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Annual Withdrawals by Source</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={withdrawalData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="age" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tickFormatter={fmt$} tick={{ fontSize: 11 }} stroke="#94a3b8" width={55} />
                <Tooltip content={<WithdrawalTooltip />} />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Bar dataKey="wBrokerage" name="Brokerage"          stackId="w" fill="#9333ea" />
                <Bar dataKey="wTrad401k"  name="Traditional 401(k)" stackId="w" fill="#2563eb" />
                <Bar dataKey="wRothIRA"   name="Roth IRA"           stackId="w" fill="#16a34a" />
                <Bar dataKey="wRoth401k"  name="Roth 401(k)"        stackId="w" fill="#0d9488" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <nav className="flex gap-1 bg-white rounded-xl border border-gray-200 p-1 mb-6 shadow-sm overflow-x-auto" role="tablist" aria-label="Planner sections">
          {tabs.map(tab => (
            <button key={tab.id} role="tab" aria-selected={activeTab === tab.id} aria-controls={`panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 text-sm py-2 px-3 rounded-lg font-medium transition-all whitespace-nowrap ${activeTab === tab.id ? "bg-blue-500 text-white shadow" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`}>
              {tab.label}
            </button>
          ))}
        </nav>

        <div id={`panel-${activeTab}`} role="tabpanel" aria-label={tabs.find(t => t.id === activeTab)?.label}>

          {activeTab === "accounts" && (
            <div>
              <div className="flex justify-end mb-3">
                <ClearButton label="Clear All Accounts" onClick={() => setAccounts({ trad401k: { ...CLEAR_ACCOUNT }, roth401k: { ...CLEAR_ACCOUNT }, rothIRA: { ...CLEAR_ACCOUNT }, brokerage: { ...CLEAR_ACCOUNT } })} />
              </div>

              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">401(k) Accounts</h3>
              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <AccountCard title="Traditional 401(k)" subtitle="Pre-tax contributions; taxed at withdrawal" icon="T" color="#2563eb"
                  account={accounts.trad401k} onChange={a => setAccounts({ ...accounts, trad401k: a })} />
                <AccountCard title="Roth 401(k)" subtitle="Post-tax contributions; tax-free at withdrawal" icon="R" color="#0d9488"
                  account={accounts.roth401k} onChange={a => setAccounts({ ...accounts, roth401k: a })} />
              </div>

              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Other Accounts</h3>
              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <AccountCard title="Roth IRA" icon="I" color="#16a34a"
                  account={accounts.rothIRA}   onChange={a => setAccounts({ ...accounts, rothIRA: a })} />
                <AccountCard title="Brokerage" icon="B" color="#9333ea"
                  account={accounts.brokerage} onChange={a => setAccounts({ ...accounts, brokerage: a })} />
              </div>

              {/* Employer Match */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold bg-amber-500" aria-hidden="true">$</div>
                  <div>
                    <h3 className="font-semibold text-gray-800">Employer Match</h3>
                    <p className="text-xs text-gray-400">Match dollars flow into Traditional 401(k) monthly until retirement</p>
                  </div>
                </div>
                <div className="grid md:grid-cols-3 gap-3">
                  <NumberInput label="Annual Income" value={annualIncome} onChange={setAnnualIncome} max={INPUT_LIMITS.income.max} step={1000} ariaLabel="Annual income" />
                  <NumberInput label="Employer Match %" value={employerMatchPct} onChange={setEmployerMatchPct} prefix="" suffix="%" min={0} max={INPUT_LIMITS.matchPct.max} step={5} ariaLabel="Employer match percentage" />
                  <NumberInput label="Match Cap (% of salary)" value={employerMatchCapPct} onChange={setEmployerMatchCapPct} prefix="" suffix="%" min={0} max={INPUT_LIMITS.matchCapPct.max} step={0.5} ariaLabel="Match cap as percent of salary" />
                </div>
                {annualIncome > 0 && (
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                    <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                      <p className="text-gray-500">Your contribution</p>
                      <p className="font-semibold text-gray-800">{empPctOfSalary.toFixed(1)}% of salary</p>
                      <p className="text-gray-400">{fmtFull(employeeMonthlyTotal * 12)}/yr</p>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-2.5 border border-amber-100">
                      <p className="text-amber-700">Employer adds</p>
                      <p className="font-semibold text-amber-800">{fmtFull(matchAnnual / 12)}/mo</p>
                      <p className="text-amber-600">{fmtFull(matchAnnual)}/yr → Trad 401(k)</p>
                    </div>
                    {missedMatch > 0 && (
                      <div className="bg-red-50 rounded-lg p-2.5 border border-red-100 col-span-2 md:col-span-1">
                        <p className="text-red-700">Missing free money</p>
                        <p className="font-semibold text-red-800">{fmtFull(missedMatch)}/yr</p>
                        <p className="text-red-600">Increase to {employerMatchCapPct}% of salary to capture full match</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "income" && (
            <div>
              <div className="flex justify-end mb-3">
                <ClearButton label="Clear Income Sources" onClick={() => { setSSEnabled(false); setSSMonthly(0); setPensionEnabled(false); setPensionMonthly(0); }} />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <IncomeCard title="Social Security" icon="SS" color="#0891b2" enabled={ssEnabled} onToggle={() => setSSEnabled(!ssEnabled)}>
                  <NumberInput label="Estimated Monthly Benefit" value={ssMonthly} onChange={setSSMonthly} max={INPUT_LIMITS.ssMonthly.max} ariaLabel="Social Security monthly benefit" />
                  <NumberInput label="Start Age" value={ssStartAge} onChange={setSSStartAge} prefix="" min={62} max={70} ariaLabel="Social Security start age" />
                  <div className="bg-cyan-50 border border-cyan-100 rounded-lg p-2.5 text-xs text-cyan-700">
                    <p className="font-medium mb-1">Claiming age impact:</p>
                    <p>Age 62: ~30% reduction · Age 67 (FRA): 100% · Age 70: ~124% of FRA benefit</p>
                    <p className="mt-1 text-cyan-600">Each year you delay past 62 increases your benefit by ~6-8%</p>
                  </div>
                </IncomeCard>
                <IncomeCard title="Pension" icon="P" color="#d97706" enabled={pensionEnabled} onToggle={() => setPensionEnabled(!pensionEnabled)}>
                  <NumberInput label="Monthly Pension Amount" value={pensionMonthly} onChange={setPensionMonthly} max={INPUT_LIMITS.pensionMonthly.max} ariaLabel="Monthly pension amount" />
                  <NumberInput label="Start Age" value={pensionStartAge} onChange={setPensionStartAge} prefix="" min={50} max={75} ariaLabel="Pension start age" />
                  <p className="text-xs text-gray-400">Pension modeled as a fixed monthly payment (not inflation-adjusted).</p>
                </IncomeCard>
              </div>
            </div>
          )}

          {activeTab === "strategy" && (
            <div className="grid md:grid-cols-2 gap-4">
              <WithdrawalStrategyPanel projection={projection} retirementAge={safeRetirementAge} birthYear={birthYear} />
              <MilestoneTimeline currentAge={safeCurrentAge} retirementAge={safeRetirementAge} birthYear={birthYear} />
            </div>
          )}

          {activeTab === "conversion" && (
            <RothConversionPanel
              enabled={rothConversionEnabled}
              onToggleEnabled={() => setRothConversionEnabled(!rothConversionEnabled)}
              bracket={rothConversionBracket}
              onChangeBracket={setRothConversionBracket}
              projection={projection}
              projectionNoConv={projectionNoConv}
              retirementAge={safeRetirementAge}
              birthYear={birthYear}
            />
          )}

          {activeTab === "montecarlo" && (
            <MonteCarloPanel mcResult={mcResult} onRun={handleRunMC} running={mcRunning} />
          )}

          {activeTab === "settings" && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm max-w-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-800">General Settings</h3>
                <ClearButton label="Reset to Defaults" onClick={resetAll} />
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Birth Year</label>
                  <div className="flex gap-3 items-end">
                    <div className="flex-1">
                      <NumberInput value={birthYear} onChange={setBirthYear} prefix="" min={INPUT_LIMITS.birthYear.min} max={INPUT_LIMITS.birthYear.max} ariaLabel="Birth year" />
                    </div>
                    <div className="pb-0.5 text-sm">
                      <span className="text-xs text-gray-400">Current age: </span>
                      <span className="font-semibold text-gray-700">{safeCurrentAge}</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <NumberInput label="Retirement Age"  value={retirementAge}  onChange={setRetirementAge}  prefix="" min={safeCurrentAge + 1} max={100} small ariaLabel="Retirement age" />
                  <NumberInput label="Life Expectancy" value={lifeExpectancy} onChange={setLifeExpectancy} prefix="" min={safeRetirementAge + 1} max={110} small ariaLabel="Life expectancy" />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-2">Withdrawal Method</label>
                  <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
                    <button onClick={() => setWithdrawalMode("fixed")}
                      className={`flex-1 py-2 text-center transition-colors ${withdrawalMode === "fixed" ? "bg-blue-500 text-white font-medium" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                      Fixed Amount
                    </button>
                    <button onClick={() => setWithdrawalMode("rate")}
                      className={`flex-1 py-2 text-center transition-colors ${withdrawalMode === "rate" ? "bg-blue-500 text-white font-medium" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                      % of Portfolio
                    </button>
                  </div>
                </div>

                {withdrawalMode === "fixed" ? (
                  <NumberInput label="Annual Spending in Retirement" value={annualSpending} onChange={setAnnualSpending} step={1000} max={INPUT_LIMITS.spending.max} ariaLabel="Annual spending in retirement" />
                ) : (
                  <div>
                    <NumberInput label="Annual Withdrawal Rate" value={withdrawalRate} onChange={setWithdrawalRate} prefix="" suffix="%" min={INPUT_LIMITS.withdrawalRate.min} max={INPUT_LIMITS.withdrawalRate.max} step={0.1} ariaLabel="Annual withdrawal rate" />
                    <p className="mt-1.5 text-xs text-gray-400">Classic "4% rule" = withdraw 4% of your portfolio value each year. Adjusts automatically as portfolio grows or shrinks.</p>
                    <div className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                      Est. year-1 withdrawal: <span className="font-medium text-gray-700">{fmtFull((retD.Total || 0) * withdrawalRate / 100)}</span>
                    </div>
                  </div>
                )}

                <NumberInput label="Inflation Rate" value={inflationRate} onChange={setInflationRate} prefix="" suffix="%" min={0} max={INPUT_LIMITS.inflation.max} step={0.5} ariaLabel="Inflation rate" />

                {safeRetirementAge < 59.5 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700" role="note">
                    <p className="font-medium">Early Retirement Detected (before 59½)</p>
                    <p className="mt-1">{safeRetirementAge >= 55
                      ? "Rule of 55 applies: penalty-free 401(k) withdrawals from your employer plan. Brokerage and Roth contributions are also accessible."
                      : "Before age 55, penalty-free options are limited to brokerage accounts and Roth IRA contributions. Consider 72(t) SEPP for additional IRA access."}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 bg-white rounded-xl border border-gray-200 p-5 shadow-sm" role="region" aria-label="Retirement summary">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Retirement Summary (age {safeRetirementAge})</h3>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
            {[
              ["Trad 401(k)", fmtFull(retD.trad401k || 0),  "bg-blue-50",   "text-blue-700"],
              ["Roth 401(k)", fmtFull(retD.roth401k || 0),  "bg-teal-50",   "text-teal-700"],
              ["Roth IRA",    fmtFull(retD.rothIRA  || 0),  "bg-green-50",  "text-green-700"],
              ["Brokerage",   fmtFull(retD.brokerage || 0), "bg-purple-50", "text-purple-700"],
              ["Income/mo",   fmtFull(((retD.ssIncome || 0) + (retD.pensionIncome || 0)) / 12), "bg-cyan-50", "text-cyan-700"],
              ["Total",       fmtFull(retD.Total || 0),      "bg-gray-50",   "text-gray-800"],
            ].map(([lbl, val, bg, fg]) => (
              <div key={lbl} className={`${bg} rounded-lg p-3`}>
                <p className="text-gray-500 text-xs">{lbl}</p>
                <p className={`font-bold ${fg}`}>{val}</p>
              </div>
            ))}
          </div>
        </div>

        <footer className="text-center text-xs text-gray-400 mt-6 mb-4">
          <p>Simplified projection tool. Federal tax estimates use 2025 single-filer brackets, inflated annually. Monte Carlo uses normal return distribution. Consult a financial advisor for personalised advice.</p>
          <p className="mt-1">All calculations run client-side. No financial data is sent to any server.</p>
        </footer>
      </div>
    </div>
  );
}
