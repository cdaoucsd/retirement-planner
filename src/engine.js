// ─── Constants ────────────────────────────────────────────────────────────────
export const RETURN_PRESETS = [
  { id: "conservative", label: "Conservative (4%)", value: 4 },
  { id: "moderate",     label: "Moderate (7%)",     value: 7 },
  { id: "aggressive",   label: "Aggressive (10%)",  value: 10 },
  { id: "custom",       label: "Custom",             value: null },
];

export const VOLATILITY_BY_PRESET = [0.08, 0.12, 0.17, 0.12];

export const INPUT_LIMITS = {
  balance:        { min: 0,  max: 10_000_000 },
  monthly:        { min: 0,  max: 50_000 },
  returnRate:     { min: 0,  max: 25 },
  inflation:      { min: 0,  max: 15 },
  spending:       { min: 0,  max: 1_000_000 },
  withdrawalRate: { min: 0.1, max: 20 },
  birthYear:      { min: 1930, max: 2010 },
  ssMonthly:      { min: 0,  max: 10_000 },
  pensionMonthly: { min: 0,  max: 20_000 },
  income:         { min: 0,  max: 5_000_000 },
  matchPct:       { min: 0,  max: 200 },
  matchCapPct:    { min: 0,  max: 25 },
};

export const MAX_BALANCE_CAP = 1e12;
export const MC_SIMULATIONS  = 1000;

export const TAX_BRACKETS_2025 = [
  { min: 0,       max: 11925,  rate: 0.10 },
  { min: 11925,   max: 48475,  rate: 0.12 },
  { min: 48475,   max: 103350, rate: 0.22 },
  { min: 103350,  max: 197300, rate: 0.24 },
  { min: 197300,  max: 250525, rate: 0.32 },
  { min: 250525,  max: 626350, rate: 0.35 },
  { min: 626350,  max: Infinity, rate: 0.37 },
];

export const MILESTONE_AGES = [
  { age: 55,   label: "Rule of 55",   desc: "Penalty-free 401(k) withdrawal if separated from employer", color: "#2563eb" },
  { age: 59.5, label: "Age 59½", desc: "No more 10% early withdrawal penalty on any account",       color: "#16a34a" },
  { age: 62,   label: "SS Earliest",  desc: "Earliest Social Security claiming (~30% reduction from FRA)", color: "#0891b2" },
  { age: 65,   label: "Medicare",     desc: "Medicare eligibility begins",                                color: "#7c3aed" },
  { age: 67,   label: "SS Full (FRA)", desc: "Full retirement age for Social Security (born 1960+)",      color: "#0891b2" },
  { age: 70,   label: "SS Maximum",   desc: "Maximum Social Security benefit (8%/yr increase stops)",    color: "#0891b2" },
  { age: 73,   label: "RMDs Begin",   desc: "Required Minimum Distributions start (born 1951-1959)",     color: "#dc2626" },
  { age: 75,   label: "RMDs Begin",   desc: "Required Minimum Distributions start (born 1960+)",         color: "#dc2626" },
];

export const ACCT_KEYS = ["trad401k", "roth401k", "rothIRA", "brokerage"];
export const ACCT_COLORS = {
  trad401k:  "#2563eb",
  roth401k:  "#0d9488",
  rothIRA:   "#16a34a",
  brokerage: "#9333ea",
};
export const ACCT_LABELS = {
  trad401k:  "Traditional 401(k)",
  roth401k:  "Roth 401(k)",
  rothIRA:   "Roth IRA",
  brokerage: "Brokerage",
};

// ─── Safe number helpers ──────────────────────────────────────────────────────
export const safeNum = (v, fb = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fb; };
export const clamp   = (v, lo, hi) => Math.min(Math.max(safeNum(v, lo), lo), hi);
export const safeBal = (v) => (!Number.isFinite(v) || v < 0) ? 0 : Math.min(v, MAX_BALANCE_CAP);

export function randNormal(mean, std) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function percentile(sorted, p) {
  const idx = Math.min(Math.floor(sorted.length * p), sorted.length - 1);
  return sorted[idx];
}

// ─── Tax helpers (with optional inflated brackets) ────────────────────────────
export function inflatedBrackets(yearInfl, base = TAX_BRACKETS_2025) {
  const f = Number.isFinite(yearInfl) && yearInfl > 0 ? yearInfl : 1;
  return base.map(b => ({
    min: b.min * f,
    max: b.max === Infinity ? Infinity : b.max * f,
    rate: b.rate,
  }));
}

export function calcTax(income, brackets = TAX_BRACKETS_2025) {
  const inc = safeNum(income); let tax = 0;
  for (const b of brackets) {
    if (inc <= b.min) break;
    tax += (Math.min(inc, b.max) - b.min) * b.rate;
  }
  return tax;
}

export function getMarginalRate(income, brackets = TAX_BRACKETS_2025) {
  const inc = safeNum(income);
  for (let i = brackets.length - 1; i >= 0; i--)
    if (inc > brackets[i].min) return brackets[i].rate;
  return brackets[0].rate;
}

// Returns the upper bound of the bracket that has the requested rate.
export function bracketTopForRate(rate, brackets = TAX_BRACKETS_2025) {
  const b = brackets.find(x => Math.abs(x.rate - rate) < 1e-9);
  return b ? b.max : Infinity;
}

// ─── Employer match ───────────────────────────────────────────────────────────
// Inputs:
//   income            — annual gross
//   matchPct          — match rate (e.g. 100 for 100%, 50 for 50%)
//   capPct            — match applies only to employee contribution up to this % of salary
//   employeeMonthly   — total employee 401(k) contribution per month (Trad + Roth)
// Returns annual employer match dollars.
export function computeEmployerMatch({ income, matchPct, capPct, employeeMonthly }) {
  const inc  = Math.max(0, safeNum(income));
  const mp   = Math.max(0, safeNum(matchPct))    / 100;
  const cap  = Math.max(0, safeNum(capPct))      / 100;
  const empAnnual = Math.max(0, safeNum(employeeMonthly)) * 12;
  if (inc <= 0 || mp <= 0 || cap <= 0) return 0;
  const empPctOfSalary = Math.min(cap, empAnnual / inc);
  return inc * mp * empPctOfSalary;
}

// ─── Withdrawal Strategy Engine ───────────────────────────────────────────────
// `balances` carries trad401k, roth401k, rothIRA, brokerage. Roth tier draws rothIRA before roth401k.
export function computeWithdrawalOrder(age, retirementAge, balances, birthYear) {
  const rmdAge = birthYear <= 1959 ? 73 : 75;
  const rule55 = retirementAge >= 55 && retirementAge < 59.5;

  const rothTier = (reasonRothIRA, reasonRoth401k) => {
    const out = [];
    if (balances.rothIRA  > 0) out.push({ key: "rothIRA",  reason: reasonRothIRA });
    if (balances.roth401k > 0) out.push({ key: "roth401k", reason: reasonRoth401k });
    return out;
  };

  if (age < 59.5) {
    const order = [];
    if (balances.brokerage > 0) order.push({ key: "brokerage", reason: "No age restrictions, favorable capital gains tax" });
    order.push(...rothTier(
      "Roth IRA contributions withdrawn tax & penalty-free (not earnings)",
      "Roth 401(k) — penalty-free for contributions only; earnings have restrictions before 59½",
    ));
    if (balances.trad401k > 0) {
      order.push(rule55
        ? { key: "trad401k", reason: "Rule of 55: penalty-free from employer plan" }
        : { key: "trad401k", reason: "10% penalty applies — avoid if possible" });
    }
    return { order, phase: "Early Retirement (before 59½)", note: retirementAge < 59.5 ? "Limited penalty-free access. Brokerage and Roth contributions are your primary sources." : "" };
  }
  if (age < rmdAge) {
    const order = [];
    if (balances.brokerage > 0) order.push({ key: "brokerage", reason: "Taxable first: capital gains rates, preserves tax-advantaged growth" });
    if (balances.trad401k > 0)  order.push({ key: "trad401k",  reason: "Tax-deferred second: fill low brackets before RMDs force larger withdrawals" });
    order.push(...rothTier(
      "Tax-free last: maximize decades of tax-free compounding",
      "Tax-free last: post-SECURE 2.0 Roth 401(k) has no lifetime RMDs",
    ));
    return { order, phase: "Tax Optimization Window (59½–RMDs)", note: "Consider Roth conversions to fill low brackets before RMDs begin." };
  }
  const order = [];
  if (balances.trad401k > 0)  order.push({ key: "trad401k",  reason: "RMDs required — must withdraw from tax-deferred accounts" });
  if (balances.brokerage > 0) order.push({ key: "brokerage", reason: "Supplement RMDs with taxable to manage bracket" });
  order.push(...rothTier(
    "No RMDs on Roth IRAs — use last for tax-free income",
    "No RMDs on Roth 401(k) (post-SECURE 2.0) — use last for tax-free income",
  ));
  return { order, phase: "RMD Phase (Required Distributions)", note: "401(k)/Traditional IRA RMDs are mandatory. Roth has no RMDs for the owner." };
}

// ─── Deterministic Projection ─────────────────────────────────────────────────
export function runProjection(params) {
  const {
    accounts, currentAge, retirementAge, lifeExpectancy,
    annualSpending, withdrawalMode, withdrawalRate,
    inflationRate, ssEnabled, ssMonthly, ssStartAge,
    pensionEnabled, pensionMonthly, pensionStartAge, birthYear,
    annualIncome = 0, employerMatchPct = 0, employerMatchCapPct = 0,
    rothConversionEnabled = false, rothConversionBracket = 0.12,
  } = params;

  const cAge = clamp(currentAge, 18, 100);
  const rAge = clamp(retirementAge, cAge + 1, 100);
  const lAge = clamp(lifeExpectancy, rAge + 1, 110);
  const infRate  = clamp(inflationRate, 0, 15);
  const spending = clamp(annualSpending, 0, INPUT_LIMITS.spending.max);
  const wRate    = clamp(withdrawalRate, INPUT_LIMITS.withdrawalRate.min, INPUT_LIMITS.withdrawalRate.max);
  const rmdAge   = birthYear <= 1959 ? 73 : 75;

  const getR = (acc) => {
    const p = RETURN_PRESETS[clamp(acc.returnPreset, 0, 3)];
    return (p.value ?? clamp(acc.customReturn, 0, 25)) / 100;
  };

  // Annual employer match (constant in nominal dollars, like other inputs)
  const employeeMonthly =
    safeNum(accounts.trad401k.monthly) + safeNum(accounts.roth401k.monthly);
  const employerAnnualMatch = computeEmployerMatch({
    income: annualIncome,
    matchPct: employerMatchPct,
    capPct: employerMatchCapPct,
    employeeMonthly,
  });
  const employerMonthlyMatch = employerAnnualMatch / 12;

  const data = [];
  const bal = {
    trad401k:  safeBal(accounts.trad401k.balance),
    roth401k:  safeBal(accounts.roth401k.balance),
    rothIRA:   safeBal(accounts.rothIRA.balance),
    brokerage: safeBal(accounts.brokerage.balance),
  };

  for (let age = cAge; age <= lAge; age++) {
    const isRetired = age >= rAge;
    const yearInfl  = Math.pow(1 + infRate / 100, age - cAge);
    const yrBrackets = inflatedBrackets(yearInfl);

    for (const k of ACCT_KEYS) {
      const mr = getR(accounts[k]) / 12;
      for (let m = 0; m < 12; m++) {
        bal[k] *= (1 + mr);
        if (!isRetired) {
          bal[k] += clamp(accounts[k].monthly, 0, 50000);
          if (k === "trad401k") bal[k] += employerMonthlyMatch;
        }
        bal[k] = safeBal(bal[k]);
      }
    }

    const total     = bal.trad401k + bal.roth401k + bal.rothIRA + bal.brokerage;
    const ssAnnual  = ssEnabled && age >= ssStartAge ? safeNum(ssMonthly) * 12 * yearInfl : 0;
    const penAnnual = pensionEnabled && age >= pensionStartAge ? safeNum(pensionMonthly) * 12 : 0;
    const income    = ssAnnual + penAnnual;

    const yearW = { trad401k: 0, roth401k: 0, rothIRA: 0, brokerage: 0 };
    let strategy = null;

    // Roth conversion runs BEFORE spending withdrawals so that trad401k
    // spending draws don't eat the bracket headroom.  Baseline = only
    // fixed income (SS + pension) since spending withdrawals haven't happened yet.
    let conversion = 0, conversionTax = 0, conversionTaxFromBrokerage = 0;
    const inWindow = isRetired && age < rmdAge;
    if (rothConversionEnabled && inWindow && bal.trad401k > 0) {
      const baseline   = penAnnual + 0.85 * ssAnnual;
      const bracketTop = bracketTopForRate(rothConversionBracket, yrBrackets);
      const headroom   = Math.max(0, bracketTop - baseline);
      conversion = Math.min(headroom, bal.trad401k);
      if (conversion > 0) {
        conversionTax = Math.max(
          0,
          calcTax(baseline + conversion, yrBrackets) - calcTax(baseline, yrBrackets)
        );
        // Pay tax: brokerage first, fallback net from conversion
        if (bal.brokerage >= conversionTax) {
          conversionTaxFromBrokerage = conversionTax;
          bal.brokerage = safeBal(bal.brokerage - conversionTax);
          bal.trad401k  = safeBal(bal.trad401k - conversion);
          bal.rothIRA   = safeBal(bal.rothIRA + conversion);
        } else {
          conversionTaxFromBrokerage = bal.brokerage;
          const shortfall = conversionTax - bal.brokerage;
          bal.brokerage = 0;
          bal.trad401k  = safeBal(bal.trad401k - conversion);
          bal.rothIRA   = safeBal(bal.rothIRA + Math.max(0, conversion - shortfall));
        }
      }
    }

    if (isRetired) {
      const target = withdrawalMode === "rate"
        ? total * (wRate / 100)
        : Math.max(0, spending * yearInfl - income);
      const needed = Math.max(0, withdrawalMode === "rate" ? target - income : target);

      strategy = computeWithdrawalOrder(age, rAge, { ...bal }, birthYear);
      let rem = needed;
      for (const { key } of strategy.order) {
        if (rem <= 0) break;
        const take = Math.min(rem, Math.max(0, bal[key]));
        bal[key]    = safeBal(bal[key] - take);
        yearW[key]  = take;
        rem -= take;
      }
    }

    const taxableInc = yearW.trad401k + penAnnual + ssAnnual * 0.85 + conversion;
    data.push({
      age,
      trad401k:  Math.max(0, Math.round(safeBal(bal.trad401k))),
      roth401k:  Math.max(0, Math.round(safeBal(bal.roth401k))),
      rothIRA:   Math.max(0, Math.round(safeBal(bal.rothIRA))),
      brokerage: Math.max(0, Math.round(safeBal(bal.brokerage))),
      Total:     Math.max(0, Math.round(safeBal(bal.trad401k + bal.roth401k + bal.rothIRA + bal.brokerage))),
      ssIncome:  Math.round(safeNum(ssAnnual)),
      pensionIncome: Math.round(safeNum(penAnnual)),
      wTrad401k: Math.round(yearW.trad401k),
      wRoth401k: Math.round(yearW.roth401k),
      wRothIRA:  Math.round(yearW.rothIRA),
      wBrokerage: Math.round(yearW.brokerage),
      wTotal:    Math.round(yearW.trad401k + yearW.roth401k + yearW.rothIRA + yearW.brokerage),
      conversion: Math.round(conversion),
      conversionTax: Math.round(conversionTax),
      conversionTaxFromBrokerage: Math.round(conversionTaxFromBrokerage),
      employerMatchAnnual: isRetired ? 0 : Math.round(employerAnnualMatch),
      estTax:    Math.round(calcTax(taxableInc, yrBrackets)),
      marginalRate: getMarginalRate(taxableInc, yrBrackets),
      strategy,
    });
  }
  return data;
}

// ─── Monte Carlo Simulation ───────────────────────────────────────────────────
export function runMonteCarlo(params) {
  const {
    accounts, retirementBalance, retirementAge, lifeExpectancy,
    annualSpending, withdrawalMode, withdrawalRate,
    inflationRate, ssEnabled, ssMonthly, ssStartAge,
    pensionEnabled, pensionMonthly, pensionStartAge,
  } = params;

  const rAge  = clamp(retirementAge, 18, 100);
  const lAge  = clamp(lifeExpectancy, rAge + 1, 110);
  const years = lAge - rAge;

  const accts = ACCT_KEYS.map(k => ({
    bal: retirementBalance[k] || 0,
    preset: accounts[k].returnPreset,
    custom: accounts[k].customReturn,
  }));
  const totalBal = accts.reduce((s, a) => s + a.bal, 0);
  const weight   = (b) => (totalBal > 0 ? b / totalBal : 1 / accts.length);

  const getAcctReturn = (a) => {
    const p = RETURN_PRESETS[clamp(a.preset, 0, 3)];
    return (p.value ?? clamp(a.custom, 0, 25)) / 100;
  };
  const blendedMean = accts.reduce((s, a) => s + weight(a.bal) * getAcctReturn(a), 0);
  const blendedVol  = accts.reduce((s, a) => s + weight(a.bal) * VOLATILITY_BY_PRESET[clamp(a.preset, 0, 3)], 0);

  const wRate    = clamp(withdrawalRate, 0.1, 20);
  const spending = clamp(annualSpending, 0, INPUT_LIMITS.spending.max);
  const infRate  = clamp(inflationRate, 0, 15);

  let successCount = 0;
  const ageData = Array.from({ length: years + 1 }, (_, i) => ({ age: rAge + i, vals: [] }));

  for (let sim = 0; sim < MC_SIMULATIONS; sim++) {
    let bal = Math.max(0, totalBal);
    let depleted = false;
    for (let y = 0; y <= years; y++) {
      const age      = rAge + y;
      const annRet   = randNormal(blendedMean, blendedVol);
      const yearInfl = Math.pow(1 + infRate / 100, y);
      const ssAnnual  = ssEnabled && age >= ssStartAge ? safeNum(ssMonthly) * 12 * yearInfl : 0;
      const penAnnual = pensionEnabled && age >= pensionStartAge ? safeNum(pensionMonthly) * 12 : 0;
      const inc = ssAnnual + penAnnual;

      bal = safeBal(bal * (1 + annRet));
      const withdraw = withdrawalMode === "rate"
        ? Math.max(0, bal * (wRate / 100) - inc)
        : Math.max(0, spending * yearInfl - inc);
      bal = safeBal(bal - withdraw);
      if (bal <= 0 && !depleted) depleted = true;
      ageData[y].vals.push(bal);
    }
    if (!depleted) successCount++;
  }

  const successRate = (successCount / MC_SIMULATIONS) * 100;
  const fanData = ageData.map(({ age, vals }) => {
    const sorted = [...vals].sort((a, b) => a - b);
    return {
      age,
      p10: percentile(sorted, 0.10),
      p25: percentile(sorted, 0.25),
      p50: percentile(sorted, 0.50),
      p75: percentile(sorted, 0.75),
      p90: percentile(sorted, 0.90),
    };
  });
  return { successRate, fanData, blendedMean, blendedVol, numSims: MC_SIMULATIONS };
}
