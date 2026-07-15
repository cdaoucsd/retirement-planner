import { describe, it, expect } from "vitest";
import {
  calcTax, getMarginalRate, inflatedBrackets, bracketTopForRate,
  TAX_BRACKETS_2025,
  computeEmployerMatch,
  computeWithdrawalOrder,
  runProjection,
  runMonteCarlo,
  computeRMD,
  calcLTCGTax, LTCG_BRACKETS_2025,
  STATE_TAX_2025,
  contributionLimit401k, contributionLimitIRA,
  MARKET_ASSUMPTIONS, allocReturn, allocVol,
  accountStockPct, stockPctAtYear, accountReturnAtYear, accountVolAtYear,
  ssClaimFactor, ssBreakEvenAge, spendingMultiplier,
} from "../engine.js";

const ACC = (overrides = {}) => ({ balance: 0, monthly: 0, returnPreset: 0, customReturn: 7, ...overrides });
// returnPreset 0 = 4% conservative; force 0% via custom preset
const ZERO_RET = { returnPreset: 3, customReturn: 0 };
const SEVEN = { returnPreset: 1, customReturn: 7 };

const baseAccounts = ({ trad = {}, roth401k = {}, rothIRA = {}, brokerage = {} } = {}) => ({
  trad401k:  ACC({ ...ZERO_RET, ...trad }),
  roth401k:  ACC({ ...ZERO_RET, ...roth401k }),
  rothIRA:   ACC({ ...ZERO_RET, ...rothIRA }),
  brokerage: ACC({ ...ZERO_RET, ...brokerage }),
});

const baseParams = (overrides = {}) => ({
  accounts: baseAccounts(),
  currentAge: 35,
  retirementAge: 65,
  lifeExpectancy: 90,
  annualSpending: 0,
  withdrawalMode: "fixed",
  withdrawalRate: 4,
  inflationRate: 0,
  ssEnabled: false, ssMonthly: 0, ssStartAge: 67,
  pensionEnabled: false, pensionMonthly: 0, pensionStartAge: 65,
  birthYear: 1990,
  annualIncome: 0, employerMatchPct: 0, employerMatchCapPct: 0,
  rothConversionEnabled: false, rothConversionBracket: 0.12,
  ...overrides,
});

// ─── Tax + brackets ────────────────────────────────────────────────────────────
describe("calcTax", () => {
  it("returns 0 for $0 income", () => {
    expect(calcTax(0)).toBe(0);
  });
  it("computes top of 10% bracket exactly", () => {
    expect(calcTax(11925)).toBeCloseTo(1192.5, 2);
  });
  it("computes mid 22% bracket", () => {
    // 1192.50 + (48475-11925)*0.12 + (50000-48475)*0.22 = 1192.5 + 4386 + 335.5 = 5914
    expect(calcTax(50000)).toBeCloseTo(5914, 0);
  });
  it("scales linearly when brackets are scaled (homogeneity)", () => {
    // $100K with 2x-inflated brackets is the same relative position as $50K with base brackets
    // → tax should be exactly 2× the base tax on $50K (proportional doubling)
    const inflated = inflatedBrackets(2.0);
    expect(calcTax(100000, inflated)).toBeCloseTo(2 * calcTax(50000), 2);
  });
});

describe("getMarginalRate", () => {
  it("returns 22% at $50K", () => {
    expect(getMarginalRate(50000)).toBe(0.22);
  });
  it("returns 10% near $0", () => {
    expect(getMarginalRate(5000)).toBe(0.10);
  });
});

describe("inflatedBrackets", () => {
  it("doubles thresholds at factor 2", () => {
    const inf = inflatedBrackets(2);
    expect(inf[0].max).toBe(TAX_BRACKETS_2025[0].max * 2);
    expect(inf[1].min).toBe(TAX_BRACKETS_2025[1].min * 2);
    expect(inf[inf.length - 1].max).toBe(Infinity);
  });
  it("returns base when factor invalid", () => {
    expect(inflatedBrackets(0)[0].max).toBe(TAX_BRACKETS_2025[0].max);
  });
});

describe("bracketTopForRate", () => {
  it("finds the 12% bracket ceiling", () => {
    expect(bracketTopForRate(0.12)).toBe(48475);
  });
  it("finds the 22% bracket ceiling", () => {
    expect(bracketTopForRate(0.22)).toBe(103350);
  });
});

// ─── Employer match ───────────────────────────────────────────────────────────
describe("computeEmployerMatch", () => {
  it("100% match up to 6%, employee at 6% → 6% of salary", () => {
    expect(computeEmployerMatch({ income: 120000, matchPct: 100, capPct: 6, employeeMonthly: 600 }))
      .toBeCloseTo(7200, 2);
  });
  it("50% match up to 6%, employee at 6% → 3% of salary", () => {
    expect(computeEmployerMatch({ income: 120000, matchPct: 50, capPct: 6, employeeMonthly: 600 }))
      .toBeCloseTo(3600, 2);
  });
  it("employee at 3%, cap 6% → match calculated on 3% (not 6%)", () => {
    expect(computeEmployerMatch({ income: 120000, matchPct: 100, capPct: 6, employeeMonthly: 300 }))
      .toBeCloseTo(3600, 2);
  });
  it("employee at 10%, cap 6% → match capped at 6% of salary", () => {
    expect(computeEmployerMatch({ income: 120000, matchPct: 100, capPct: 6, employeeMonthly: 1000 }))
      .toBeCloseTo(7200, 2);
  });
  it("zero income → 0", () => {
    expect(computeEmployerMatch({ income: 0, matchPct: 100, capPct: 6, employeeMonthly: 600 })).toBe(0);
  });
  it("zero match pct → 0", () => {
    expect(computeEmployerMatch({ income: 120000, matchPct: 0, capPct: 6, employeeMonthly: 600 })).toBe(0);
  });
});

// ─── Withdrawal order ─────────────────────────────────────────────────────────
describe("computeWithdrawalOrder", () => {
  it("age 50, retired 50, all balances → brokerage, roth tier, trad with penalty", () => {
    const r = computeWithdrawalOrder(50, 50, { trad401k: 100, roth401k: 100, rothIRA: 100, brokerage: 100 }, 1990);
    expect(r.order.map(o => o.key)).toEqual(["brokerage", "rothIRA", "roth401k", "trad401k"]);
    expect(r.order[3].reason).toMatch(/penalty/);
  });
  it("rule of 55 active when retired 55–59½", () => {
    const r = computeWithdrawalOrder(56, 55, { trad401k: 100, roth401k: 0, rothIRA: 0, brokerage: 0 }, 1990);
    expect(r.order[0].key).toBe("trad401k");
    expect(r.order[0].reason).toMatch(/Rule of 55/);
  });
  it("age 65 in optimization window → brokerage, trad, then roth tier", () => {
    const r = computeWithdrawalOrder(65, 65, { trad401k: 100, roth401k: 100, rothIRA: 100, brokerage: 100 }, 1990);
    expect(r.order.map(o => o.key)).toEqual(["brokerage", "trad401k", "rothIRA", "roth401k"]);
    expect(r.phase).toMatch(/Tax Optimization/);
  });
  it("birthYear 1958 → RMDs start at 73", () => {
    const r = computeWithdrawalOrder(73, 65, { trad401k: 100, roth401k: 0, rothIRA: 0, brokerage: 0 }, 1958);
    expect(r.phase).toMatch(/RMD Phase/);
  });
  it("birthYear 1965 → RMDs start at 75; age 73 still in optimization window", () => {
    const r = computeWithdrawalOrder(73, 65, { trad401k: 100, roth401k: 0, rothIRA: 0, brokerage: 0 }, 1965);
    expect(r.phase).toMatch(/Tax Optimization/);
  });
  it("excludes empty balances", () => {
    const r = computeWithdrawalOrder(65, 65, { trad401k: 0, roth401k: 0, rothIRA: 100, brokerage: 100 }, 1990);
    expect(r.order.map(o => o.key)).toEqual(["brokerage", "rothIRA"]);
  });
});

// ─── Projection — accumulation ────────────────────────────────────────────────
describe("runProjection — accumulation", () => {
  it("$1000/mo, 0% return, 10 years → $120K balance at retirement", () => {
    const data = runProjection(baseParams({
      currentAge: 55, retirementAge: 65, lifeExpectancy: 90,
      accounts: baseAccounts({ trad: { monthly: 1000 } }),
    }));
    const ret = data.find(d => d.age === 65);
    expect(ret.trad401k).toBeCloseTo(120000, -1);
  });

  it("roth401k accumulates separately from trad401k", () => {
    const data = runProjection(baseParams({
      currentAge: 55, retirementAge: 65,
      accounts: baseAccounts({
        trad: { monthly: 1000 },
        roth401k: { monthly: 500 },
      }),
    }));
    const ret = data.find(d => d.age === 65);
    expect(ret.trad401k).toBeCloseTo(120000, -1);
    expect(ret.roth401k).toBeCloseTo(60000, -1);
    expect(ret.rothIRA).toBe(0);
  });

  it("employer match 100% up to 6% at $120K income, 6% employee → +$72K to Trad over 10 yrs", () => {
    const noMatch = runProjection(baseParams({
      currentAge: 55, retirementAge: 65,
      accounts: baseAccounts({ trad: { monthly: 600 } }),
    }));
    const withMatch = runProjection(baseParams({
      currentAge: 55, retirementAge: 65,
      accounts: baseAccounts({ trad: { monthly: 600 } }),
      annualIncome: 120000, employerMatchPct: 100, employerMatchCapPct: 6,
    }));
    const noBal = noMatch.find(d => d.age === 65).trad401k;
    const wBal  = withMatch.find(d => d.age === 65).trad401k;
    expect(wBal - noBal).toBeCloseTo(72000, -1);
  });

  it("contributions stop at retirement age", () => {
    // currentAge=60, retirementAge=65 → 5 years of $1000/mo, 0% return → $60K
    const data = runProjection(baseParams({
      currentAge: 60, retirementAge: 65, lifeExpectancy: 90,
      accounts: baseAccounts({ trad: { monthly: 1000 } }),
      annualSpending: 0,
    }));
    const atRet = data.find(d => d.age === 65).trad401k;
    expect(atRet).toBeCloseTo(60000, -1);
    // Balance at age 70 should still be ~60K (no spending, no contribs, 0% return)
    const at70 = data.find(d => d.age === 70).trad401k;
    expect(at70).toBeCloseTo(60000, -1);
  });

  it("7% return preset compounds (sanity range)", () => {
    const data = runProjection(baseParams({
      currentAge: 55, retirementAge: 65,
      accounts: baseAccounts({ trad: { monthly: 1000, returnPreset: 1, customReturn: 7 } }),
    }));
    const bal = data.find(d => d.age === 65).trad401k;
    // 10 yrs of $1K/mo at 7% ≈ $174K, plus 1 yr of pure growth at retirement age ≈ $186K
    expect(bal).toBeGreaterThan(180000);
    expect(bal).toBeLessThan(195000);
  });
});

// ─── Projection — withdrawal ──────────────────────────────────────────────────
describe("runProjection — withdrawal", () => {
  it("4% rule, $1M trad, 0% return, no SS → year-1 withdrawal $40K", () => {
    const data = runProjection(baseParams({
      currentAge: 64, retirementAge: 65, lifeExpectancy: 90,
      withdrawalMode: "rate", withdrawalRate: 4,
      accounts: baseAccounts({ trad: { balance: 1_000_000 } }),
    }));
    const y1 = data.find(d => d.age === 65);
    expect(y1.wTrad401k).toBeCloseTo(40000, -1);
    expect(y1.trad401k).toBeCloseTo(960000, -1);
  });

  it("Fixed $50K spending, $1M trad, 0% return → drops $50K/yr", () => {
    const data = runProjection(baseParams({
      currentAge: 64, retirementAge: 65, lifeExpectancy: 90,
      withdrawalMode: "fixed", annualSpending: 50000,
      accounts: baseAccounts({ trad: { balance: 1_000_000 } }),
    }));
    const y1 = data.find(d => d.age === 65);
    const y2 = data.find(d => d.age === 66);
    expect(y1.trad401k).toBeCloseTo(950000, -1);
    expect(y2.trad401k).toBeCloseTo(900000, -1);
  });

  it("brokerage drained before trad pre-RMD", () => {
    const data = runProjection(baseParams({
      currentAge: 64, retirementAge: 65, lifeExpectancy: 90,
      withdrawalMode: "fixed", annualSpending: 50000,
      accounts: baseAccounts({
        trad: { balance: 1_000_000 },
        brokerage: { balance: 100_000 },
      }),
    }));
    const y1 = data.find(d => d.age === 65);
    expect(y1.wBrokerage).toBeCloseTo(50000, -1);
    expect(y1.wTrad401k).toBe(0);
  });
});

// ─── Roth conversion engine ───────────────────────────────────────────────────
describe("Roth conversion engine", () => {
  const convScenario = (overrides = {}) =>
    baseParams({
      currentAge: 59, retirementAge: 60, lifeExpectancy: 90,
      withdrawalMode: "fixed", annualSpending: 0,
      birthYear: 1965, // rmdAge = 75
      accounts: baseAccounts({
        trad: { balance: 1_000_000 },
        brokerage: { balance: 200_000 },
      }),
      rothConversionEnabled: true, rothConversionBracket: 0.12,
      ...overrides,
    });

  it("disabled → no conversion, identical to baseline", () => {
    const a = runProjection(convScenario({ rothConversionEnabled: false }));
    const y1 = a.find(d => d.age === 60);
    expect(y1.conversion).toBe(0);
    expect(y1.trad401k).toBeCloseTo(1_000_000, -1);
  });

  it("12% bracket fill at age 60 with no other taxable income → conversion ≈ $63,475 (bracket top + std deduction)", () => {
    const a = runProjection(convScenario());
    const y1 = a.find(d => d.age === 60);
    // gross income ceiling = $48,475 (taxable bracket top) + $15,000 (standard deduction) = $63,475
    expect(y1.conversion).toBeCloseTo(63475, -1);
    expect(y1.trad401k).toBeCloseTo(1_000_000 - 63475, -1);
    expect(y1.rothIRA).toBeGreaterThanOrEqual(63475 - 1);
  });

  it("brokerage covers tax → full conversion lands in Roth", () => {
    const a = runProjection(convScenario());
    const y1 = a.find(d => d.age === 60);
    // gross conversion = $63,475; taxable = $63,475 - $15,000 std deduction = $48,475
    // tax = 11925*.10 + (48475-11925)*.12 = 1192.5 + 4386 = 5578.5
    expect(y1.conversionTax).toBeCloseTo(5578, -1);
    expect(y1.conversionTaxFromBrokerage).toBeCloseTo(y1.conversionTax, -1);
    // full $63,475 lands in Roth (tax paid from brokerage)
    expect(y1.rothIRA).toBeCloseTo(63475, -1);
  });

  it("brokerage too small → tax netted from conversion", () => {
    const a = runProjection(convScenario({
      accounts: baseAccounts({
        trad: { balance: 1_000_000 },
        brokerage: { balance: 1000 },
      }),
    }));
    const y1 = a.find(d => d.age === 60);
    expect(y1.conversionTaxFromBrokerage).toBeCloseTo(1000, -1);
    // Roth IRA gets conversion - (tax - 1000)
    const expectedRoth = y1.conversion - (y1.conversionTax - 1000);
    expect(y1.rothIRA).toBeCloseTo(expectedRoth, -1);
  });

  it("conversion window ends at rmdAge — birthYear 1958 (rmd=73), retire 67", () => {
    const a = runProjection(convScenario({
      currentAge: 66, retirementAge: 67,
      birthYear: 1958,
    }));
    const inWindow = a.filter(d => d.age >= 67 && d.age < 73);
    const past = a.filter(d => d.age >= 73 && d.age <= 80);
    expect(inWindow.every(d => d.conversion >= 0)).toBe(true);
    expect(inWindow.some(d => d.conversion > 0)).toBe(true);
    expect(past.every(d => d.conversion === 0)).toBe(true);
  });

  it("conversion never exceeds remaining trad balance", () => {
    const a = runProjection(convScenario({
      accounts: baseAccounts({
        trad: { balance: 30000 },
        brokerage: { balance: 100000 },
      }),
    }));
    const y1 = a.find(d => d.age === 60);
    expect(y1.conversion).toBeLessThanOrEqual(30000);
    expect(y1.trad401k).toBeGreaterThanOrEqual(0);
  });

  it("baseline taxable income reduces headroom — pension occupies bracket", () => {
    const noPension = runProjection(convScenario());
    const withPension = runProjection(convScenario({
      pensionEnabled: true, pensionMonthly: 2000, pensionStartAge: 60, // $24K/yr
    }));
    const y1n = noPension.find(d => d.age === 60).conversion;
    const y1p = withPension.find(d => d.age === 60).conversion;
    expect(y1p).toBeLessThan(y1n);
    expect(y1p).toBeCloseTo(y1n - 24000, -2);
  });

  it("RMD-age trad balance reduced vs. no conversions (regression: shrinks RMD base)", () => {
    const noConv = runProjection(convScenario({ rothConversionEnabled: false }));
    const conv   = runProjection(convScenario());
    const tradAt75NoConv = noConv.find(d => d.age === 75).trad401k;
    const tradAt75Conv   = conv.find(d => d.age === 75).trad401k;
    expect(tradAt75Conv).toBeLessThan(tradAt75NoConv);
  });
});

// ─── Bracket inflation ────────────────────────────────────────────────────────
describe("Bracket inflation in projection", () => {
  it("inflation increases conversion sizes year-over-year", () => {
    const a = runProjection(baseParams({
      currentAge: 59, retirementAge: 60, lifeExpectancy: 90,
      birthYear: 1965, // rmd=75
      inflationRate: 3,
      accounts: baseAccounts({
        trad: { balance: 5_000_000 },
        brokerage: { balance: 1_000_000 },
      }),
      rothConversionEnabled: true, rothConversionBracket: 0.12,
    }));
    const y1 = a.find(d => d.age === 60).conversion;
    const y10 = a.find(d => d.age === 70).conversion;
    expect(y10).toBeGreaterThan(y1);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────
describe("Edge cases", () => {
  it("all-zero balances projects without errors", () => {
    const a = runProjection(baseParams({ currentAge: 64, retirementAge: 65, lifeExpectancy: 70 }));
    expect(a.length).toBeGreaterThan(0);
    expect(a.every(d => d.Total === 0)).toBe(true);
  });

  it("negative balance input clamps to 0", () => {
    const a = runProjection(baseParams({
      currentAge: 64, retirementAge: 65,
      accounts: baseAccounts({ trad: { balance: -5000 } }),
    }));
    expect(a[0].trad401k).toBeGreaterThanOrEqual(0);
  });

  it("Monte Carlo runs with 4 accounts and returns success rate ∈ [0,100]", () => {
    const r = runMonteCarlo({
      accounts: baseAccounts({ trad: { balance: 500000 }, rothIRA: { balance: 100000 } }),
      retirementBalance: { trad401k: 500000, roth401k: 0, rothIRA: 100000, brokerage: 0 },
      retirementAge: 65, lifeExpectancy: 85,
      annualSpending: 30000, withdrawalMode: "fixed", withdrawalRate: 4,
      inflationRate: 0,
      ssEnabled: false, ssMonthly: 0, ssStartAge: 67,
      pensionEnabled: false, pensionMonthly: 0, pensionStartAge: 65,
    });
    expect(r.successRate).toBeGreaterThanOrEqual(0);
    expect(r.successRate).toBeLessThanOrEqual(100);
    expect(r.fanData.length).toBe(85 - 65 + 1);
  });
});

// ─── RMDs (Uniform Lifetime Table) ────────────────────────────────────────────
describe("computeRMD", () => {
  it("age 75 uses divisor 24.6", () => {
    expect(computeRMD(246000, 75)).toBeCloseTo(10000, 0);
  });
  it("age 73 uses divisor 26.5", () => {
    expect(computeRMD(265000, 73)).toBeCloseTo(10000, 0);
  });
  it("returns 0 below table start age", () => {
    expect(computeRMD(100000, 70)).toBe(0);
  });
  it("returns 0 for zero or negative balance", () => {
    expect(computeRMD(0, 80)).toBe(0);
    expect(computeRMD(-100, 80)).toBe(0);
  });
  it("ages past 110 use the final divisor (3.5)", () => {
    expect(computeRMD(35000, 115)).toBeCloseTo(10000, 0);
  });
});

describe("runProjection — forced RMDs", () => {
  const rmdScenario = (overrides = {}) => baseParams({
    currentAge: 71, retirementAge: 72, lifeExpectancy: 80,
    birthYear: 1955, // rmdAge = 73
    withdrawalMode: "fixed", annualSpending: 0,
    accounts: baseAccounts({ trad: { balance: 265000 } }),
    ...overrides,
  });

  it("no RMD before rmdAge", () => {
    const data = runProjection(rmdScenario());
    expect(data.find(d => d.age === 72).rmdRequired).toBe(0);
  });

  it("forces RMD at rmdAge even with zero spending; excess reinvested to brokerage", () => {
    const data = runProjection(rmdScenario());
    const y = data.find(d => d.age === 73);
    expect(y.rmdRequired).toBeCloseTo(10000, -1); // 265000 / 26.5
    expect(y.wTrad401k).toBeCloseTo(10000, -1);
    expect(y.trad401k).toBeCloseTo(255000, -1);
    expect(y.brokerage).toBeCloseTo(10000, -1);
  });

  it("spending below RMD → full RMD withdrawn, only excess reinvested", () => {
    const data = runProjection(rmdScenario({ annualSpending: 6000 }));
    const y = data.find(d => d.age === 73);
    // age-72 spending already drew $6K → balance 259000, RMD = 259000/26.5 ≈ 9774
    expect(y.wTrad401k).toBeCloseTo(9774, -1);
    expect(y.brokerage).toBeCloseTo(9774 - 6000, -1);
  });

  it("spending above RMD → strategy tops up beyond the RMD", () => {
    const data = runProjection(rmdScenario({ annualSpending: 30000 }));
    const y = data.find(d => d.age === 73);
    expect(y.wTrad401k).toBeCloseTo(30000, -1);
    expect(y.brokerage).toBeCloseTo(0, -1);
  });

  it("birthYear 1965 → no RMD until 75", () => {
    const data = runProjection(rmdScenario({ birthYear: 1965, lifeExpectancy: 80 }));
    expect(data.find(d => d.age === 73).rmdRequired).toBe(0);
    expect(data.find(d => d.age === 74).rmdRequired).toBe(0);
    expect(data.find(d => d.age === 75).rmdRequired).toBeGreaterThan(0);
  });
});

// ─── Capital gains (brokerage) ────────────────────────────────────────────────
describe("calcLTCGTax", () => {
  it("gains inside the 0% bracket are untaxed", () => {
    expect(calcLTCGTax(10000, 0, LTCG_BRACKETS_2025.single)).toBe(0);
  });
  it("gains stack on top of ordinary income", () => {
    // ordinary 40000; 0% bracket ends at 48350 → first 8350 of gains free, rest at 15%
    expect(calcLTCGTax(100000, 40000, LTCG_BRACKETS_2025.single))
      .toBeCloseTo((100000 - 8350) * 0.15, 0);
  });
  it("high income → 20% rate", () => {
    expect(calcLTCGTax(100000, 600000, LTCG_BRACKETS_2025.single)).toBeCloseTo(20000, 0);
  });
  it("MFJ 0% bracket is wider", () => {
    expect(calcLTCGTax(90000, 0, LTCG_BRACKETS_2025.mfj)).toBe(0);
  });
});

describe("runProjection — brokerage capital gains", () => {
  it("withdrawals realize pro-rata gains against cost basis", () => {
    const data = runProjection(baseParams({
      currentAge: 64, retirementAge: 65, lifeExpectancy: 70,
      withdrawalMode: "fixed", annualSpending: 10000,
      accounts: baseAccounts({ brokerage: { balance: 100000, costBasis: 50000 } }),
    }));
    const y1 = data.find(d => d.age === 65);
    expect(y1.capGains).toBeCloseTo(5000, -1); // half of each dollar is gain
    expect(y1.ltcgTax).toBe(0);                // inside 0% bracket
  });

  it("costBasis defaults to balance → zero gains", () => {
    const data = runProjection(baseParams({
      currentAge: 64, retirementAge: 65, lifeExpectancy: 70,
      withdrawalMode: "fixed", annualSpending: 10000,
      accounts: baseAccounts({ brokerage: { balance: 100000 } }),
    }));
    expect(data.find(d => d.age === 65).capGains).toBeCloseTo(0, -1);
  });

  it("large all-gain withdrawal is taxed at LTCG rates above the 0% ceiling", () => {
    const data = runProjection(baseParams({
      currentAge: 64, retirementAge: 65, lifeExpectancy: 70,
      withdrawalMode: "fixed", annualSpending: 100000,
      accounts: baseAccounts({ brokerage: { balance: 2000000, costBasis: 0 } }),
    }));
    const y1 = data.find(d => d.age === 65);
    expect(y1.capGains).toBeCloseTo(100000, -1);
    // std deduction (15000) shelters first slice; (85000 - 48350) * 0.15 = 5497.5
    expect(y1.ltcgTax).toBeCloseTo(5498, -1);
  });
});

// ─── California state tax ──────────────────────────────────────────────────────
describe("California state tax", () => {
  it("stateTax 'none' (default) → no state tax charged, existing behavior unchanged", () => {
    const data = runProjection(baseParams({
      currentAge: 64, retirementAge: 65, lifeExpectancy: 70,
      withdrawalMode: "fixed", annualSpending: 100000,
      accounts: baseAccounts({ trad: { balance: 500000 } }),
    }));
    const y1 = data.find(d => d.age === 65);
    expect(y1.stateTax).toBe(0);
    expect(y1.stateMarginalRate).toBe(0);
  });

  it("unknown state key falls back to no state tax", () => {
    const data = runProjection(baseParams({
      currentAge: 64, retirementAge: 65, lifeExpectancy: 70,
      withdrawalMode: "fixed", annualSpending: 100000,
      accounts: baseAccounts({ trad: { balance: 500000 } }),
      stateTax: "tx",
    }));
    expect(data.find(d => d.age === 65).stateTax).toBe(0);
  });

  it("CA charges state tax on ordinary (trad401k) withdrawal income", () => {
    const data = runProjection(baseParams({
      currentAge: 64, retirementAge: 65, lifeExpectancy: 70,
      withdrawalMode: "fixed", annualSpending: 100000,
      accounts: baseAccounts({ trad: { balance: 500000 } }),
      stateTax: "ca",
    }));
    const y1 = data.find(d => d.age === 65);
    // taxable = 100000 gross - 5540 CA std deduction = 94460, all within the 9.3% bracket tier
    expect(y1.stateTax).toBeGreaterThan(0);
    expect(y1.estTax).toBeGreaterThan(
      runProjection(baseParams({
        currentAge: 64, retirementAge: 65, lifeExpectancy: 70,
        withdrawalMode: "fixed", annualSpending: 100000,
        accounts: baseAccounts({ trad: { balance: 500000 } }),
      })).find(d => d.age === 65).estTax
    );
  });

  it("CA taxes brokerage capital gains as ordinary income even under the federal 0% LTCG ceiling", () => {
    // gain (~$15,000) exceeds the CA standard deduction ($5,540) but stays
    // well under the federal 0% LTCG ceiling ($48,350).
    const data = runProjection(baseParams({
      currentAge: 64, retirementAge: 65, lifeExpectancy: 70,
      withdrawalMode: "fixed", annualSpending: 30000,
      accounts: baseAccounts({ brokerage: { balance: 200000, costBasis: 100000 } }),
      stateTax: "ca",
    }));
    const y1 = data.find(d => d.age === 65);
    expect(y1.capGains).toBeCloseTo(15000, -1);
    expect(y1.ltcgTax).toBe(0);          // still 0% federally
    expect(y1.stateTax).toBeGreaterThan(0); // but CA taxes the gain as ordinary income
  });

  it("CA standard deduction shelters income below the threshold", () => {
    const data = runProjection(baseParams({
      currentAge: 64, retirementAge: 65, lifeExpectancy: 70,
      withdrawalMode: "fixed", annualSpending: 4000,
      accounts: baseAccounts({ trad: { balance: 500000 } }),
      stateTax: "ca",
    }));
    expect(data.find(d => d.age === 65).stateTax).toBe(0);
  });

  it("CA brackets inflate year-over-year like federal brackets", () => {
    const a = runProjection(baseParams({
      currentAge: 64, retirementAge: 65, lifeExpectancy: 90,
      withdrawalMode: "fixed", annualSpending: 100000,
      inflationRate: 3,
      accounts: baseAccounts({ trad: { balance: 3_000_000 } }),
      stateTax: "ca",
    }));
    const y1 = a.find(d => d.age === 65).stateTax;
    const y10 = a.find(d => d.age === 75).stateTax;
    // withdrawal grows with inflation too, but a higher bracket ceiling means
    // marginal rate growth should be at most proportional — sanity check tax rises but not explosively
    expect(y10).toBeGreaterThan(y1);
  });

  it("Roth conversion cash cost is higher with CA tax than federal-only, but conversion size is unchanged", () => {
    const scenario = (overrides = {}) => baseParams({
      currentAge: 59, retirementAge: 60, lifeExpectancy: 90,
      birthYear: 1965, // rmdAge = 75
      accounts: baseAccounts({
        trad: { balance: 1_000_000 },
        brokerage: { balance: 200_000 },
      }),
      rothConversionEnabled: true, rothConversionBracket: 0.12,
      ...overrides,
    });
    const federalOnly = runProjection(scenario());
    const withCA = runProjection(scenario({ stateTax: "ca" }));
    const y1Fed = federalOnly.find(d => d.age === 60);
    const y1CA  = withCA.find(d => d.age === 60);
    expect(y1CA.conversion).toBeCloseTo(y1Fed.conversion, -1); // sizing is federal-bracket-driven
    expect(y1CA.conversionTax).toBeGreaterThan(y1Fed.conversionTax); // but costs more
  });

  it("MFJ CA brackets use doubled thresholds vs single", () => {
    expect(STATE_TAX_2025.ca.brackets.mfj[0].max).toBeCloseTo(STATE_TAX_2025.ca.brackets.single[0].max * 2, -1);
    expect(STATE_TAX_2025.ca.standardDeduction.mfj).toBeCloseTo(STATE_TAX_2025.ca.standardDeduction.single * 2, -1);
  });
});

// ─── Asset allocation & glide path ────────────────────────────────────────────
describe("allocation model", () => {
  it("allocReturn blends stock/bond expected returns (60/40 → 7.5%)", () => {
    expect(allocReturn(60)).toBeCloseTo(0.075, 4);
    expect(allocReturn(100)).toBeCloseTo(MARKET_ASSUMPTIONS.stockReturn / 100, 4);
    expect(allocReturn(0)).toBeCloseTo(MARKET_ASSUMPTIONS.bondReturn / 100, 4);
  });

  it("allocVol blends stock/bond volatility (60/40 → 12.4%)", () => {
    expect(allocVol(60)).toBeCloseTo(0.124, 4);
  });

  it("presets map to stock allocations (30/60/90), custom-alloc uses stockPct, custom-return is null", () => {
    expect(accountStockPct({ returnPreset: 0 })).toBe(30);
    expect(accountStockPct({ returnPreset: 1 })).toBe(60);
    expect(accountStockPct({ returnPreset: 2 })).toBe(90);
    expect(accountStockPct({ returnPreset: 3, customMode: "alloc", stockPct: 45 })).toBe(45);
    expect(accountStockPct({ returnPreset: 3, customReturn: 7 })).toBe(null);
  });

  it("glide path de-risks 1 stock-pt per year down to the floor", () => {
    const acc = { returnPreset: 2, glide: true, glideFloor: 40 };
    expect(stockPctAtYear(acc, 0)).toBe(90);
    expect(stockPctAtYear(acc, 10)).toBe(80);
    expect(stockPctAtYear(acc, 60)).toBe(40); // clamped at floor
  });

  it("no glide → allocation constant across years", () => {
    const acc = { returnPreset: 2, glide: false };
    expect(stockPctAtYear(acc, 30)).toBe(90);
  });

  it("raw-return custom accounts ignore glide and market assumptions", () => {
    const acc = { returnPreset: 3, customReturn: 5, glide: true };
    expect(accountReturnAtYear(acc, 0)).toBeCloseTo(0.05, 6);
    expect(accountReturnAtYear(acc, 20)).toBeCloseTo(0.05, 6);
  });

  it("accountVolAtYear reflects allocation", () => {
    expect(accountVolAtYear({ returnPreset: 0 }, 0)).toBeCloseTo(allocVol(30), 6);
    expect(accountVolAtYear({ returnPreset: 2, glide: true, glideFloor: 30 }, 60)).toBeCloseTo(allocVol(30), 6);
  });

  it("projection: glide path grows slower than fixed aggressive allocation", () => {
    const mk = (glide) => baseParams({
      currentAge: 55, retirementAge: 75, lifeExpectancy: 80,
      accounts: baseAccounts({ trad: { balance: 100000, returnPreset: 2, glide, glideFloor: 20 } }),
    });
    const fixed = runProjection(mk(false)).find(d => d.age === 75).trad401k;
    const glided = runProjection(mk(true)).find(d => d.age === 75).trad401k;
    expect(glided).toBeLessThan(fixed);
    expect(glided).toBeGreaterThan(100000); // still grows
  });

  it("Monte Carlo accepts currentAge and per-year allocation (still valid rates)", () => {
    const r = runMonteCarlo({
      accounts: baseAccounts({ trad: { balance: 500000, returnPreset: 1, glide: true, glideFloor: 30 } }),
      retirementBalance: { trad401k: 500000, roth401k: 0, rothIRA: 0, brokerage: 0 },
      currentAge: 55, retirementAge: 65, lifeExpectancy: 85,
      annualSpending: 30000, withdrawalMode: "fixed", withdrawalRate: 4,
      inflationRate: 0,
      ssEnabled: false, ssMonthly: 0, ssStartAge: 67,
      pensionEnabled: false, pensionMonthly: 0, pensionStartAge: 65,
    });
    expect(r.successRate).toBeGreaterThanOrEqual(0);
    expect(r.successRate).toBeLessThanOrEqual(100);
    expect(r.blendedMean).toBeGreaterThan(0);
    expect(r.blendedVol).toBeGreaterThan(0);
  });
});

// ─── Social Security claiming ─────────────────────────────────────────────────
describe("ssClaimFactor", () => {
  it("matches SSA schedule vs FRA 67", () => {
    expect(ssClaimFactor(62)).toBeCloseTo(0.70, 3);
    expect(ssClaimFactor(65)).toBeCloseTo(0.8667, 3);
    expect(ssClaimFactor(67)).toBe(1);
    expect(ssClaimFactor(70)).toBeCloseTo(1.24, 3);
  });
  it("clamps outside 62–70", () => {
    expect(ssClaimFactor(55)).toBeCloseTo(0.70, 3);
    expect(ssClaimFactor(80)).toBeCloseTo(1.24, 3);
  });
});

describe("ssBreakEvenAge", () => {
  it("62 vs 67 breaks even near 78.7", () => {
    expect(ssBreakEvenAge(62, 67)).toBeCloseTo(78.67, 1);
  });
  it("67 vs 70 breaks even near 82.5", () => {
    expect(ssBreakEvenAge(67, 70)).toBeCloseTo(82.5, 1);
  });
});

// ─── Spending phases ──────────────────────────────────────────────────────────
describe("spending phases", () => {
  const phases = { enabled: true, slowGoAge: 75, slowGoPct: 50, noGoAge: 85, noGoPct: 25 };

  it("multiplier bands: 1 / slow-go / no-go", () => {
    expect(spendingMultiplier(70, phases)).toBe(1);
    expect(spendingMultiplier(75, phases)).toBe(0.5);
    expect(spendingMultiplier(84, phases)).toBe(0.5);
    expect(spendingMultiplier(85, phases)).toBe(0.25);
    expect(spendingMultiplier(85, { ...phases, enabled: false })).toBe(1);
    expect(spendingMultiplier(85, null)).toBe(1);
  });

  it("projection applies phase multipliers to fixed spending", () => {
    const data = runProjection(baseParams({
      currentAge: 64, retirementAge: 65, lifeExpectancy: 90,
      withdrawalMode: "fixed", annualSpending: 40000,
      accounts: baseAccounts({ brokerage: { balance: 2_000_000 } }), // no trad → no RMD noise
      spendingPhases: phases,
    }));
    expect(data.find(d => d.age === 74).wTotal).toBeCloseTo(40000, -1);
    expect(data.find(d => d.age === 75).wTotal).toBeCloseTo(20000, -1);
    expect(data.find(d => d.age === 85).wTotal).toBeCloseTo(10000, -1);
  });
});

// ─── Part-time (semi-retired) phase ──────────────────────────────────────────
describe("runProjection — part-time phase", () => {
  it("partTimeEnabled false leaves projection unchanged even with part-time params set", () => {
    const mk = (extra = {}) => baseParams({
      currentAge: 50, retirementAge: 60, lifeExpectancy: 70,
      withdrawalMode: "fixed", annualSpending: 20000,
      accounts: baseAccounts({ trad: { monthly: 1000, balance: 100000 }, brokerage: { balance: 50000 } }),
      ...extra,
    });
    const base = runProjection(mk());
    const off  = runProjection(mk({
      partTimeEnabled: false, partTimeStartAge: 55, partTimeIncome: 50000,
      partTimeContrib: { trad401k: 100, roth401k: 0, rothIRA: 0, brokerage: 0 },
      partTimeMatchPct: 100, partTimeMatchCapPct: 6,
    }));
    expect(off).toEqual(base);
  });

  it("full-time contributions and match stop at the part-time start age", () => {
    const data = runProjection(baseParams({
      currentAge: 50, retirementAge: 60, lifeExpectancy: 70,
      withdrawalMode: "fixed", annualSpending: 0,
      accounts: baseAccounts({ trad: { monthly: 1000 } }),
      annualIncome: 120000, employerMatchPct: 100, employerMatchCapPct: 6,
      partTimeEnabled: true, partTimeStartAge: 55, partTimeIncome: 0,
    }));
    // 5 accumulation years (50–54): $12K/yr contributions + $7.2K/yr match (6% of $120K)
    expect(data.find(d => d.age === 60).trad401k).toBeCloseTo(5 * (12000 + 7200), -1);
    expect(data.find(d => d.age === 54).employerMatchAnnual).toBeCloseTo(7200, 0);
    expect(data.find(d => d.age === 55).employerMatchAnnual).toBe(0);
  });

  it("shortfall in semi-retired years is drawn brokerage-first", () => {
    const data = runProjection(baseParams({
      currentAge: 54, retirementAge: 65, lifeExpectancy: 70,
      withdrawalMode: "fixed", annualSpending: 50000,
      accounts: baseAccounts({ trad: { balance: 500000 }, brokerage: { balance: 300000 } }),
      partTimeEnabled: true, partTimeStartAge: 55, partTimeIncome: 30000,
    }));
    const y = data.find(d => d.age === 55);
    expect(y.partTimeIncome).toBeCloseTo(30000, -1);
    expect(y.wBrokerage).toBeCloseTo(20000, -1); // 50000 spending − 30000 income
    expect(y.wTrad401k).toBe(0);
  });

  it("pension income reduces the semi-retired shortfall", () => {
    const mk = (pension) => runProjection(baseParams({
      currentAge: 54, retirementAge: 65, lifeExpectancy: 70,
      withdrawalMode: "fixed", annualSpending: 50000,
      accounts: baseAccounts({ brokerage: { balance: 500000 } }),
      partTimeEnabled: true, partTimeStartAge: 55, partTimeIncome: 20000,
      pensionEnabled: pension, pensionMonthly: 1000, pensionStartAge: 55,
    }));
    const w = (p) => mk(p).find(d => d.age === 55).wBrokerage;
    expect(w(true)).toBeCloseTo(w(false) - 12000, -1);
  });

  it("part-time income inflates with the general inflation rate", () => {
    const data = runProjection(baseParams({
      currentAge: 54, retirementAge: 65, lifeExpectancy: 70,
      inflationRate: 3, withdrawalMode: "fixed", annualSpending: 0,
      partTimeEnabled: true, partTimeStartAge: 55, partTimeIncome: 30000,
    }));
    expect(data.find(d => d.age === 60).partTimeIncome)
      .toBeCloseTo(30000 * Math.pow(1.03, 6), -2); // 6 years after currentAge 54
  });

  it("part-time start age clamps into (currentAge, retirementAge)", () => {
    const data = runProjection(baseParams({
      currentAge: 54, retirementAge: 65, lifeExpectancy: 70,
      withdrawalMode: "fixed", annualSpending: 0,
      accounts: baseAccounts({ trad: { monthly: 1000 } }),
      partTimeEnabled: true, partTimeStartAge: 30, partTimeIncome: 10000,
    }));
    expect(data.find(d => d.age === 54).partTimeIncome).toBe(0); // clamped to 55
    expect(data.find(d => d.age === 55).partTimeIncome).toBeCloseTo(10000, -1);
  });

  it("rate mode: semi-retired years still use fixed annual spending for the gap", () => {
    const data = runProjection(baseParams({
      currentAge: 54, retirementAge: 65, lifeExpectancy: 70,
      withdrawalMode: "rate", withdrawalRate: 4, annualSpending: 50000,
      accounts: baseAccounts({ brokerage: { balance: 1_000_000 } }),
      partTimeEnabled: true, partTimeStartAge: 55, partTimeIncome: 30000,
    }));
    expect(data.find(d => d.age === 55).wBrokerage).toBeCloseTo(20000, -1);
  });

  it("surplus income funds part-time contributions in full", () => {
    const data = runProjection(baseParams({
      currentAge: 54, retirementAge: 65, lifeExpectancy: 70,
      withdrawalMode: "fixed", annualSpending: 40000,
      partTimeEnabled: true, partTimeStartAge: 55, partTimeIncome: 70000,
      partTimeContrib: { trad401k: 500, roth401k: 0, rothIRA: 500, brokerage: 0 },
    }));
    const y = data.find(d => d.age === 55);
    // leftover $30K > planned $12K → fully funded
    expect(y.partTimeContribAnnual).toBeCloseTo(12000, -1);
    expect(y.wTotal).toBe(0);
    const at64 = data.find(d => d.age === 64); // 10 semi-retired years, 0% return
    expect(at64.trad401k).toBeCloseTo(60000, -1);
    expect(at64.rothIRA).toBeCloseTo(60000, -1);
  });

  it("partial leftover scales contributions proportionally", () => {
    const data = runProjection(baseParams({
      currentAge: 54, retirementAge: 65, lifeExpectancy: 70,
      withdrawalMode: "fixed", annualSpending: 40000,
      partTimeEnabled: true, partTimeStartAge: 55, partTimeIncome: 46000,
      partTimeContrib: { trad401k: 750, roth401k: 0, rothIRA: 250, brokerage: 0 },
    }));
    const y = data.find(d => d.age === 55);
    // leftover $6K of $12K planned → scale 0.5
    expect(y.partTimeContribAnnual).toBeCloseTo(6000, -1);
    expect(y.trad401k).toBeCloseTo(4500, -1);
    expect(y.rothIRA).toBeCloseTo(1500, -1);
  });

  it("no contributions in shortfall years", () => {
    const data = runProjection(baseParams({
      currentAge: 54, retirementAge: 65, lifeExpectancy: 70,
      withdrawalMode: "fixed", annualSpending: 50000,
      accounts: baseAccounts({ brokerage: { balance: 500000 } }),
      partTimeEnabled: true, partTimeStartAge: 55, partTimeIncome: 30000,
      partTimeContrib: { trad401k: 500, roth401k: 0, rothIRA: 0, brokerage: 0 },
    }));
    const y = data.find(d => d.age === 55);
    expect(y.partTimeContribAnnual).toBe(0);
    expect(y.wBrokerage).toBeCloseTo(20000, -1);
  });

  it("part-time Roth IRA contributions extend the withdrawable basis", () => {
    const data = runProjection(baseParams({
      currentAge: 54, retirementAge: 60, lifeExpectancy: 70,
      withdrawalMode: "fixed", annualSpending: 0,
      partTimeEnabled: true, partTimeStartAge: 55, partTimeIncome: 20000,
      partTimeContrib: { trad401k: 0, roth401k: 0, rothIRA: 500, brokerage: 0 },
    }));
    expect(data.find(d => d.age === 59).rothIRAContribBasis).toBeCloseTo(5 * 6000, -1);
  });
});

// ─── Contribution limits ──────────────────────────────────────────────────────
describe("contribution limits (2025)", () => {
  it("401(k): base / 50+ catch-up / 60–63 super catch-up", () => {
    expect(contributionLimit401k(49)).toBe(23500);
    expect(contributionLimit401k(50)).toBe(31000);
    expect(contributionLimit401k(61)).toBe(34750);
    expect(contributionLimit401k(64)).toBe(31000);
  });
  it("IRA: base / 50+ catch-up", () => {
    expect(contributionLimitIRA(49)).toBe(7000);
    expect(contributionLimitIRA(50)).toBe(8000);
  });
});
