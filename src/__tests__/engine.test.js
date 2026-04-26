import { describe, it, expect } from "vitest";
import {
  calcTax, getMarginalRate, inflatedBrackets, bracketTopForRate,
  TAX_BRACKETS_2025,
  computeEmployerMatch,
  computeWithdrawalOrder,
  runProjection,
  runMonteCarlo,
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

  it("12% bracket fill at age 60 with no other taxable income → conversion ≈ $48,475", () => {
    const a = runProjection(convScenario());
    const y1 = a.find(d => d.age === 60);
    expect(y1.conversion).toBeCloseTo(48475, -1);
    expect(y1.trad401k).toBeCloseTo(1_000_000 - 48475, -1);
    expect(y1.rothIRA).toBeGreaterThanOrEqual(48475 - 1);
  });

  it("brokerage covers tax → full conversion lands in Roth", () => {
    const a = runProjection(convScenario());
    const y1 = a.find(d => d.age === 60);
    // 12% bracket conversion ≈ $48,475; tax ≈ $5,338.5 (10% on first 11925, 12% on rest)
    // 11925*.10 + (48475-11925)*.12 = 1192.5 + 4386 = 5578.5
    expect(y1.conversionTax).toBeCloseTo(5578, -1);
    expect(y1.conversionTaxFromBrokerage).toBeCloseTo(y1.conversionTax, -1);
    expect(y1.rothIRA).toBeCloseTo(48475, -1);
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
