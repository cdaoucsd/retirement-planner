import { useState, useMemo, useCallback, useEffect } from "react";
import {
  INPUT_LIMITS, ACCT_KEYS,
  safeNum, clamp,
  computeEmployerMatch, runProjection, runMonteCarlo,
  contributionLimit401k, contributionLimitIRA,
  MARKET_ASSUMPTIONS, accountStockPct,
} from "./engine.js";
import { fmt$, fmtFull } from "./format.js";
import { NumberInput, ClearButton, Card, SectionHeader } from "./components/ui.jsx";
import { ProjectionChart, WithdrawalsChart } from "./components/charts.jsx";
import AccountCard from "./components/AccountCard.jsx";
import { IncomeCard, SSOptimizerPanel, PartTimeCard } from "./components/IncomePanels.jsx";
import { WithdrawalStrategyPanel, MilestoneTimeline } from "./components/StrategyPanel.jsx";
import RothConversionPanel from "./components/ConversionPanel.jsx";
import MonteCarloPanel from "./components/MonteCarloPanel.jsx";

// ─── Error Boundary ───────────────────────────────────────────────────────────
function ErrorFallback({ onReset }) {
  return (
    <div className="bg-danger-light border border-danger/30 rounded-lg p-6 m-4 text-center" role="alert">
      <h2 className="text-danger font-semibold mb-2">Something went wrong</h2>
      <p className="text-danger text-sm mb-4">An error occurred in the calculation engine. Please reset your inputs.</p>
      <button onClick={onReset} className="px-4 py-2 bg-danger text-white rounded-md text-sm hover:opacity-90">Reset to Defaults</button>
    </div>
  );
}

// ─── Segmented control ────────────────────────────────────────────────────────
function Segmented({ options, value, onChange, ariaLabel }) {
  return (
    <div className="flex rounded-md border border-ink/15 overflow-hidden text-sm" role="radiogroup" aria-label={ariaLabel}>
      {options.map(([val, label]) => (
        <button key={val} onClick={() => onChange(val)} role="radio" aria-checked={value === val}
          className={`flex-1 py-2 px-3 text-center transition-colors whitespace-nowrap ${value === val ? "bg-evergreen text-white font-medium" : "bg-white text-haze hover:bg-paper"}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Defaults & persistence ───────────────────────────────────────────────────
const CURRENT_YEAR  = new Date().getFullYear();
const CLEAR_ACCOUNT = { balance: 0, monthly: 0, returnPreset: 1, customReturn: 7, contribBasis: 0, costBasis: 0 };

const DEFAULTS = {
  retirementAge: 65, lifeExpectancy: 90,
  annualSpending: 60000, withdrawalMode: "fixed", withdrawalRate: 4.0,
  inflationRate: 2.5, birthYear: 1995,
  accounts: {
    trad401k:  { balance: 50000, monthly: 1000, returnPreset: 1, customReturn: 7, customMode: "alloc", stockPct: 60, glide: false, glideFloor: 30 },
    roth401k:  { balance: 0,     monthly: 0,    returnPreset: 1, customReturn: 7, customMode: "alloc", stockPct: 60, glide: false, glideFloor: 30, contribBasis: 0 },
    rothIRA:   { balance: 15000, monthly: 500,  returnPreset: 1, customReturn: 7, customMode: "alloc", stockPct: 60, glide: false, glideFloor: 30, contribBasis: 15000 },
    brokerage: { balance: 10000, monthly: 300,  returnPreset: 1, customReturn: 7, customMode: "alloc", stockPct: 60, glide: false, glideFloor: 30, costBasis: 10000 },
  },
  ssEnabled: true, ssMonthly: 2000, ssStartAge: 67,
  pensionEnabled: false, pensionMonthly: 1500, pensionStartAge: 65,
  annualIncome: 0, employerMatchPct: 0, employerMatchCapPct: 6,
  rothConversionEnabled: false, rothConversionBracket: 0.12,
  filingStatus: 'single',
  stateTax: 'none',
  marketAssumptions: { ...MARKET_ASSUMPTIONS },
  spendingPhases: { enabled: false, slowGoAge: 75, slowGoPct: 85, noGoAge: 85, noGoPct: 75 },
  partTime: {
    enabled: false, startAge: 55, income: 30000,
    contrib: { trad401k: 0, roth401k: 0, rothIRA: 0, brokerage: 0 },
    matchPct: 0, matchCapPct: 6,
  },
};

const STORAGE_KEY = "retirement_planner_state_v3";
const LEGACY_STORAGE_KEY = "retirement_planner_state_v2";

function loadSavedState() {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    let legacy = false;
    if (!raw) {
      raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      legacy = !!raw;
    }
    if (!raw) return DEFAULTS;
    const saved = JSON.parse(raw);
    const mergedAccounts = {};
    for (const k of Object.keys(DEFAULTS.accounts)) {
      mergedAccounts[k] = { ...DEFAULTS.accounts[k], ...(saved.accounts?.[k] ?? {}) };
      // v2 custom presets were flat returns — preserve that behavior
      if (legacy && mergedAccounts[k].returnPreset === 3 && saved.accounts?.[k]?.customMode === undefined) {
        mergedAccounts[k].customMode = "return";
      }
    }
    return {
      ...DEFAULTS, ...saved,
      accounts: mergedAccounts,
      marketAssumptions: { ...DEFAULTS.marketAssumptions, ...(saved.marketAssumptions ?? {}) },
      spendingPhases: { ...DEFAULTS.spendingPhases, ...(saved.spendingPhases ?? {}) },
      partTime: {
        ...DEFAULTS.partTime, ...(saved.partTime ?? {}),
        contrib: { ...DEFAULTS.partTime.contrib, ...(saved.partTime?.contrib ?? {}) },
      },
    };
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
  const [filingStatus, setFilingStatus] = useState(saved.filingStatus ?? 'single');
  const [stateTax, setStateTax] = useState(saved.stateTax ?? 'none');
  const [marketAssumptions, setMarketAssumptions] = useState(saved.marketAssumptions ?? { ...MARKET_ASSUMPTIONS });
  const [spendingPhases, setSpendingPhases] = useState(saved.spendingPhases ?? DEFAULTS.spendingPhases);
  const [partTime, setPartTime] = useState(saved.partTime ?? DEFAULTS.partTime);

  const [mcResult, setMcResult] = useState(null);
  const [mcRunning, setMcRunning] = useState(false);

  const currentAge        = clamp(CURRENT_YEAR - birthYear, 18, 99);
  const safeCurrentAge    = currentAge;
  const safeRetirementAge = clamp(retirementAge, safeCurrentAge + 1, 100);
  const safeLifeExpectancy = clamp(lifeExpectancy, safeRetirementAge + 1, 110);
  const rmdAge = birthYear <= 1959 ? 73 : 75;
  const safePartTimeStartAge = clamp(partTime.startAge, safeCurrentAge + 1, Math.max(safeCurrentAge + 1, safeRetirementAge - 1));

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        retirementAge, lifeExpectancy, annualSpending, withdrawalMode, withdrawalRate,
        inflationRate, birthYear, accounts,
        ssEnabled, ssMonthly, ssStartAge, pensionEnabled, pensionMonthly, pensionStartAge,
        annualIncome, employerMatchPct, employerMatchCapPct,
        rothConversionEnabled, rothConversionBracket, filingStatus, stateTax, marketAssumptions, spendingPhases,
        partTime,
      }));
    } catch { /* storage unavailable */ }
  }, [retirementAge, lifeExpectancy, annualSpending, withdrawalMode, withdrawalRate,
      inflationRate, birthYear, accounts,
      ssEnabled, ssMonthly, ssStartAge, pensionEnabled, pensionMonthly, pensionStartAge,
      annualIncome, employerMatchPct, employerMatchCapPct,
      rothConversionEnabled, rothConversionBracket, filingStatus, stateTax, marketAssumptions, spendingPhases,
      partTime]);

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
    setFilingStatus(DEFAULTS.filingStatus);
    setStateTax(DEFAULTS.stateTax);
    setMarketAssumptions({ ...MARKET_ASSUMPTIONS });
    setSpendingPhases(DEFAULTS.spendingPhases);
    setPartTime(DEFAULTS.partTime);
    setMcResult(null);
    try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  const baseProjectionParams = useMemo(() => ({
    accounts, currentAge: safeCurrentAge, retirementAge: safeRetirementAge,
    lifeExpectancy: safeLifeExpectancy, annualSpending, withdrawalMode, withdrawalRate,
    inflationRate, ssEnabled, ssMonthly, ssStartAge, pensionEnabled, pensionMonthly, pensionStartAge, birthYear,
    annualIncome, employerMatchPct, employerMatchCapPct,
    rothConversionBracket, filingStatus, stateTax, marketAssumptions, spendingPhases,
    partTimeEnabled: partTime.enabled, partTimeStartAge: partTime.startAge,
    partTimeIncome: partTime.income, partTimeContrib: partTime.contrib,
    partTimeMatchPct: partTime.matchPct, partTimeMatchCapPct: partTime.matchCapPct,
  }), [accounts, safeCurrentAge, safeRetirementAge, safeLifeExpectancy, annualSpending, withdrawalMode, withdrawalRate, inflationRate, ssEnabled, ssMonthly, ssStartAge, pensionEnabled, pensionMonthly, pensionStartAge, birthYear, annualIncome, employerMatchPct, employerMatchCapPct, rothConversionBracket, filingStatus, stateTax, marketAssumptions, spendingPhases, partTime]);

  const projectionResult = useMemo(() => {
    try {
      return { data: runProjection({ ...baseProjectionParams, rothConversionEnabled }), error: false };
    } catch { return { data: [], error: true }; }
  }, [baseProjectionParams, rothConversionEnabled]);
  const projection = projectionResult.data;

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
          currentAge: safeCurrentAge, marketAssumptions, spendingPhases,
        });
        setMcResult(result);
      } catch { /* silent */ }
      setMcRunning(false);
    }, 30);
  }, [projection, accounts, safeRetirementAge, safeLifeExpectancy, annualSpending, withdrawalMode, withdrawalRate, inflationRate, ssEnabled, ssMonthly, ssStartAge, pensionEnabled, pensionMonthly, pensionStartAge, safeCurrentAge, marketAssumptions, spendingPhases]);

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

  if (projectionResult.error) return <ErrorFallback onReset={resetAll} />;

  const retD         = projection.find(d => d.age === safeRetirementAge) || {};
  const endD         = projection[projection.length - 1] || {};
  const totalContrib = ACCT_KEYS.reduce((s, k) => s + safeNum(accounts[k].monthly), 0);
  const willRunOut   = endD.Total <= 0;
  const withdrawalStartAge = partTime.enabled ? Math.min(safePartTimeStartAge, safeRetirementAge) : safeRetirementAge;
  const withdrawalData = projection.filter(d => d.age >= withdrawalStartAge);

  // Contribution-limit checks
  const k401Annual = (safeNum(accounts.trad401k.monthly) + safeNum(accounts.roth401k.monthly)) * 12;
  const k401Limit  = contributionLimit401k(safeCurrentAge);
  const iraAnnual  = safeNum(accounts.rothIRA.monthly) * 12;
  const iraLimit   = contributionLimitIRA(safeCurrentAge);
  const limitWarns = [];
  if (k401Annual > k401Limit) limitWarns.push(`Combined 401(k) contributions of ${fmtFull(k401Annual)}/yr exceed the ${fmtFull(k401Limit)} employee limit (2025, age ${safeCurrentAge}).`);
  if (iraAnnual > iraLimit)  limitWarns.push(`Roth IRA contributions of ${fmtFull(iraAnnual)}/yr exceed the ${fmtFull(iraLimit)} limit (2025, age ${safeCurrentAge}).`);
  if (partTime.enabled) {
    const ptK401 = (safeNum(partTime.contrib.trad401k) + safeNum(partTime.contrib.roth401k)) * 12;
    const ptK401Limit = contributionLimit401k(safePartTimeStartAge);
    if (ptK401 > ptK401Limit) limitWarns.push(`Part-time 401(k) contributions of ${fmtFull(ptK401)}/yr exceed the ${fmtFull(ptK401Limit)} employee limit (2025, age ${safePartTimeStartAge}).`);
    const ptIra = safeNum(partTime.contrib.rothIRA) * 12;
    const ptIraLimit = contributionLimitIRA(safePartTimeStartAge);
    if (ptIra > ptIraLimit) limitWarns.push(`Part-time Roth IRA contributions of ${fmtFull(ptIra)}/yr exceed the ${fmtFull(ptIraLimit)} limit (2025, age ${safePartTimeStartAge}).`);
  }

  // Asset-location hint
  const tradSp = accountStockPct(accounts.trad401k);
  const rothStockPcts = [accounts.roth401k, accounts.rothIRA]
    .filter(a => safeNum(a.balance) > 0 && accountStockPct(a) != null)
    .map(a => accountStockPct(a));
  const rothMin = rothStockPcts.length ? Math.min(...rothStockPcts) : null;
  const showAssetLocationTip = rothMin != null && tradSp != null && rothMin < tradSp;

  const navLinks = [
    ["#money-in", "01 · Money in"],
    ["#money-out", "02 · Money out"],
    ["#results", "03 · Will it work?"],
  ];

  return (
    <div className="min-h-screen bg-paper">
      {/* ── Sticky plan-health bar ── */}
      <div className="sticky top-0 z-30 bg-paper/95 backdrop-blur border-b border-ink/10">
        <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-x-5 gap-y-1 flex-wrap text-sm">
          <span className="font-display font-semibold text-ink whitespace-nowrap">Retirement Planner</span>
          <span className="text-xs text-haze whitespace-nowrap">At {safeRetirementAge}: <span className="font-mono tnum font-semibold text-dusk">{fmt$(retD.Total || 0)}</span></span>
          <span className="text-xs text-haze whitespace-nowrap">At {safeLifeExpectancy}: <span className={`font-mono tnum font-semibold ${willRunOut ? "text-danger" : "text-evergreen-dark"}`}>{fmt$(endD.Total || 0)}</span></span>
          <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap font-medium ${willRunOut ? "bg-danger-light text-danger" : "bg-evergreen-light text-evergreen-dark"}`}>
            {willRunOut ? "Runs out early" : "Lasts the plan"}
          </span>
          {mcResult && (
            <span className="text-xs text-haze whitespace-nowrap">MC success: <span className="font-mono tnum font-semibold text-ink">{mcResult.successRate.toFixed(0)}%</span></span>
          )}
          <nav className="ml-auto hidden md:flex items-center gap-3" aria-label="Sections">
            {navLinks.map(([href, label]) => (
              <a key={href} href={href} className="text-xs text-haze hover:text-evergreen-dark font-mono transition-colors">{label}</a>
            ))}
          </nav>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* ── Header + profile strip ── */}
        <header className="flex items-start justify-between mb-5">
          <div>
            <h1 className="font-display text-3xl font-semibold text-ink">Retirement Planner</h1>
            <p className="text-sm text-haze mt-1">Your money, laid out by age — from first contribution to last withdrawal.</p>
          </div>
          <button onClick={resetAll}
            className="text-sm text-haze hover:text-danger border border-ink/15 hover:border-danger/40 px-3 py-1.5 rounded-md transition-colors mt-1 whitespace-nowrap"
            aria-label="Reset all inputs to defaults">
            Reset All
          </button>
        </header>

        <Card className="p-4 mb-6" >
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end" role="group" aria-label="Your profile">
            <NumberInput label="Birth Year" value={birthYear} onChange={setBirthYear} prefix="" min={INPUT_LIMITS.birthYear.min} max={INPUT_LIMITS.birthYear.max} small ariaLabel="Birth year" />
            <NumberInput label="Retire At" value={retirementAge} onChange={setRetirementAge} prefix="" min={safeCurrentAge + 1} max={100} small ariaLabel="Retirement age" />
            <NumberInput label="Plan To Age" value={lifeExpectancy} onChange={setLifeExpectancy} prefix="" min={safeRetirementAge + 1} max={110} small ariaLabel="Life expectancy" />
            <div className="col-span-2 md:col-span-1">
              <label className="block text-xs font-medium text-haze mb-1">Filing Status</label>
              <Segmented ariaLabel="Filing status" value={filingStatus} onChange={setFilingStatus}
                options={[["single", "Single"], ["mfj", "MFJ"]]} />
            </div>
            <div className="col-span-2 md:col-span-1">
              <label className="block text-xs font-medium text-haze mb-1">State Tax</label>
              <Segmented ariaLabel="State tax" value={stateTax} onChange={setStateTax}
                options={[["none", "None"], ["ca", "California"]]} />
            </div>
            <div className="text-xs text-haze pb-2">
              Age <span className="font-mono tnum font-semibold text-ink">{safeCurrentAge}</span> today ·{" "}
              <span className="font-mono tnum">{safeRetirementAge - safeCurrentAge}</span> yrs to go · RMDs at{" "}
              <span className="font-mono tnum">{rmdAge}</span>
            </div>
          </div>
        </Card>

        {/* ── Hero: the lifetime chart ── */}
        <Card className="p-5 mb-2" >
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-semibold text-ink">Your lifetime, in dollars</h2>
            <p className="text-xs text-haze hidden sm:block">shaded: <span className="text-evergreen-dark">conversion window</span> · <span className="text-danger">RMD years</span></p>
          </div>
          <ProjectionChart projection={projection} currentAge={safeCurrentAge}
            retirementAge={safeRetirementAge} lifeExpectancy={safeLifeExpectancy} rmdAge={rmdAge} />
          {willRunOut && (
            <div className="mt-3 bg-danger-light border border-danger/20 rounded-md px-4 py-2.5 text-sm text-danger" role="alert">
              Your portfolio may be depleted before age {safeLifeExpectancy}. Consider increasing contributions or reducing spending.
            </div>
          )}
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4" role="region" aria-label="Portfolio summary">
          {[
            ["At Retirement", fmt$(retD.Total || 0), `age ${safeRetirementAge}`, "text-dusk"],
            [`At Age ${safeLifeExpectancy}`, fmt$(endD.Total || 0), willRunOut ? "depleted" : "remaining", willRunOut ? "text-danger" : "text-evergreen-dark"],
            ["Saving Monthly", fmtFull(totalContrib), `${fmtFull(totalContrib * 12)}/yr`, "text-ink"],
            ["Employer Adds", fmtFull(matchAnnual / 12), matchAnnual > 0 ? `${fmtFull(matchAnnual)}/yr` : "set up below", "text-copper"],
          ].map(([label, value, sub, color]) => (
            <Card key={label} className="p-4">
              <p className="text-xs text-haze mb-1">{label}</p>
              <p className={`text-xl font-bold font-mono tnum ${color}`}>{value}</p>
              {sub && <p className="text-xs text-haze mt-1">{sub}</p>}
            </Card>
          ))}
        </div>

        {/* ── 01 · Money in ── */}
        <SectionHeader n="01" title="Money in" id="money-in"
          ages={`ages ${safeCurrentAge}–${safeRetirementAge}`}
          sub="What you save while working — accounts, employer match, and retirement income sources." />

        {limitWarns.length > 0 && (
          <div className="mb-4 bg-amber2-light border border-amber2/25 rounded-md p-3" role="alert">
            <p className="text-xs font-semibold text-amber2 mb-1">Over IRS contribution limits</p>
            {limitWarns.map(w => <p key={w} className="text-xs text-amber2">{w}</p>)}
            <p className="text-xs text-amber2/80 mt-1">Projections still use your entered amounts — adjust to stay within legal limits.</p>
          </div>
        )}

        <div className="flex justify-end mb-3">
          <ClearButton label="Clear All Accounts" onClick={() => setAccounts({ trad401k: { ...CLEAR_ACCOUNT }, roth401k: { ...CLEAR_ACCOUNT }, rothIRA: { ...CLEAR_ACCOUNT }, brokerage: { ...CLEAR_ACCOUNT } })} />
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <AccountCard title="Traditional 401(k)" subtitle="Pre-tax contributions; taxed at withdrawal" icon="T" color="#3D5A80"
            market={marketAssumptions}
            account={accounts.trad401k} onChange={a => setAccounts({ ...accounts, trad401k: a })}
            breakdown={[
              { label: "Your contributions", value: fmtFull(retD.trad401kContribBasis || 0) },
              { label: "Employer match", value: fmtFull(retD.trad401kMatchBasis || 0), color: "text-copper" },
              { label: "Starting balance + growth", value: fmtFull(retD.trad401kGrowth || 0) },
              { divider: true, label: "div" },
              { label: "Total", value: fmtFull(retD.trad401k || 0), bold: true },
            ]} />
          <AccountCard title="Roth 401(k)" subtitle="Post-tax contributions; tax-free at withdrawal" icon="R" color="#2E6E5E"
            market={marketAssumptions}
            account={accounts.roth401k} onChange={a => setAccounts({ ...accounts, roth401k: a })}
            showContribBasis proRataNote
            breakdown={[
              { label: "Your contributions", value: fmtFull(retD.roth401kContribBasis || 0), color: "text-evergreen-dark" },
              { label: "Growth", value: fmtFull(retD.roth401kGrowth || 0) },
              { divider: true, label: "div" },
              { label: "Total", value: fmtFull(retD.roth401k || 0), bold: true },
            ]} />
          <AccountCard title="Roth IRA" icon="I" color="#6FA287"
            market={marketAssumptions}
            account={accounts.rothIRA} onChange={a => setAccounts({ ...accounts, rothIRA: a })}
            showContribBasis
            breakdown={(() => {
              const pool = (retD.rothIRAContribBasis || 0) + (retD.rothIRAConvMature || 0);
              return [
                { label: "Contributions (always accessible)", value: fmtFull(retD.rothIRAContribBasis || 0), color: "text-evergreen-dark" },
                { label: "Conversions ≥5 yrs (accessible)", value: fmtFull(retD.rothIRAConvMature || 0), color: "text-dusk" },
                { label: "Conversions <5 yrs (locked)", value: fmtFull(retD.rothIRAConvPending || 0), color: "text-amber2" },
                { label: "Earnings (locked until 59½)", value: fmtFull(retD.rothIRAEarnings || 0), color: "text-haze" },
                { divider: true, label: "div" },
                { label: "Penalty-free pool", value: fmtFull(pool), color: "text-evergreen-dark", bold: true },
              ];
            })()} />
          <AccountCard title="Brokerage" icon="B" color="#B4642D"
            subtitle="Taxable; gains above cost basis taxed at capital-gains rates"
            market={marketAssumptions}
            account={accounts.brokerage} onChange={a => setAccounts({ ...accounts, brokerage: a })}
            showCostBasis />
        </div>

        {showAssetLocationTip && (
          <div className="mb-4 bg-dusk-light border border-dusk/20 rounded-md p-3 text-xs text-dusk">
            <p className="font-semibold mb-1">Asset location tip</p>
            <p>Your Roth accounts hold a more bond-heavy mix ({rothMin}% stocks) than your Traditional 401(k) ({tradSp}% stocks). Roth space grows tax-free forever — it compounds best holding your highest-growth assets. Consider keeping bonds in tax-deferred accounts first.</p>
          </div>
        )}

        {/* Employer Match */}
        <Card className="p-5 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-md flex items-center justify-center text-white text-sm font-bold font-display bg-copper" aria-hidden="true">$</div>
            <div>
              <h3 className="font-semibold text-ink">Employer Match</h3>
              <p className="text-xs text-haze">Match dollars flow into Traditional 401(k) monthly until retirement</p>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <NumberInput label="Annual Income" value={annualIncome} onChange={setAnnualIncome} max={INPUT_LIMITS.income.max} step={1000} ariaLabel="Annual income" />
            <NumberInput label="Employer Match %" value={employerMatchPct} onChange={setEmployerMatchPct} prefix="" suffix="%" min={0} max={INPUT_LIMITS.matchPct.max} step={5} ariaLabel="Employer match percentage" />
            <NumberInput label="Match Cap (% of salary)" value={employerMatchCapPct} onChange={setEmployerMatchCapPct} prefix="" suffix="%" min={0} max={INPUT_LIMITS.matchCapPct.max} step={0.5} ariaLabel="Match cap as percent of salary" />
          </div>
          {annualIncome > 0 && (
            <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
              <div className="bg-paper rounded-md p-2.5 border border-ink/5">
                <p className="text-haze">Your contribution</p>
                <p className="font-semibold text-ink font-mono tnum">{empPctOfSalary.toFixed(1)}% of salary</p>
                <p className="text-haze font-mono tnum">{fmtFull(employeeMonthlyTotal * 12)}/yr</p>
              </div>
              <div className="bg-copper-light rounded-md p-2.5 border border-copper/20">
                <p className="text-copper">Employer adds</p>
                <p className="font-semibold text-copper font-mono tnum">{fmtFull(matchAnnual / 12)}/mo</p>
                <p className="text-copper/80 font-mono tnum">{fmtFull(matchAnnual)}/yr → Trad 401(k)</p>
              </div>
              {missedMatch > 0 && (
                <div className="bg-danger-light rounded-md p-2.5 border border-danger/20 col-span-2 md:col-span-1">
                  <p className="text-danger">Missing free money</p>
                  <p className="font-semibold text-danger font-mono tnum">{fmtFull(missedMatch)}/yr</p>
                  <p className="text-danger/80">Increase to {employerMatchCapPct}% of salary to capture full match</p>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Retirement income sources */}
        <div className="grid md:grid-cols-2 gap-4">
          <IncomeCard title="Social Security" icon="SS" color="#46708C" enabled={ssEnabled} onToggle={() => setSSEnabled(!ssEnabled)}>
            <NumberInput label="Estimated Monthly Benefit" value={ssMonthly} onChange={setSSMonthly} max={INPUT_LIMITS.ssMonthly.max} ariaLabel="Social Security monthly benefit" />
            <NumberInput label="Start Age" value={ssStartAge} onChange={setSSStartAge} prefix="" min={62} max={70} ariaLabel="Social Security start age" />
            <div className="bg-dusk-light border border-dusk/20 rounded-md p-2.5 text-xs text-dusk">
              <p className="font-medium mb-1">Claiming age impact:</p>
              <p>Age 62: ~30% reduction · Age 67 (FRA): 100% · Age 70: ~124% of FRA benefit</p>
              <p className="mt-1">See the claiming comparison in section 03 below.</p>
            </div>
          </IncomeCard>
          <IncomeCard title="Pension" icon="P" color="#A16207" enabled={pensionEnabled} onToggle={() => setPensionEnabled(!pensionEnabled)}>
            <NumberInput label="Monthly Pension Amount" value={pensionMonthly} onChange={setPensionMonthly} max={INPUT_LIMITS.pensionMonthly.max} ariaLabel="Monthly pension amount" />
            <NumberInput label="Start Age" value={pensionStartAge} onChange={setPensionStartAge} prefix="" min={50} max={75} ariaLabel="Pension start age" />
            <p className="text-xs text-haze">Pension modeled as a fixed monthly payment (not inflation-adjusted).</p>
          </IncomeCard>
          <PartTimeCard partTime={partTime} onChange={setPartTime}
            currentAge={safeCurrentAge} retirementAge={safeRetirementAge}
            annualSpending={annualSpending} withdrawalMode={withdrawalMode} />
        </div>

        {/* ── 02 · Money out ── */}
        <SectionHeader n="02" title="Money out" id="money-out"
          ages={`ages ${safeRetirementAge}–${safeLifeExpectancy}`}
          sub="What you spend once retired — and the assumptions everything runs on." />

        <div className="grid md:grid-cols-2 gap-4">
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-ink mb-3">Spending Plan</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-haze mb-2">Withdrawal Method</label>
                <Segmented ariaLabel="Withdrawal method" value={withdrawalMode} onChange={setWithdrawalMode}
                  options={[["fixed", "Fixed Amount"], ["rate", "% of Portfolio"]]} />
              </div>

              {withdrawalMode === "fixed" ? (
                <div className="space-y-3">
                  <NumberInput label="Annual Spending in Retirement" value={annualSpending} onChange={setAnnualSpending} step={1000} max={INPUT_LIMITS.spending.max} ariaLabel="Annual spending in retirement" />
                  <div className="bg-paper rounded-md p-3 border border-ink/5">
                    <label className="flex items-center gap-2 text-xs font-medium text-ink/70 cursor-pointer">
                      <input type="checkbox" checked={spendingPhases.enabled}
                        onChange={e => setSpendingPhases({ ...spendingPhases, enabled: e.target.checked })}
                        className="rounded border-ink/25 text-evergreen focus:ring-evergreen" aria-label="Enable spending phases" />
                      Spending phases (go-go / slow-go / no-go)
                    </label>
                    <p className="mt-1 text-xs text-haze">Retirees typically spend less as they age — full spending early, then a step down for slower years, and again for late life.</p>
                    {spendingPhases.enabled && (
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <NumberInput label="Slow-go from age" value={spendingPhases.slowGoAge} onChange={v => setSpendingPhases({ ...spendingPhases, slowGoAge: v })} prefix="" min={safeRetirementAge} max={110} small ariaLabel="Slow-go start age" />
                        <NumberInput label="Slow-go spending" value={spendingPhases.slowGoPct} onChange={v => setSpendingPhases({ ...spendingPhases, slowGoPct: v })} prefix="" suffix="%" min={0} max={200} step={5} small ariaLabel="Slow-go spending percent" />
                        <NumberInput label="No-go from age" value={spendingPhases.noGoAge} onChange={v => setSpendingPhases({ ...spendingPhases, noGoAge: v })} prefix="" min={safeRetirementAge} max={110} small ariaLabel="No-go start age" />
                        <NumberInput label="No-go spending" value={spendingPhases.noGoPct} onChange={v => setSpendingPhases({ ...spendingPhases, noGoPct: v })} prefix="" suffix="%" min={0} max={200} step={5} small ariaLabel="No-go spending percent" />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <NumberInput label="Annual Withdrawal Rate" value={withdrawalRate} onChange={setWithdrawalRate} prefix="" suffix="%" min={INPUT_LIMITS.withdrawalRate.min} max={INPUT_LIMITS.withdrawalRate.max} step={0.1} ariaLabel="Annual withdrawal rate" />
                  <p className="mt-1.5 text-xs text-haze">Classic "4% rule" = withdraw 4% of your portfolio value each year. Adjusts automatically as portfolio grows or shrinks.</p>
                  <div className="mt-2 text-xs text-haze bg-paper rounded-md p-2.5 border border-ink/5">
                    Est. year-1 withdrawal: <span className="font-medium text-ink font-mono tnum">{fmtFull((retD.Total || 0) * withdrawalRate / 100)}</span>
                  </div>
                </div>
              )}

              {safeRetirementAge < 59.5 && (
                <div className="bg-amber2-light border border-amber2/25 rounded-md p-3 text-xs text-amber2" role="note">
                  <p className="font-medium">Early Retirement Detected (before 59½)</p>
                  <p className="mt-1">{safeRetirementAge >= 55
                    ? "Rule of 55 applies: penalty-free 401(k) withdrawals from your employer plan. Brokerage and Roth contributions are also accessible."
                    : "Before age 55, penalty-free options are limited to brokerage accounts and Roth IRA contributions. Consider 72(t) SEPP for additional IRA access."}</p>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-semibold text-ink mb-3">Assumptions</h3>
            <div className="space-y-4">
              <NumberInput label="Inflation Rate" value={inflationRate} onChange={setInflationRate} prefix="" suffix="%" min={0} max={INPUT_LIMITS.inflation.max} step={0.5} ariaLabel="Inflation rate" />
              <div>
                <label className="block text-xs font-medium text-haze mb-2">Market Assumptions (annual)</label>
                <div className="grid grid-cols-2 gap-3">
                  <NumberInput label="Stock return" value={marketAssumptions.stockReturn} onChange={v => setMarketAssumptions({ ...marketAssumptions, stockReturn: v })} prefix="" suffix="%" min={0} max={25} step={0.5} small ariaLabel="Expected stock return" />
                  <NumberInput label="Stock volatility" value={marketAssumptions.stockVol} onChange={v => setMarketAssumptions({ ...marketAssumptions, stockVol: v })} prefix="" suffix="%" min={0} max={50} step={0.5} small ariaLabel="Stock volatility" />
                  <NumberInput label="Bond return" value={marketAssumptions.bondReturn} onChange={v => setMarketAssumptions({ ...marketAssumptions, bondReturn: v })} prefix="" suffix="%" min={0} max={25} step={0.5} small ariaLabel="Expected bond return" />
                  <NumberInput label="Bond volatility" value={marketAssumptions.bondVol} onChange={v => setMarketAssumptions({ ...marketAssumptions, bondVol: v })} prefix="" suffix="%" min={0} max={50} step={0.5} small ariaLabel="Bond volatility" />
                </div>
                <p className="mt-1.5 text-xs text-haze">Drive expected returns and Monte Carlo volatility for every account's stock/bond allocation.</p>
              </div>
            </div>
          </Card>
        </div>

        {/* ── 03 · Will it work? ── */}
        <SectionHeader n="03" title="Will it work?" id="results"
          ages={`ages ${safeRetirementAge}–${safeLifeExpectancy}`}
          sub="Withdrawal order, Roth conversions, stress tests, and the claiming decision." />

        {withdrawalData.length > 0 && (
          <Card className="p-5 mb-4" >
            <h3 className="text-sm font-semibold text-ink mb-3">Annual Withdrawals by Source</h3>
            <WithdrawalsChart withdrawalData={withdrawalData} rmdAge={rmdAge} lifeExpectancy={safeLifeExpectancy} />
          </Card>
        )}

        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <WithdrawalStrategyPanel projection={projection} retirementAge={safeRetirementAge} birthYear={birthYear} stateTax={stateTax} />
          <MilestoneTimeline currentAge={safeCurrentAge} retirementAge={safeRetirementAge} birthYear={birthYear} />
        </div>

        <div className="mb-4">
          <RothConversionPanel
            enabled={rothConversionEnabled}
            onToggleEnabled={() => setRothConversionEnabled(!rothConversionEnabled)}
            bracket={rothConversionBracket}
            onChangeBracket={setRothConversionBracket}
            projection={projection}
            projectionNoConv={projectionNoConv}
            retirementAge={safeRetirementAge}
            birthYear={birthYear}
            stateTax={stateTax}
          />
        </div>

        <div className="mb-4">
          <MonteCarloPanel mcResult={mcResult} onRun={handleRunMC} running={mcRunning} />
        </div>

        {ssEnabled && safeNum(ssMonthly) > 0 && (
          <div className="mb-4">
            <SSOptimizerPanel
              baseProjectionParams={baseProjectionParams}
              rothConversionEnabled={rothConversionEnabled}
              ssMonthly={ssMonthly} ssStartAge={ssStartAge}
              lifeExpectancy={safeLifeExpectancy}
            />
          </div>
        )}

        {/* Retirement summary */}
        <Card className="p-5 mt-6" >
          <h3 className="text-sm font-semibold text-ink mb-3">Retirement Summary (age {safeRetirementAge})</h3>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
            {[
              ["Trad 401(k)", fmtFull(retD.trad401k || 0),  "bg-dusk-light",   "text-dusk"],
              ["Roth 401(k)", fmtFull(retD.roth401k || 0),  "bg-evergreen-light",   "text-evergreen-dark"],
              ["Roth IRA",    fmtFull(retD.rothIRA  || 0),  "bg-evergreen-light/60",  "text-evergreen-dark"],
              ["Brokerage",   fmtFull(retD.brokerage || 0), "bg-copper-light", "text-copper"],
              ["Income/mo",   fmtFull(((retD.ssIncome || 0) + (retD.pensionIncome || 0)) / 12), "bg-dusk-light/60", "text-dusk"],
              ["Total",       fmtFull(retD.Total || 0),      "bg-paper",   "text-ink"],
            ].map(([lbl, val, bg, fg]) => (
              <div key={lbl} className={`${bg} rounded-md p-3`}>
                <p className="text-haze text-xs">{lbl}</p>
                <p className={`font-bold font-mono tnum ${fg}`}>{val}</p>
              </div>
            ))}
          </div>
        </Card>

        <footer className="text-center text-xs text-haze mt-8 mb-4">
          <p>Simplified projection tool. Federal income and capital-gains tax estimated with 2025 brackets ({filingStatus === 'mfj' ? 'married filing jointly' : 'single filer'}), inflated annually.{stateTax === 'ca' ? ' California state tax estimated with 2024 FTB brackets (CA taxes capital gains as ordinary income).' : ''} RMDs per the IRS Uniform Lifetime Table. Monte Carlo uses a normal return distribution. Consult a financial advisor for personalised advice.</p>
          <p className="mt-1">All calculations run client-side. No financial data is sent to any server.</p>
        </footer>
      </div>
    </div>
  );
}
