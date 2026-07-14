import { XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar } from "recharts";
import { fmt$, fmtFull } from "../format.js";
import { Toggle } from "./ui.jsx";

const AXIS_TICK = { fontSize: 11, fill: "#7C8A85", fontFamily: '"IBM Plex Mono", monospace' };

export default function RothConversionPanel({
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
    <div className="bg-white rounded-lg border border-ink/10 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-ink">Roth Conversion Ladder</h3>
          <p className="text-xs text-haze mt-0.5">Convert Traditional → Roth IRA from retirement until RMDs at age {rmdAge}</p>
        </div>
        <Toggle checked={enabled} onToggle={onToggleEnabled} ariaLabel="Enable Roth conversions" />
      </div>

      {enabled && (
        <>
          <div className="mb-4">
            <label className="block text-xs font-medium text-haze mb-2">Fill up to bracket ceiling</label>
            <div className="flex gap-1.5" role="radiogroup" aria-label="Target bracket">
              {bracketOptions.map(b => (
                <button key={b.value} onClick={() => onChangeBracket(b.value)}
                  role="radio" aria-checked={bracket === b.value}
                  className={`flex-1 text-xs px-2.5 py-2 rounded-md border transition-all ${bracket === b.value ? "bg-evergreen-light border-evergreen/40 text-evergreen-dark font-medium" : "border-ink/15 text-haze hover:border-ink/30"}`}>
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-paper rounded-md p-3 border border-ink/5">
              <p className="text-xs text-haze">Total Converted</p>
              <p className="text-lg font-bold text-ink font-mono tnum">{fmtFull(totalConverted)}</p>
            </div>
            <div className="bg-paper rounded-md p-3 border border-ink/5">
              <p className="text-xs text-haze">Total Conv. Tax</p>
              <p className="text-lg font-bold text-ink font-mono tnum">{fmtFull(totalConvTax)}</p>
            </div>
            <div className="bg-evergreen-light rounded-md p-3 border border-evergreen/20">
              <p className="text-xs text-evergreen-dark">RMD Bal. Reduction</p>
              <p className="text-lg font-bold text-evergreen-dark font-mono tnum">{fmtFull(rmdReduction)}</p>
            </div>
          </div>

          {window.length > 0 && (
            <>
              <h4 className="text-xs font-semibold text-ink/70 mb-2">Conversions by Year</h4>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={window} margin={{ top: 5, right: 15, bottom: 5, left: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1F2D2B14" />
                  <XAxis dataKey="age" tick={AXIS_TICK} stroke="#7C8A85" tickLine={false} />
                  <YAxis tickFormatter={fmt$} tick={AXIS_TICK} stroke="#7C8A85" width={55} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v) => fmtFull(v)} />
                  <Bar isAnimationActive={false} dataKey="conversion"    name="Conversion" fill="#2E6E5E" />
                  <Bar isAnimationActive={false} dataKey="conversionTax" name="Tax"        fill="#B3402F" />
                </BarChart>
              </ResponsiveContainer>
              <div className="max-h-56 overflow-y-auto mt-3 border border-ink/10 rounded-md">
                <table className="w-full text-xs">
                  <thead className="bg-paper text-haze sticky top-0">
                    <tr><th className="text-left px-3 py-1.5">Age</th><th className="text-right px-3 py-1.5">Convert</th><th className="text-right px-3 py-1.5">Tax</th><th className="text-right px-3 py-1.5">Tax From</th><th className="text-right px-3 py-1.5">Accessible By</th></tr>
                  </thead>
                  <tbody className="font-mono tnum">
                    {window.map(d => (
                      <tr key={d.age} className="border-t border-ink/5">
                        <td className="px-3 py-1.5">{d.age}</td>
                        <td className="px-3 py-1.5 text-right">{fmtFull(d.conversion)}</td>
                        <td className="px-3 py-1.5 text-right">{fmtFull(d.conversionTax)}</td>
                        <td className="px-3 py-1.5 text-right text-haze font-sans">
                          {d.conversionTax === 0 ? "—" :
                           d.conversionTaxFromBrokerage >= d.conversionTax ? "Brokerage" :
                           d.conversionTaxFromBrokerage > 0 ? "Mixed" : "Netted"}
                        </td>
                        <td className="px-3 py-1.5 text-right font-sans">
                          {d.conversion > 0
                            ? d.age < 59.5
                              ? <span className="text-amber2">Age {d.age + 5} (5-yr rule)</span>
                              : <span className="text-evergreen-dark">Immediately</span>
                            : <span className="text-haze/60">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-haze italic">Conversions done before age 59½ are accessible penalty-free only after 5 years. Plan your ladder accordingly.</p>
            </>
          )}
        </>
      )}

      <details className="mt-4 group">
        <summary className="cursor-pointer text-xs font-semibold text-evergreen-dark hover:text-evergreen select-none">
          📖 How Roth conversions work — best practices
        </summary>
        <div className="mt-3 space-y-3 text-xs text-ink/70 leading-relaxed">
          <div>
            <p className="font-semibold text-ink">When to convert (the sweet spot)</p>
            <p>The window between retirement and RMDs is usually the lowest-income period of your life — wages stop, Social Security is often delayed, and no RMDs yet. Your marginal tax rate is at its lowest, which makes converting cheapest. Convert <em>early</em> in the window so the converted dollars compound tax-free for longer, and spread amounts evenly to avoid pushing yourself into a higher bracket.</p>
          </div>
          <div>
            <p className="font-semibold text-ink">How much to convert</p>
            <p>The classic rule is "fill to the top of your current bracket" — convert just enough to reach the next bracket's threshold without crossing it. The 12% bracket is the no-brainer ceiling for most retirees. Going up to 22% or 24% can still pay off if your eventual RMDs would push you into 24%+ anyway. Compare your <em>current</em> marginal rate to your <em>projected RMD-era</em> rate; convert only when current ≤ projected.</p>
          </div>
          <div>
            <p className="font-semibold text-ink">Watch out for cliffs (not modeled here)</p>
            <ul className="list-disc ml-5 mt-1 space-y-1">
              <li><strong>IRMAA</strong> (age 65+): Medicare Part B/D premiums jump at MAGI thresholds (~$106K single / $212K MFJ in 2025). Conversions count toward MAGI with a 2-year lookback.</li>
              <li><strong>ACA premium tax credits</strong> (under 65): conversions can disqualify you from Marketplace subsidies.</li>
              <li><strong>NIIT</strong> (3.8%): kicks in at MAGI &gt; $200K single / $250K MFJ.</li>
              <li><strong>Social Security taxation</strong>: conversions can push more of your SS into the 85%-taxable tier.</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-ink">Pay the tax from outside the IRA</p>
            <p>Pay conversion tax from a taxable brokerage account, not from the conversion itself. Withholding tax from the conversion shrinks the amount that grows tax-free forever (and under 59½ the withheld portion is treated as a distribution, with a 10% penalty). This calculator pulls tax from brokerage first, falling back to netting only if brokerage runs out.</p>
          </div>
          <div>
            <p className="font-semibold text-ink">State tax &amp; relocation</p>
            <p>Conversions are state-taxable in most states. If you're moving from a high-tax state (CA, NY) to a no-tax state (FL, TX, NV), convert <em>after</em> the move.</p>
          </div>
          <div>
            <p className="font-semibold text-ink">Heirs and the SECURE Act</p>
            <p>Inherited Traditional IRAs must be drained within 10 years by non-spouse heirs — at the heir's (often peak-earning) tax rate. Inherited Roths follow the same 10-year rule but are tax-free. If you're leaving money to high-earning kids, conversions transfer the tax bill from them (24–37%) to you (12–24%).</p>
          </div>
          <div>
            <p className="font-semibold text-ink">Widow's-tax trap</p>
            <p>A surviving spouse files single — same income, narrower brackets. Converting while still married-filing-jointly shields against this.</p>
          </div>
          <div>
            <p className="font-semibold text-ink">Two 5-year rules (often confused)</p>
            <ul className="list-disc ml-5 mt-1 space-y-1">
              <li><em>Per-conversion rule</em>: each conversion has its own clock for the 10% early-withdrawal penalty on principal. Irrelevant once you're 59½+.</li>
              <li><em>Account rule</em>: Roth IRA earnings are tax-free only after the <em>account</em> has been open 5 years. Open one with $1 today even if you don't plan to use it soon.</li>
            </ul>
          </div>
          <p className="text-haze italic">This calculator models federal income tax only, with brackets inflating at your inflation rate. Actual brackets and laws change — consult a CPA or fee-only fiduciary advisor before executing a multi-year conversion strategy.</p>
        </div>
      </details>
    </div>
  );
}
