import { XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart, CartesianGrid } from "recharts";
import { MC_SIMULATIONS } from "../engine.js";
import { fmt$, fmtPct } from "../format.js";
import { MCTooltip } from "./charts.jsx";

const AXIS_TICK = { fontSize: 11, fill: "#7C8A85", fontFamily: '"IBM Plex Mono", monospace' };

export default function MonteCarloPanel({ mcResult, onRun, running }) {
  const successColor = mcResult
    ? mcResult.successRate >= 90 ? "#2E6E5E"
    : mcResult.successRate >= 75 ? "#A16207"
    : "#B3402F"
    : "#7C8A85";

  return (
    <div className="bg-white rounded-lg border border-ink/10 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">Monte Carlo Simulation</h3>
          <p className="text-xs text-haze mt-0.5">{MC_SIMULATIONS.toLocaleString()} simulations with randomised annual returns</p>
        </div>
        <button onClick={onRun} disabled={running}
          className="px-4 py-2 bg-evergreen hover:bg-evergreen-dark disabled:bg-evergreen/40 text-white text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-evergreen focus:ring-offset-1">
          {running ? "Running…" : mcResult ? "Re-run" : "Run Simulation"}
        </button>
      </div>

      {mcResult && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-md p-3 text-center" style={{ backgroundColor: `${successColor}15`, border: `1px solid ${successColor}40` }}>
              <p className="text-xs text-haze mb-1">Success Rate</p>
              <p className="text-2xl font-bold font-mono tnum" style={{ color: successColor }}>{fmtPct(mcResult.successRate)}</p>
              <p className="text-xs mt-1" style={{ color: successColor }}>
                {mcResult.successRate >= 90 ? "Very Safe" : mcResult.successRate >= 75 ? "Moderate Risk" : "High Risk"}
              </p>
            </div>
            <div className="bg-paper rounded-md p-3 text-center border border-ink/5">
              <p className="text-xs text-haze mb-1">Avg. Return Used</p>
              <p className="text-xl font-bold text-ink font-mono tnum">{fmtPct(mcResult.blendedMean * 100)}</p>
              <p className="text-xs text-haze mt-1">blended, year 1</p>
            </div>
            <div className="bg-paper rounded-md p-3 text-center border border-ink/5">
              <p className="text-xs text-haze mb-1">Volatility (σ)</p>
              <p className="text-xl font-bold text-ink font-mono tnum">{fmtPct(mcResult.blendedVol * 100)}</p>
              <p className="text-xs text-haze mt-1">annual std dev</p>
            </div>
          </div>

          <div className="bg-dusk-light border border-dusk/20 rounded-md p-3 text-xs text-dusk mb-4">
            <p><strong>How to read this:</strong> Each simulation uses a different sequence of random returns drawn from a normal distribution (glide paths keep de-risking through retirement). The success rate shows how often the portfolio survived to your life expectancy age. A rate of 90%+ is generally considered safe by financial planners.</p>
          </div>

          <h4 className="text-xs font-semibold text-ink/70 mb-2">Portfolio Range Across Simulations</h4>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={mcResult.fanData} margin={{ top: 5, right: 15, bottom: 5, left: 10 }}>
              <defs>
                <linearGradient id="gP90" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2E6E5E" stopOpacity={0.07} /><stop offset="95%" stopColor="#2E6E5E" stopOpacity={0} /></linearGradient>
                <linearGradient id="gP75" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2E6E5E" stopOpacity={0.14} /><stop offset="95%" stopColor="#2E6E5E" stopOpacity={0} /></linearGradient>
                <linearGradient id="gP50" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2E6E5E" stopOpacity={0.25} /><stop offset="95%" stopColor="#2E6E5E" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1F2D2B14" />
              <XAxis dataKey="age" tick={AXIS_TICK} stroke="#7C8A85" tickLine={false} />
              <YAxis tickFormatter={fmt$} tick={AXIS_TICK} stroke="#7C8A85" width={55} tickLine={false} axisLine={false} />
              <Tooltip content={<MCTooltip />} />
              <Area isAnimationActive={false} type="monotone" dataKey="p90" name="90th %ile" stroke="#9DBBB2" fill="url(#gP90)" strokeWidth={1} strokeDasharray="4 2" dot={false} />
              <Area isAnimationActive={false} type="monotone" dataKey="p75" name="75th %ile" stroke="#5F9285" fill="url(#gP75)" strokeWidth={1.5} dot={false} />
              <Area isAnimationActive={false} type="monotone" dataKey="p50" name="Median"    stroke="#2E6E5E" fill="url(#gP50)" strokeWidth={2}   dot={false} />
              <Area isAnimationActive={false} type="monotone" dataKey="p25" name="25th %ile" stroke="#5F9285" fill="none"       strokeWidth={1.5} dot={false} />
              <Area isAnimationActive={false} type="monotone" dataKey="p10" name="10th %ile" stroke="#9DBBB2" fill="none"       strokeWidth={1} strokeDasharray="4 2" dot={false} />
            </AreaChart>
          </ResponsiveContainer>

          <div className="mt-3 grid grid-cols-5 gap-1 text-center text-xs text-haze">
            {[["10th", "#9DBBB2"], ["25th", "#5F9285"], ["Median", "#2E6E5E"], ["75th", "#5F9285"], ["90th", "#9DBBB2"]].map(([lbl, c]) => (
              <div key={lbl}><span className="inline-block w-3 h-0.5 mr-1 align-middle" style={{ backgroundColor: c }} />{lbl}</div>
            ))}
          </div>
        </>
      )}

      {!mcResult && (
        <div className="text-center py-8 text-haze">
          <p className="text-sm">Run the simulation to stress-test this plan against {MC_SIMULATIONS.toLocaleString()} market histories</p>
          <p className="text-xs mt-1">Uses your projected retirement balances, allocations, and withdrawal settings</p>
        </div>
      )}
    </div>
  );
}
