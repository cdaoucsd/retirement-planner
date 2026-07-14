import { XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Area, AreaChart, CartesianGrid, ReferenceLine, ReferenceArea, BarChart, Bar } from "recharts";
import { ACCT_COLORS } from "../engine.js";
import { fmt$, fmtFull } from "../format.js";

const AXIS_TICK = { fontSize: 11, fill: "#7C8A85", fontFamily: '"IBM Plex Mono", monospace' };
const GRID_STROKE = "#1F2D2B14";

// ─── Tooltips ─────────────────────────────────────────────────────────────────
export function PortfolioTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-ink/10 rounded-md shadow-lg p-3 text-sm" role="status" aria-live="polite">
      <p className="font-medium text-ink mb-1.5 font-mono tnum">Age {label}</p>
      {payload.map(e => (
        <div key={e.dataKey || e.name} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: e.color }} aria-hidden="true" />
          <span className="text-haze">{e.name}:</span>
          <span className="font-medium text-ink font-mono tnum">{fmtFull(e.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function WithdrawalTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="bg-white border border-ink/10 rounded-md shadow-lg p-3 text-sm" role="status" aria-live="polite">
      <p className="font-medium text-ink mb-1.5 font-mono tnum">Age {label}</p>
      {payload.filter(e => e.value > 0).map(e => (
        <div key={e.dataKey || e.name} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: e.color }} aria-hidden="true" />
          <span className="text-haze">{e.name}:</span>
          <span className="font-medium text-ink font-mono tnum">{fmtFull(e.value)}</span>
        </div>
      ))}
      {d?.rmdRequired > 0 && (
        <p className="mt-1.5 pt-1.5 border-t border-ink/10 text-xs text-danger">
          RMD required: <span className="font-mono tnum">{fmtFull(d.rmdRequired)}</span>
        </p>
      )}
      {d?.capGains > 0 && (
        <p className="text-xs text-haze">
          Realized gains: <span className="font-mono tnum">{fmtFull(d.capGains)}</span>
          {d.ltcgTax > 0 ? ` · tax ${fmtFull(d.ltcgTax)}` : " · 0% bracket"}
        </p>
      )}
    </div>
  );
}

export function MCTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-white border border-ink/10 rounded-md shadow-lg p-3 text-sm" role="status" aria-live="polite">
      <p className="font-medium text-ink mb-1.5 font-mono tnum">Age {label}</p>
      <div className="space-y-1">
        {[["90th", d.p90], ["75th", d.p75], ["50th (Median)", d.p50], ["25th", d.p25], ["10th", d.p10]].map(([lbl, val]) => (
          <div key={lbl} className="flex justify-between gap-4 text-xs">
            <span className="text-haze">{lbl} percentile</span>
            <span className="font-medium font-mono tnum">{fmtFull(val)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Hero: portfolio projection with the age spine ────────────────────────────
// Milestone markers and retirement-phase shading live directly on the age axis.
export function ProjectionChart({ projection, currentAge, retirementAge, lifeExpectancy, rmdAge }) {
  const spine = [
    { age: retirementAge, label: "Retire", color: "#B4642D", solid: true },
    { age: 59.5, label: "59½", color: "#2E6E5E" },
    { age: 65, label: "Medicare", color: "#6D5A8C" },
    { age: rmdAge, label: `RMDs`, color: "#B3402F" },
  ].filter((m, i, arr) =>
    m.age > currentAge && m.age < lifeExpectancy &&
    // drop markers that collide with an earlier (higher-priority) one
    arr.findIndex(o => Math.abs(o.age - m.age) < 1.5) === i,
  );

  const optStart = Math.max(retirementAge, 59.5);

  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={projection} margin={{ top: 24, right: 20, bottom: 5, left: 10 }}>
        <defs>
          {Object.entries(ACCT_COLORS).map(([k, c]) => (
            <linearGradient key={k} id={`grad-${k}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={c} stopOpacity={0.55} />
              <stop offset="95%" stopColor={c} stopOpacity={0.12} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
        <XAxis dataKey="age" tick={AXIS_TICK} stroke="#7C8A85" tickLine={false} />
        <YAxis tickFormatter={fmt$} tick={AXIS_TICK} stroke="#7C8A85" width={58} tickLine={false} axisLine={false} />
        <Tooltip content={<PortfolioTooltip />} />
        <Legend wrapperStyle={{ fontSize: "12px" }} />
        {/* Phase shading: tax-optimization window, then RMD phase */}
        {optStart < rmdAge && rmdAge < lifeExpectancy && (
          <ReferenceArea x1={optStart} x2={rmdAge} fill="#2E6E5E" fillOpacity={0.04} />
        )}
        {rmdAge < lifeExpectancy && (
          <ReferenceArea x1={rmdAge} x2={lifeExpectancy} fill="#B3402F" fillOpacity={0.04} />
        )}
        <Area isAnimationActive={false} type="monotone" dataKey="trad401k"  name="Traditional 401(k)" stackId="1" stroke={ACCT_COLORS.trad401k}  fill={`url(#grad-trad401k)`}  strokeWidth={2} />
        <Area isAnimationActive={false} type="monotone" dataKey="roth401k"  name="Roth 401(k)"        stackId="1" stroke={ACCT_COLORS.roth401k}  fill={`url(#grad-roth401k)`}  strokeWidth={2} />
        <Area isAnimationActive={false} type="monotone" dataKey="rothIRA"   name="Roth IRA"           stackId="1" stroke={ACCT_COLORS.rothIRA}   fill={`url(#grad-rothIRA)`}   strokeWidth={2} />
        <Area isAnimationActive={false} type="monotone" dataKey="brokerage" name="Brokerage"          stackId="1" stroke={ACCT_COLORS.brokerage} fill={`url(#grad-brokerage)`} strokeWidth={2} />
        {spine.map(m => (
          <ReferenceLine key={m.label} x={m.age} stroke={m.color}
            strokeDasharray={m.solid ? undefined : "5 4"} strokeWidth={m.solid ? 1.5 : 1} strokeOpacity={m.solid ? 0.9 : 0.55}
            label={{ value: m.label, position: "top", fontSize: 10, fill: m.color, fontFamily: '"IBM Plex Mono", monospace' }} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Withdrawals by source ────────────────────────────────────────────────────
export function WithdrawalsChart({ withdrawalData, rmdAge, lifeExpectancy }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={withdrawalData} margin={{ top: 16, right: 20, bottom: 5, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
        <XAxis dataKey="age" tick={AXIS_TICK} stroke="#7C8A85" tickLine={false} />
        <YAxis tickFormatter={fmt$} tick={AXIS_TICK} stroke="#7C8A85" width={58} tickLine={false} axisLine={false} />
        <Tooltip content={<WithdrawalTooltip />} />
        <Legend wrapperStyle={{ fontSize: "12px" }} />
        {rmdAge <= lifeExpectancy && (
          <ReferenceLine x={rmdAge} stroke="#B3402F" strokeDasharray="5 4" strokeOpacity={0.55}
            label={{ value: "RMDs", position: "top", fontSize: 10, fill: "#B3402F", fontFamily: '"IBM Plex Mono", monospace' }} />
        )}
        <Bar isAnimationActive={false} dataKey="wBrokerage" name="Brokerage"          stackId="w" fill={ACCT_COLORS.brokerage} />
        <Bar isAnimationActive={false} dataKey="wTrad401k"  name="Traditional 401(k)" stackId="w" fill={ACCT_COLORS.trad401k} />
        <Bar isAnimationActive={false} dataKey="wRothIRA"   name="Roth IRA"           stackId="w" fill={ACCT_COLORS.rothIRA} />
        <Bar isAnimationActive={false} dataKey="wRoth401k"  name="Roth 401(k)"        stackId="w" fill={ACCT_COLORS.roth401k} />
      </BarChart>
    </ResponsiveContainer>
  );
}
