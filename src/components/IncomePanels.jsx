import { useMemo, useId } from "react";
import { runProjection, ssClaimFactor, ssBreakEvenAge, safeNum } from "../engine.js";
import { fmt$, fmtFull } from "../format.js";
import { Toggle, NumberInput } from "./ui.jsx";

// ─── IncomeCard ───────────────────────────────────────────────────────────────
export function IncomeCard({ title, icon, enabled, onToggle, children, color }) {
  const sid = useId();
  return (
    <div className={`bg-white rounded-lg border p-5 shadow-sm transition-all ${enabled ? "border-ink/10 hover:shadow-md" : "border-ink/5 opacity-60"}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md flex items-center justify-center text-white text-sm font-bold font-display" style={{ backgroundColor: enabled ? color : "#7C8A85" }} aria-hidden="true">{icon}</div>
          <h3 id={sid} className="font-semibold text-ink">{title}</h3>
        </div>
        <Toggle checked={enabled} onToggle={onToggle} ariaLabelledBy={sid} />
      </div>
      {enabled && <div className="space-y-3">{children}</div>}
    </div>
  );
}

// ─── Social Security Claiming Optimizer ──────────────────────────────────────
export function SSOptimizerPanel({ baseProjectionParams, rothConversionEnabled, ssMonthly, ssStartAge, lifeExpectancy }) {
  const results = useMemo(() => {
    // Back out the FRA benefit from the user's entered benefit + start age,
    // then scale it to each candidate claiming age.
    const fraMonthly = safeNum(ssMonthly) / ssClaimFactor(ssStartAge);
    return [62, 67, 70].map(claimAge => {
      const monthly = fraMonthly * ssClaimFactor(claimAge);
      let endTotal = 0, cumSS = 0;
      try {
        const proj = runProjection({
          ...baseProjectionParams, rothConversionEnabled,
          ssEnabled: true, ssMonthly: monthly, ssStartAge: claimAge,
        });
        endTotal = proj[proj.length - 1]?.Total ?? 0;
        cumSS = proj.reduce((s, d) => s + (d.ssIncome || 0), 0);
      } catch { /* keep zeros */ }
      return { claimAge, monthly, endTotal, cumSS };
    });
  }, [baseProjectionParams, rothConversionEnabled, ssMonthly, ssStartAge]);

  const best = results.reduce((mx, r) => (r.endTotal > mx.endTotal ? r : mx), results[0]);

  return (
    <div className="bg-white rounded-lg border border-ink/10 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-ink">When should you claim Social Security?</h3>
      <p className="text-xs text-haze mt-0.5 mb-4">
        Comparison holds everything else constant and scales your benefit from the amount you entered
        (treated as your age-{ssStartAge} benefit). Portfolio impact measured at age {lifeExpectancy}.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        {results.map(r => {
          const isBest = r.claimAge === best.claimAge;
          return (
            <div key={r.claimAge}
              className={`rounded-md p-3 border ${isBest ? "border-evergreen/40 bg-evergreen-light" : "border-ink/10 bg-paper"}`}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-ink font-mono tnum">Claim at {r.claimAge}</p>
                {isBest && <span className="text-xs bg-evergreen text-white px-1.5 py-0.5 rounded font-medium">Best</span>}
              </div>
              <p className="text-lg font-bold text-ink mt-1 font-mono tnum">{fmtFull(r.monthly)}<span className="text-xs font-normal text-haze">/mo</span></p>
              <div className="mt-2 space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-haze">Lifetime SS</span><span className="font-medium font-mono tnum">{fmt$(r.cumSS)}</span></div>
                <div className="flex justify-between"><span className="text-haze">Portfolio @{lifeExpectancy}</span><span className={`font-medium font-mono tnum ${isBest ? "text-evergreen-dark" : ""}`}>{fmt$(r.endTotal)}</span></div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="bg-dusk-light border border-dusk/20 rounded-md p-3 text-xs text-dusk space-y-1">
        <p><strong>Break-even ages</strong> (cumulative benefits, today's dollars): claiming at 67 overtakes 62 around age {ssBreakEvenAge(62, 67).toFixed(0)}; 70 overtakes 67 around age {ssBreakEvenAge(67, 70).toFixed(0)}.</p>
        <p>Delaying also acts as longevity insurance and raises the survivor benefit for a spouse. Claiming early can still win if you expect a shorter horizon or need to preserve portfolio withdrawals in down markets. Spousal coordination and SS taxation nuances are not modeled.</p>
      </div>
    </div>
  );
}

// ─── Part-Time Work (semi-retirement) ─────────────────────────────────────────
export function PartTimeCard({ partTime, onChange, currentAge, retirementAge, annualSpending, withdrawalMode }) {
  const set = patch => onChange({ ...partTime, ...patch });
  const setContrib = (k, v) => onChange({ ...partTime, contrib: { ...partTime.contrib, [k]: v } });
  const c = partTime.contrib;
  const plannedAnnual = (safeNum(c.trad401k) + safeNum(c.roth401k) + safeNum(c.rothIRA) + safeNum(c.brokerage)) * 12;
  const leftover = safeNum(partTime.income) - safeNum(annualSpending);
  const fundedPct = leftover > 0 && plannedAnnual > 0 ? Math.min(100, (leftover / plannedAnnual) * 100) : 0;
  const noMatchContrib = safeNum(partTime.matchPct) > 0 && safeNum(c.trad401k) + safeNum(c.roth401k) === 0;

  return (
    <IncomeCard title="Part-Time Work" icon="PT" color="#B4642D" enabled={partTime.enabled}
      onToggle={() => set({ enabled: !partTime.enabled })}>
      <div className="grid grid-cols-2 gap-3">
        <NumberInput label="Start Age" value={partTime.startAge} onChange={v => set({ startAge: v })}
          prefix="" min={currentAge + 1} max={Math.max(currentAge + 1, retirementAge - 1)} small ariaLabel="Part-time start age" />
        <NumberInput label="Gross Annual Income" value={partTime.income} onChange={v => set({ income: v })}
          max={5_000_000} step={1000} small ariaLabel="Part-time gross annual income" />
      </div>
      <p className="text-xs text-haze">Income is in today's dollars (inflation-adjusted each year) and taxed as ordinary income. Full-time contributions and match stop at this age.</p>

      <div>
        <p className="text-xs font-medium text-haze mb-1.5">Contributions during part-time years ($/mo, funded from leftover income)</p>
        <div className="grid grid-cols-2 gap-3">
          <NumberInput label="Trad 401(k)" value={c.trad401k} onChange={v => setContrib("trad401k", v)} max={50000} small ariaLabel="Part-time Traditional 401(k) monthly contribution" />
          <NumberInput label="Roth 401(k)" value={c.roth401k} onChange={v => setContrib("roth401k", v)} max={50000} small ariaLabel="Part-time Roth 401(k) monthly contribution" />
          <NumberInput label="Roth IRA" value={c.rothIRA} onChange={v => setContrib("rothIRA", v)} max={50000} small ariaLabel="Part-time Roth IRA monthly contribution" />
          <NumberInput label="Brokerage" value={c.brokerage} onChange={v => setContrib("brokerage", v)} max={50000} small ariaLabel="Part-time brokerage monthly contribution" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <NumberInput label="Employer Match %" value={partTime.matchPct} onChange={v => set({ matchPct: v })}
          prefix="" suffix="%" min={0} max={200} step={5} small ariaLabel="Part-time employer match percentage" />
        <NumberInput label="Match Cap (% of salary)" value={partTime.matchCapPct} onChange={v => set({ matchCapPct: v })}
          prefix="" suffix="%" min={0} max={25} step={0.5} small ariaLabel="Part-time match cap as percent of salary" />
      </div>

      <div className="bg-paper rounded-md p-2.5 border border-ink/5 text-xs space-y-1">
        {leftover < 0 ? (
          <p className="text-haze">Income covers part of spending — <span className="font-mono tnum font-medium text-copper">{fmtFull(-leftover)}/yr</span> drawn from savings (today's dollars), brokerage first.</p>
        ) : plannedAnnual > 0 ? (
          <p className="text-haze">Leftover after spending: <span className="font-mono tnum font-medium text-evergreen-dark">{fmtFull(leftover)}/yr</span> — funds <span className="font-mono tnum font-medium">{fundedPct.toFixed(0)}%</span> of planned contributions ({fmtFull(plannedAnnual)}/yr).</p>
        ) : (
          <p className="text-haze">Income covers spending with <span className="font-mono tnum font-medium text-evergreen-dark">{fmtFull(leftover)}/yr</span> to spare. Add part-time contributions above to put it to work.</p>
        )}
        {noMatchContrib && (
          <p className="text-danger">Match is {partTime.matchPct}% but part-time 401(k) contributions are $0 — no match will be earned.</p>
        )}
        {withdrawalMode === "rate" && (
          <p className="text-haze">Semi-retired years use your Annual Spending amount; %-of-portfolio withdrawals begin at retirement.</p>
        )}
      </div>
    </IncomeCard>
  );
}
