import { useState } from "react";
import { ACCT_COLORS, ACCT_LABELS, MILESTONE_AGES, safeNum } from "../engine.js";
import { fmtFull } from "../format.js";

// ─── Withdrawal Strategy Panel ────────────────────────────────────────────────
export function WithdrawalStrategyPanel({ projection, retirementAge, birthYear }) {
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
    <div className="bg-white rounded-lg border border-ink/10 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-ink">Withdrawal Strategy</h3>
        <div className="flex items-center gap-2">
          <label htmlFor="age-sel" className="text-xs text-haze">Age:</label>
          <select id="age-sel" value={selectedAge} onChange={e => setSelectedAge(Number(e.target.value))}
            className="text-sm border border-ink/15 rounded-md px-2 py-1 font-mono tnum focus:ring-2 focus:ring-evergreen outline-none bg-white">
            {retiredData.map(d => <option key={d.age} value={d.age}>{d.age}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-1 mb-4" role="tablist" aria-label="Retirement phases">
        {phases.filter(p => p.show).map(p => (
          <div key={p.id} role="tab" aria-selected={p.active}
            className={`flex-1 text-center py-1.5 rounded-md text-xs font-medium ${p.active ? "bg-evergreen text-white" : "bg-paper text-haze"}`}>
            {p.label}
          </div>
        ))}
      </div>
      {/* Early Roth IRA penalty risk warning */}
      {retirementAge < 59.5 && (() => {
        const riskYears = projection.filter(d => d.rothIRAEarlyPenaltyRisk);
        if (!riskYears.length) return null;
        const totalRisk = riskYears.reduce((s, d) => s + (d.rothIRAPenaltyRiskAmt || 0), 0);
        return (
          <div className="mb-4 bg-danger-light border border-danger/20 rounded-md p-3" role="alert">
            <p className="text-xs font-semibold text-danger mb-1">⚠ Early Roth IRA withdrawal risk detected</p>
            <p className="text-xs text-danger mb-2">
              In ages {riskYears.map(d => d.age).join(", ")}, projected spending requires withdrawing beyond your penalty-free Roth IRA pool (contributions + conversions ≥5 years old).
              ~{fmtFull(totalRisk)} total may incur a 10% early withdrawal penalty.
            </p>
            <table className="w-full text-xs">
              <thead><tr className="text-danger/70"><th className="text-left font-medium">Age</th><th className="text-right font-medium">Penalty-free pool</th><th className="text-right font-medium">At-risk</th></tr></thead>
              <tbody>
                {riskYears.map(d => (
                  <tr key={d.age} className="text-danger font-mono tnum">
                    <td>{d.age}</td>
                    <td className="text-right">{fmtFull((d.rothIRAContribBasis || 0) + (d.rothIRAConvMature || 0))}</td>
                    <td className="text-right font-semibold">{fmtFull(d.rothIRAPenaltyRiskAmt || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-danger/80 mt-2">Options: increase brokerage savings, reduce spending, or start your Roth conversion ladder earlier (convert ≥5 years before you need the money).</p>
          </div>
        );
      })()}
      {strategy && (
        <>
          <p className="text-xs font-medium text-evergreen-dark mb-2">{strategy.phase}</p>
          {strategy.note && <p className="text-xs text-amber2 bg-amber2-light border border-amber2/15 rounded-md px-3 py-2 mb-3">{strategy.note}</p>}
          <div className="space-y-2" role="list">
            {strategy.order.map(({ key, reason }, i) => {
              const withdrawn = selected?.[wKeyMap[key]] ?? 0;
              const penalty   = key === "trad401k" && selectedAge < 59.5 && !(retirementAge >= 55 && retirementAge < 59.5);
              return (
                <div key={key} role="listitem" className={`border rounded-md p-3 ${i === 0 ? "border-evergreen/30 bg-evergreen-light/60" : "border-ink/10"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white font-mono" style={{ backgroundColor: ACCT_COLORS[key] }} aria-hidden="true">{i + 1}</span>
                      <span className="text-sm font-medium text-ink">{ACCT_LABELS[key]}</span>
                      {penalty && <span className="text-xs bg-danger-light text-danger px-1.5 py-0.5 rounded font-medium">10% Penalty</span>}
                      {i === 0 && <span className="text-xs bg-evergreen text-white px-1.5 py-0.5 rounded font-medium">Primary</span>}
                    </div>
                    {withdrawn > 0 && <span className="text-sm font-medium text-ink font-mono tnum">{fmtFull(withdrawn)}</span>}
                  </div>
                  <p className="text-xs text-haze ml-7">{reason}</p>
                </div>
              );
            })}
          </div>
          {(selected?.estTax > 0 || selected?.rmdRequired > 0 || selected?.capGains > 0) && (
            <div className="mt-3 bg-paper border border-ink/5 rounded-md p-3 space-y-1">
              {selected?.rmdRequired > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-danger">Required Minimum Distribution</span>
                  <span className="font-medium text-danger font-mono tnum">{fmtFull(selected.rmdRequired)}</span>
                </div>
              )}
              {selected?.rmdExcess > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-haze">RMD above spending → reinvested in brokerage</span>
                  <span className="font-medium font-mono tnum">{fmtFull(selected.rmdExcess)}</span>
                </div>
              )}
              {selected?.capGains > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-haze">Realized capital gains{selected?.ltcgTax > 0 ? ` (tax ${fmtFull(selected.ltcgTax)})` : " (0% bracket)"}</span>
                  <span className="font-medium font-mono tnum">{fmtFull(selected.capGains)}</span>
                </div>
              )}
              {selected?.estTax > 0 && (
                <div className="flex justify-between text-xs"><span className="text-haze">Est. Federal Tax (incl. cap gains)</span><span className="font-medium font-mono tnum">{fmtFull(selected.estTax)}</span></div>
              )}
              <div className="flex justify-between text-xs"><span className="text-haze">Marginal Rate</span><span className="font-medium font-mono tnum">{(safeNum(selected.marginalRate) * 100).toFixed(0)}%</span></div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Milestone Timeline ───────────────────────────────────────────────────────
export function MilestoneTimeline({ currentAge, retirementAge, birthYear }) {
  const rmdAge = birthYear <= 1959 ? 73 : 75;
  const milestones = MILESTONE_AGES.filter(m => {
    if (m.age === 73 && rmdAge !== 73) return false;
    if (m.age === 75 && rmdAge !== 75) return false;
    return m.age > currentAge;
  });
  return (
    <div className="bg-white rounded-lg border border-ink/10 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-ink mb-4">Key Age Milestones</h3>
      <div className="relative" role="list">
        <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-ink/10" aria-hidden="true" />
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
                    <span className="text-sm font-semibold font-mono tnum" style={{ color: m.color }}>Age {m.age}</span>
                    <span className="text-xs font-medium text-ink">{m.label}</span>
                    {isRetire && <span className="text-xs bg-copper-light text-copper px-1.5 py-0.5 rounded">Relevant</span>}
                  </div>
                  <p className="text-xs text-haze mt-0.5">{m.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
