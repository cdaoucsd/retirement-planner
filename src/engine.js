// ─── Constants ────────────────────────────────────────────────────────────────
// Presets are stock/bond allocations; expected return & volatility derive from
// MARKET_ASSUMPTIONS. "Custom" = manual stock % or a raw return escape hatch.
export const RETURN_PRESETS = [
  { id: "conservative", label: "Conservative (30/70)", stockPct: 30 },
  { id: "moderate",     label: "Moderate (60/40)",     stockPct: 60 },
  { id: "aggressive",   label: "Aggressive (90/10)",   stockPct: 90 },
  { id: "custom",       label: "Custom",               stockPct: null },
];

// Annual % — editable in Settings, passed to the engine as `marketAssumptions`
export const MARKET_ASSUMPTIONS = {
  stockReturn: 9.5, stockVol: 17,
  bondReturn: 4.5,  bondVol: 5.5,
};

// Fallback volatility for raw-return custom accounts (no allocation to derive from)
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

export const MFJ_TAX_BRACKETS_2025 = [
  { min: 0,       max: 23850,  rate: 0.10 },
  { min: 23850,   max: 96950,  rate: 0.12 },
  { min: 96950,   max: 206700, rate: 0.22 },
  { min: 206700,  max: 394600, rate: 0.24 },
  { min: 394600,  max: 501050, rate: 0.32 },
  { min: 501050,  max: 751600, rate: 0.35 },
  { min: 751600,  max: Infinity, rate: 0.37 },
];

export const STANDARD_DEDUCTION_2025 = { single: 15000, mfj: 30000 };

// Long-term capital gains brackets (taxable income thresholds, 2025)
export const LTCG_BRACKETS_2025 = {
  single: [
    { min: 0,      max: 48350,   rate: 0 },
    { min: 48350,  max: 533400,  rate: 0.15 },
    { min: 533400, max: Infinity, rate: 0.20 },
  ],
  mfj: [
    { min: 0,      max: 96700,   rate: 0 },
    { min: 96700,  max: 600050,  rate: 0.15 },
    { min: 600050, max: Infinity, rate: 0.20 },
  ],
};

// IRS Uniform Lifetime Table (2022+), Pub 590-B — age → distribution period
export const UNIFORM_LIFETIME_TABLE = {
  72: 27.4, 73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1,
  80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2, 87: 14.4,
  88: 13.7, 89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1, 94: 9.5, 95: 8.9,
  96: 8.4, 97: 7.8, 98: 7.3, 99: 6.8, 100: 6.4, 101: 6.0, 102: 5.6, 103: 5.2,
  104: 4.9, 105: 4.6, 106: 4.3, 107: 4.1, 108: 3.9, 109: 3.7, 110: 3.5,
};

// 2025 employee elective deferral limits
export const CONTRIB_LIMITS_2025 = {
  k401: 23500, k401CatchUp50: 7500, k401CatchUp60to63: 11250,
  ira: 7000, iraCatchUp50: 1000,
};

export function contributionLimit401k(age) {
  const a = safeNum(age);
  if (a >= 60 && a <= 63) return CONTRIB_LIMITS_2025.k401 + CONTRIB_LIMITS_2025.k401CatchUp60to63;
  if (a >= 50) return CONTRIB_LIMITS_2025.k401 + CONTRIB_LIMITS_2025.k401CatchUp50;
  return CONTRIB_LIMITS_2025.k401;
}

export function contributionLimitIRA(age) {
  return safeNum(age) >= 50
    ? CONTRIB_LIMITS_2025.ira + CONTRIB_LIMITS_2025.iraCatchUp50
    : CONTRIB_LIMITS_2025.ira;
}

export const MILESTONE_AGES = [
  { age: 55,   label: "Rule of 55",   desc: "Penalty-free 401(k) withdrawal if separated from employer", color: "#3D5A80" },
  { age: 59.5, label: "Age 59½", desc: "No more 10% early withdrawal penalty on any account",       color: "#2E6E5E" },
  { age: 62,   label: "SS Earliest",  desc: "Earliest Social Security claiming (~30% reduction from FRA)", color: "#46708C" },
  { age: 65,   label: "Medicare",     desc: "Medicare eligibility begins",                                color: "#6D5A8C" },
  { age: 67,   label: "SS Full (FRA)", desc: "Full retirement age for Social Security (born 1960+)",      color: "#46708C" },
  { age: 70,   label: "SS Maximum",   desc: "Maximum Social Security benefit (8%/yr increase stops)",    color: "#46708C" },
  { age: 73,   label: "RMDs Begin",   desc: "Required Minimum Distributions start (born 1951-1959)",     color: "#B3402F" },
  { age: 75,   label: "RMDs Begin",   desc: "Required Minimum Distributions start (born 1960+)",         color: "#B3402F" },
];

export const ACCT_KEYS = ["trad401k", "roth401k", "rothIRA", "brokerage"];
export const ACCT_COLORS = {
  trad401k:  "#3D5A80",
  roth401k:  "#2E6E5E",
  rothIRA:   "#6FA287",
  brokerage: "#B4642D",
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

// ─── Asset allocation & glide path ────────────────────────────────────────────
// Blended annual return (decimal) for a stock/bond split.
export function allocReturn(stockPct, m = MARKET_ASSUMPTIONS) {
  const s = clamp(stockPct, 0, 100) / 100;
  return (s * safeNum(m.stockReturn) + (1 - s) * safeNum(m.bondReturn)) / 100;
}

// Blended annual volatility (decimal) for a stock/bond split.
export function allocVol(stockPct, m = MARKET_ASSUMPTIONS) {
  const s = clamp(stockPct, 0, 100) / 100;
  return (s * safeNum(m.stockVol) + (1 - s) * safeNum(m.bondVol)) / 100;
}

// Current stock % for an account, or null when it uses a raw custom return.
export function accountStockPct(acc) {
  const preset = clamp(acc.returnPreset ?? 1, 0, 3);
  if (preset < 3) return RETURN_PRESETS[preset].stockPct;
  if (acc.customMode === "alloc") return clamp(acc.stockPct ?? 60, 0, 100);
  return null;
}

// Stock % after `yearsFromNow` years of gliding (1 stock-pt per year, floored).
export function stockPctAtYear(acc, yearsFromNow) {
  const base = accountStockPct(acc);
  if (base == null) return null;
  if (!acc.glide) return base;
  const floor = Math.min(base, clamp(acc.glideFloor ?? 30, 0, 100));
  return Math.max(floor, base - Math.max(0, safeNum(yearsFromNow)));
}

export function accountReturnAtYear(acc, yearsFromNow, m = MARKET_ASSUMPTIONS) {
  const sp = stockPctAtYear(acc, yearsFromNow);
  if (sp == null) return clamp(acc.customReturn, 0, 25) / 100;
  return allocReturn(sp, m);
}

export function accountVolAtYear(acc, yearsFromNow, m = MARKET_ASSUMPTIONS) {
  const sp = stockPctAtYear(acc, yearsFromNow);
  if (sp == null) return VOLATILITY_BY_PRESET[3];
  return allocVol(sp, m);
}

// ─── Social Security claiming ─────────────────────────────────────────────────
// Benefit as a fraction of the FRA (age-67) benefit, per SSA reduction/credit schedule.
export const SS_CLAIM_FACTORS = {
  62: 0.70, 63: 0.75, 64: 0.80, 65: 0.8667, 66: 0.9333,
  67: 1.0, 68: 1.08, 69: 1.16, 70: 1.24,
};

export function ssClaimFactor(claimAge) {
  const a = clamp(Math.round(safeNum(claimAge, 67)), 62, 70);
  return SS_CLAIM_FACTORS[a];
}

// Age at which claiming later overtakes claiming earlier (today's dollars).
export function ssBreakEvenAge(earlyAge, lateAge) {
  const f1 = ssClaimFactor(earlyAge), f2 = ssClaimFactor(lateAge);
  if (f2 <= f1) return Infinity;
  return (f2 * lateAge - f1 * earlyAge) / (f2 - f1);
}

// ─── Spending phases (go-go / slow-go / no-go) ────────────────────────────────
export function spendingMultiplier(age, phases) {
  if (!phases?.enabled) return 1;
  if (age >= safeNum(phases.noGoAge, Infinity))   return clamp(phases.noGoPct, 0, 200) / 100;
  if (age >= safeNum(phases.slowGoAge, Infinity)) return clamp(phases.slowGoPct, 0, 200) / 100;
  return 1;
}

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

// Required Minimum Distribution for the year, per the Uniform Lifetime Table.
export function computeRMD(balance, age) {
  const bal = safeNum(balance);
  const a = Math.min(Math.floor(safeNum(age)), 110);
  const divisor = UNIFORM_LIFETIME_TABLE[a];
  if (!divisor || bal <= 0) return 0;
  return bal / divisor;
}

// LTCG tax on `gains` stacked on top of `ordinaryTaxable` income.
export function calcLTCGTax(gains, ordinaryTaxable, brackets = LTCG_BRACKETS_2025.single) {
  const start = Math.max(0, safeNum(ordinaryTaxable));
  const end = start + Math.max(0, safeNum(gains));
  let tax = 0;
  for (const b of brackets) {
    const lo = Math.max(b.min, start);
    const hi = Math.min(b.max, end);
    if (hi > lo) tax += (hi - lo) * b.rate;
  }
  return tax;
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
    filingStatus = 'single',
    marketAssumptions = MARKET_ASSUMPTIONS,
    spendingPhases = null,
  } = params;

  const baseBrackets = filingStatus === 'mfj' ? MFJ_TAX_BRACKETS_2025 : TAX_BRACKETS_2025;
  const stdDed = filingStatus === 'mfj' ? STANDARD_DEDUCTION_2025.mfj : STANDARD_DEDUCTION_2025.single;
  const baseLtcgBrackets = filingStatus === 'mfj' ? LTCG_BRACKETS_2025.mfj : LTCG_BRACKETS_2025.single;

  const cAge = clamp(currentAge, 18, 100);
  const rAge = clamp(retirementAge, cAge + 1, 100);
  const lAge = clamp(lifeExpectancy, rAge + 1, 110);
  const infRate  = clamp(inflationRate, 0, 15);
  const spending = clamp(annualSpending, 0, INPUT_LIMITS.spending.max);
  const wRate    = clamp(withdrawalRate, INPUT_LIMITS.withdrawalRate.min, INPUT_LIMITS.withdrawalRate.max);
  const rmdAge   = birthYear <= 1959 ? 73 : 75;

  const getR = (acc, yearsFromNow) => accountReturnAtYear(acc, yearsFromNow, marketAssumptions);

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

  // Contribution / conversion basis tracking (separate from total balances)
  let trad401kContribBasis = 0;                   // employee contributions going forward
  let trad401kMatchBasis   = 0;                   // employer match going forward
  let roth401kContribBasis = safeBal(accounts.roth401k.contribBasis ?? accounts.roth401k.balance);
  let rothIRAContribBasis  = safeBal(accounts.rothIRA.contribBasis  ?? accounts.rothIRA.balance);
  let rothIRAConvsByAge    = [];                   // [{ age, amount }] — one entry per conversion year
  let brokerageBasis       = safeBal(accounts.brokerage.costBasis ?? accounts.brokerage.balance);

  // Sell from brokerage: reduces balance and basis pro-rata, returns realized gain.
  const sellBrokerage = (amount) => {
    const pre = bal.brokerage;
    const take = Math.min(Math.max(0, amount), Math.max(0, pre));
    if (take <= 0 || pre <= 0) return { take: 0, gain: 0 };
    const basisRatio = Math.min(1, Math.max(0, brokerageBasis / pre));
    const gain = take * (1 - basisRatio);
    brokerageBasis = Math.max(0, brokerageBasis - take * basisRatio);
    bal.brokerage = safeBal(pre - take);
    return { take, gain };
  };

  for (let age = cAge; age <= lAge; age++) {
    const isRetired = age >= rAge;
    const yearInfl      = Math.pow(1 + infRate / 100, age - cAge);
    const yrBrackets    = inflatedBrackets(yearInfl, baseBrackets);
    const stdDedInflated = stdDed * yearInfl;

    for (const k of ACCT_KEYS) {
      const mr = getR(accounts[k], age - cAge) / 12;
      for (let m = 0; m < 12; m++) {
        bal[k] *= (1 + mr);
        if (!isRetired) {
          bal[k] += clamp(accounts[k].monthly, 0, 50000);
          if (k === "trad401k") bal[k] += employerMonthlyMatch;
        }
        bal[k] = safeBal(bal[k]);
      }
    }

    // Track annual contribution amounts added to basis (accumulation years only)
    if (!isRetired) {
      trad401kContribBasis += clamp(accounts.trad401k.monthly, 0, 50000) * 12;
      trad401kMatchBasis   += employerAnnualMatch;
      roth401kContribBasis += clamp(accounts.roth401k.monthly, 0, 50000) * 12;
      rothIRAContribBasis  += clamp(accounts.rothIRA.monthly,  0, 50000) * 12;
      brokerageBasis       += clamp(accounts.brokerage.monthly, 0, 50000) * 12;
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
    let realizedGains = 0;
    const inWindow = isRetired && age < rmdAge;
    if (rothConversionEnabled && inWindow && bal.trad401k > 0) {
      const baseline   = penAnnual + 0.85 * ssAnnual;
      const bracketTop = bracketTopForRate(rothConversionBracket, yrBrackets);
      // bracketTop is taxable-income ceiling; add standard deduction to get gross-income ceiling
      const headroom   = Math.max(0, bracketTop + stdDedInflated - baseline);
      conversion = Math.min(headroom, bal.trad401k);
      if (conversion > 0) {
        // Standard deduction applies to total gross income, not split per source.
        const taxableWithConv = Math.max(0, baseline + conversion - stdDedInflated);
        const taxableBaseline = Math.max(0, baseline - stdDedInflated);
        conversionTax = Math.max(
          0,
          calcTax(taxableWithConv, yrBrackets) - calcTax(taxableBaseline, yrBrackets)
        );
        const rothIRABefore = bal.rothIRA;
        // Pay tax: brokerage first (realizing gains), fallback net from conversion
        const { take: paidFromBrokerage, gain: convGain } = sellBrokerage(conversionTax);
        realizedGains += convGain;
        conversionTaxFromBrokerage = paidFromBrokerage;
        const shortfall = conversionTax - paidFromBrokerage;
        bal.trad401k = safeBal(bal.trad401k - conversion);
        bal.rothIRA  = safeBal(bal.rothIRA + Math.max(0, conversion - shortfall));
        // Record net amount that landed in Roth IRA for the 5-year rule
        const netToRoth = bal.rothIRA - rothIRABefore;
        if (netToRoth > 0) rothIRAConvsByAge.push({ age, amount: netToRoth });
      }
    }

    let rmdRequired = 0, rmdExcess = 0;
    if (isRetired) {
      const target = withdrawalMode === "rate"
        ? total * (wRate / 100)
        : Math.max(0, spending * spendingMultiplier(age, spendingPhases) * yearInfl - income);
      const needed = Math.max(0, withdrawalMode === "rate" ? target - income : target);

      strategy = computeWithdrawalOrder(age, rAge, { ...bal }, birthYear);
      let rem = needed;

      // Forced RMD comes off the top: withdrawn from trad401k regardless of
      // spending need; anything beyond the need is reinvested into brokerage.
      if (age >= rmdAge && bal.trad401k > 0) {
        rmdRequired = Math.min(computeRMD(bal.trad401k, age), bal.trad401k);
        if (rmdRequired > 0) {
          bal.trad401k = safeBal(bal.trad401k - rmdRequired);
          yearW.trad401k += rmdRequired;
          const usedForSpending = Math.min(rem, rmdRequired);
          rem -= usedForSpending;
          rmdExcess = rmdRequired - usedForSpending;
          if (rmdExcess > 0) {
            bal.brokerage  = safeBal(bal.brokerage + rmdExcess);
            brokerageBasis += rmdExcess;
          }
        }
      }

      for (const { key } of strategy.order) {
        if (rem <= 0) break;
        if (key === "brokerage") {
          const { take, gain } = sellBrokerage(rem);
          yearW.brokerage += take;
          realizedGains   += gain;
          rem -= take;
        } else {
          const take = Math.min(rem, Math.max(0, bal[key]));
          bal[key]    = safeBal(bal[key] - take);
          yearW[key] += take;
          rem -= take;
        }
      }
    }

    // Apply IRS ordering rules to Roth IRA withdrawal to detect penalty risk
    let rothIRAPenaltyRiskAmt = 0;
    if (yearW.rothIRA > 0) {
      let rem = yearW.rothIRA;

      // Layer 1: contributions — always penalty-free at any age
      const fromContribs = Math.min(rem, rothIRAContribBasis);
      rothIRAContribBasis -= fromContribs;
      rem -= fromContribs;

      // Layer 2: mature conversions (≥5 yrs old) — penalty-free
      const matureConvs = rothIRAConvsByAge
        .filter(c => age - c.age >= 5)
        .sort((a, b) => a.age - b.age);
      for (const conv of matureConvs) {
        if (rem <= 0) break;
        const take = Math.min(rem, conv.amount);
        conv.amount -= take;
        rem -= take;
      }

      // Layer 3: pending conversions (<5 yrs old) — 10% penalty before 59½
      const pendingConvs = rothIRAConvsByAge
        .filter(c => age - c.age < 5)
        .sort((a, b) => a.age - b.age);
      let fromPendingConv = 0;
      for (const conv of pendingConvs) {
        if (rem <= 0) break;
        const take = Math.min(rem, conv.amount);
        fromPendingConv += take;
        conv.amount -= take;
        rem -= take;
      }

      // Layer 4: earnings — 10% penalty before 59½
      const fromEarnings = rem;

      if (age < 59.5) rothIRAPenaltyRiskAmt = fromPendingConv + fromEarnings;

      // Prune exhausted entries
      rothIRAConvsByAge = rothIRAConvsByAge.filter(c => c.amount > 0);
    }

    // Per-year Roth IRA breakdown (for display)
    const matureConvBasis  = rothIRAConvsByAge.filter(c => age - c.age >= 5).reduce((s, c) => s + c.amount, 0);
    const pendingConvBasis = rothIRAConvsByAge.filter(c => age - c.age <  5).reduce((s, c) => s + c.amount, 0);
    const rothIRAEarnings  = Math.max(0, bal.rothIRA - rothIRAContribBasis - matureConvBasis - pendingConvBasis);
    const trad401kGrowth   = Math.max(0, bal.trad401k - trad401kContribBasis - trad401kMatchBasis);
    const roth401kGrowth   = Math.max(0, bal.roth401k - roth401kContribBasis);

    const grossInc   = yearW.trad401k + penAnnual + ssAnnual * 0.85 + conversion;
    const taxableInc = Math.max(0, grossInc - stdDedInflated);
    // Standard deduction left over after ordinary income shelters LTCG first
    const leftoverDed   = Math.max(0, stdDedInflated - grossInc);
    const taxableGains  = Math.max(0, realizedGains - leftoverDed);
    const yrLtcgBrackets = inflatedBrackets(yearInfl, baseLtcgBrackets);
    const ltcgTax = calcLTCGTax(taxableGains, taxableInc, yrLtcgBrackets);
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
      rmdRequired: Math.round(rmdRequired),
      rmdExcess:   Math.round(rmdExcess),
      capGains:    Math.round(realizedGains),
      ltcgTax:     Math.round(ltcgTax),
      brokerageBasis: Math.round(brokerageBasis),
      estTax:    Math.round(calcTax(taxableInc, yrBrackets) + ltcgTax),
      marginalRate: getMarginalRate(taxableInc, yrBrackets),
      // Basis / breakdown fields
      trad401kContribBasis: Math.round(trad401kContribBasis),
      trad401kMatchBasis:   Math.round(trad401kMatchBasis),
      trad401kGrowth:       Math.round(trad401kGrowth),
      roth401kContribBasis: Math.round(roth401kContribBasis),
      roth401kGrowth:       Math.round(roth401kGrowth),
      rothIRAContribBasis:  Math.round(rothIRAContribBasis),
      rothIRAConvMature:    Math.round(matureConvBasis),
      rothIRAConvPending:   Math.round(pendingConvBasis),
      rothIRAEarnings:      Math.round(rothIRAEarnings),
      rothIRAEarlyPenaltyRisk: rothIRAPenaltyRiskAmt > 0,
      rothIRAPenaltyRiskAmt:  Math.round(rothIRAPenaltyRiskAmt),
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
    currentAge, marketAssumptions = MARKET_ASSUMPTIONS,
    spendingPhases = null,
  } = params;

  const rAge  = clamp(retirementAge, 18, 100);
  const lAge  = clamp(lifeExpectancy, rAge + 1, 110);
  const years = lAge - rAge;
  const cAge  = clamp(currentAge ?? rAge, 18, rAge); // glide anchor

  const accts = ACCT_KEYS.map(k => ({
    bal: retirementBalance[k] || 0,
    acc: accounts[k],
  }));
  const totalBal = accts.reduce((s, a) => s + a.bal, 0);
  const weight   = (b) => (totalBal > 0 ? b / totalBal : 1 / accts.length);

  // Per-year blended mean/vol — glide paths keep de-risking through retirement.
  // Weights stay fixed at the retirement-date mix.
  const yearMV = Array.from({ length: years + 1 }, (_, y) => {
    const yearsFromNow = (rAge - cAge) + y;
    return {
      mean: accts.reduce((s, a) => s + weight(a.bal) * accountReturnAtYear(a.acc, yearsFromNow, marketAssumptions), 0),
      vol:  accts.reduce((s, a) => s + weight(a.bal) * accountVolAtYear(a.acc, yearsFromNow, marketAssumptions), 0),
    };
  });
  const blendedMean = yearMV[0].mean;
  const blendedVol  = yearMV[0].vol;

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
      const annRet   = randNormal(yearMV[y].mean, yearMV[y].vol);
      const yearInfl = Math.pow(1 + infRate / 100, y);
      const ssAnnual  = ssEnabled && age >= ssStartAge ? safeNum(ssMonthly) * 12 * yearInfl : 0;
      const penAnnual = pensionEnabled && age >= pensionStartAge ? safeNum(pensionMonthly) * 12 : 0;
      const inc = ssAnnual + penAnnual;

      bal = safeBal(bal * (1 + annRet));
      const withdraw = withdrawalMode === "rate"
        ? Math.max(0, bal * (wRate / 100) - inc)
        : Math.max(0, spending * spendingMultiplier(age, spendingPhases) * yearInfl - inc);
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
