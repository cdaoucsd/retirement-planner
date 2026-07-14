import { useMemo, useId } from "react";
import { runProjection, ssClaimFactor, ssBreakEvenAge, safeNum } from "../engine.js";
import { fmt$, fmtFull } from "../format.js";
import { Toggle } from "./ui.jsx";

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
