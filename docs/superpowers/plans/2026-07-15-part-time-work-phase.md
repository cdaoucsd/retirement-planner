# Part-Time Work Phase (Semi-Retirement) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional semi-retired phase (e.g., ages 55–65) where part-time income offsets spending, shortfalls draw brokerage-first, surpluses fund separate capped contributions, and a separate part-time employer match applies.

**Architecture:** The deterministic projection in `src/engine.js` gains a third phase between accumulation and retirement, gated by three-way flags (`isAccumulating` / `isSemiRetired` / `isRetired`). UI state lives in one `partTime` object in `src/retirement-planner.jsx`, rendered by a new `PartTimeCard` in `src/components/IncomePanels.jsx`. Monte Carlo is untouched (it starts from the balance at retirement age).

**Tech Stack:** React 19 + Vite, Vitest for tests, Recharts for charts, Tailwind for styles. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-15-part-time-work-phase-design.md`

## Global Constraints

- **Zero behavior change when disabled:** with `partTimeEnabled: false` (or omitted), `runProjection` output must deep-equal current output. There is a regression test for this; never break it.
- **No new dependencies.**
- Engine params are flat (`partTimeEnabled`, `partTimeStartAge`, `partTimeIncome`, `partTimeContrib`, `partTimeMatchPct`, `partTimeMatchCapPct`), matching the existing `pensionEnabled`-style convention. `partTimeContrib` is `{ trad401k, roth401k, rothIRA, brokerage }` in $/month.
- Part-time income is **gross, today's dollars, inflation-adjusted** each year; taxed as ordinary income (Trad 401(k) part-time contributions are pre-tax and reduce it).
- SS/pension income (if already started) also offsets semi-retired spending — same treatment as retirement years. *(Spec amendment: the engine already computes `ssAnnual`/`penAnnual` for every age; semi-retired years must not ignore them.)*
- Taxes remain **display-only** (`estTax`), consistent with the existing engine: spending withdrawals are not grossed up for taxes. The one exception (Roth conversion tax) is untouched.
- RMDs and Roth conversions stay gated on full retirement — unchanged.
- Follow existing code style: `safeNum`/`clamp`/`safeBal` helpers, `// ─── Section ───` comments, existing test patterns (`baseParams`, `baseAccounts`, `ZERO_RET` accounts for exact arithmetic).
- Run tests with `npm test` (vitest run). Run a subset with `npx vitest run -t "<name substring>"`.

---

### Task 1: Engine — phase gating, part-time income, shortfall withdrawals

**Files:**
- Modify: `src/engine.js` (`runProjection`, lines ~367–671)
- Test: `src/__tests__/engine.test.js`

**Interfaces:**
- Consumes: existing `runProjection(params)`, `computeWithdrawalOrder`, `spendingMultiplier`, `computeEmployerMatch`.
- Produces (later tasks rely on these exact names):
  - `runProjection` params: `partTimeEnabled` (bool, default `false`), `partTimeStartAge` (number, default `55`), `partTimeIncome` (number, gross annual, default `0`), `partTimeContrib` (object|null, default `null`), `partTimeMatchPct` (number, default `0`), `partTimeMatchCapPct` (number, default `6`).
  - Internal per-run values: `ptEnabled` (bool), `ptAge` (number|Infinity), `ptc` (clamped contrib object), `ptPlannedMonthly` (number).
  - Internal per-year values: `isSemiRetired`, `isAccumulating`, `ptIncomeYr`, `ptSpendNeed`, and (placeholders this task, real in Tasks 2–3) `ptScale`, `ptMatchAnnual`.
  - Per-year output fields: `partTimeIncome` (rounded annual), `partTimeContribAnnual` (0 until Task 2), `partTimeMatchAnnual` (0 until Task 3).
  - Internal helper `drawFromOrder(needed, order)` → returns unmet remainder; mutates `bal`, `yearW`, `realizedGains` via closure.

- [ ] **Step 1: Write the failing tests**

Append to `src/__tests__/engine.test.js` (import nothing new — `runProjection`, `baseParams`, `baseAccounts` already exist in the file):

```js
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run -t "part-time"`
Expected: FAIL — "full-time contributions and match stop…" and "shortfall…" fail (part-time params silently ignored: `partTimeIncome` field undefined, contributions never stop). The `partTimeEnabled false` regression test PASSES already (unknown params are ignored) — that is fine; it locks the invariant.

- [ ] **Step 3: Implement phase gating, income, and shortfall withdrawal**

In `src/engine.js`, `runProjection`. Four edits:

**(a)** Add params to the destructuring (after `spendingPhases = null,`):

```js
    partTimeEnabled = false,
    partTimeStartAge = 55,
    partTimeIncome = 0,
    partTimeContrib = null,
    partTimeMatchPct = 0,
    partTimeMatchCapPct = 6,
```

**(b)** After `const rmdAge = birthYear <= 1959 ? 73 : 75;` add:

```js
  // Part-time (semi-retired) phase spans [ptAge, rAge). Needs at least one
  // pre-retirement year after the current age to activate.
  const ptEnabled = partTimeEnabled && rAge > cAge + 1;
  const ptAge = ptEnabled ? clamp(partTimeStartAge, cAge + 1, rAge - 1) : Infinity;
  const ptc = {
    trad401k:  clamp(partTimeContrib?.trad401k,  0, 50000),
    roth401k:  clamp(partTimeContrib?.roth401k,  0, 50000),
    rothIRA:   clamp(partTimeContrib?.rothIRA,   0, 50000),
    brokerage: clamp(partTimeContrib?.brokerage, 0, 50000),
  };
  const ptPlannedMonthly = ptc.trad401k + ptc.roth401k + ptc.rothIRA + ptc.brokerage;
```

**(c)** In the year loop, replace

```js
    const isRetired = age >= rAge;
```

with

```js
    const isRetired      = age >= rAge;
    const isSemiRetired  = !isRetired && ptEnabled && age >= ptAge;
    const isAccumulating = !isRetired && !isSemiRetired;
```

Then **move** the SS/pension income lines up: delete these two lines from their current spot below the monthly loop —

```js
    const ssAnnual  = ssEnabled && age >= ssStartAge ? safeNum(ssMonthly) * 12 * yearInfl : 0;
    const penAnnual = pensionEnabled && age >= pensionStartAge ? safeNum(pensionMonthly) * 12 : 0;
```

— and re-insert them (identical) right after `const stateStdDedInflated = stateStdDed * yearInfl;`, followed by the new semi-retired setup block. (`const income = ssAnnual + penAnnual;` stays where it is, next to `total`.)

```js
    const ssAnnual  = ssEnabled && age >= ssStartAge ? safeNum(ssMonthly) * 12 * yearInfl : 0;
    const penAnnual = pensionEnabled && age >= pensionStartAge ? safeNum(pensionMonthly) * 12 : 0;

    // Semi-retired year: part-time income (plus any SS/pension already
    // started) covers spending first; a shortfall is withdrawn below, a
    // surplus can fund the separate part-time contributions.
    let ptIncomeYr = 0, ptSpendNeed = 0, ptScale = 0, ptMatchAnnual = 0;
    if (isSemiRetired) {
      ptIncomeYr = Math.max(0, safeNum(partTimeIncome)) * yearInfl;
      const spendYr = spending * spendingMultiplier(age, spendingPhases) * yearInfl;
      const leftover = ptIncomeYr + ssAnnual + penAnnual - spendYr;
      ptSpendNeed = Math.max(0, -leftover);
    }
```

In the monthly growth loop, replace the `if (!isRetired)` contribution branch:

```js
        if (isAccumulating) {
          bal[k] += clamp(accounts[k].monthly, 0, 50000);
          if (k === "trad401k") bal[k] += employerMonthlyMatch;
        }
```

And the annual basis block guard changes from `if (!isRetired)` to `if (isAccumulating)` (contents unchanged).

**(d)** Extract the strategy-order draw loop so semi-retired years can reuse it. Right after the Roth-conversion block (after its closing `}`), add:

```js
    // Draw `needed` from accounts in strategy order. Mutates balances and
    // yearW, realizes brokerage gains. Returns any unmet remainder.
    const drawFromOrder = (needed, order) => {
      let rem = needed;
      for (const { key } of order) {
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
      return rem;
    };

    if (isSemiRetired && ptSpendNeed > 0) {
      strategy = computeWithdrawalOrder(age, rAge, { ...bal }, birthYear);
      drawFromOrder(ptSpendNeed, strategy.order);
    }
```

In the retired block, replace the existing inline loop

```js
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
```

with

```js
      drawFromOrder(rem, strategy.order);
```

(The RMD logic above it, including `strategy = computeWithdrawalOrder(...)` computed *before* the RMD, stays exactly as-is so retired-year output is unchanged.)

**(e)** In `data.push({...})`, change

```js
      employerMatchAnnual: isRetired ? 0 : Math.round(employerAnnualMatch),
```

to

```js
      employerMatchAnnual: isAccumulating ? Math.round(employerAnnualMatch) : 0,
      partTimeIncome:        Math.round(ptIncomeYr),
      partTimeContribAnnual: Math.round(ptScale * ptPlannedMonthly * 12),
      partTimeMatchAnnual:   Math.round(ptMatchAnnual),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: ALL tests pass — the new part-time describe block AND every pre-existing test (the retired-branch refactor must not change behavior).

- [ ] **Step 5: Commit**

```bash
git add src/engine.js src/__tests__/engine.test.js
git commit -m "feat(engine): add semi-retired phase — part-time income offsets spending, shortfall drawn brokerage-first"
```

---

### Task 2: Engine — part-time contributions capped at leftover income

**Files:**
- Modify: `src/engine.js` (semi-retired setup block, monthly loop, basis block — all added/touched in Task 1)
- Test: `src/__tests__/engine.test.js`

**Interfaces:**
- Consumes: `ptc`, `ptPlannedMonthly`, `ptScale` (declared in Task 1, still always 0), semi-retired `leftover`.
- Produces: `ptScale` ∈ [0,1] — the fraction of planned part-time contributions actually funded; contribution-basis trackers extended through semi-retired years. Task 3 computes match from `ptScale * (ptc.trad401k + ptc.roth401k)`.

- [ ] **Step 1: Write the failing tests**

Append inside the `runProjection — part-time phase` describe block:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run -t "part-time"`
Expected: FAIL — the four new tests fail (`partTimeContribAnnual` stays 0, balances don't grow). Task 1 tests still pass.

- [ ] **Step 3: Implement contribution funding**

Three edits in `src/engine.js`:

**(a)** In the semi-retired setup block (Task 1), after `ptSpendNeed = Math.max(0, -leftover);` add:

```js
      const plannedAnnual = ptPlannedMonthly * 12;
      if (leftover > 0 && plannedAnnual > 0) ptScale = Math.min(1, leftover / plannedAnnual);
```

**(b)** In the monthly growth loop, extend the phase branch:

```js
        if (isAccumulating) {
          bal[k] += clamp(accounts[k].monthly, 0, 50000);
          if (k === "trad401k") bal[k] += employerMonthlyMatch;
        } else if (isSemiRetired) {
          bal[k] += ptScale * ptc[k];
          if (k === "trad401k") bal[k] += ptMatchAnnual / 12;
        }
```

(`ptMatchAnnual` is still always 0 until Task 3 — the line is inert but placed now so Task 3 is engine-side match math only.)

**(c)** Extend the annual basis block:

```js
    if (isAccumulating) {
      trad401kContribBasis += clamp(accounts.trad401k.monthly, 0, 50000) * 12;
      trad401kMatchBasis   += employerAnnualMatch;
      roth401kContribBasis += clamp(accounts.roth401k.monthly, 0, 50000) * 12;
      rothIRAContribBasis  += clamp(accounts.rothIRA.monthly,  0, 50000) * 12;
      brokerageBasis       += clamp(accounts.brokerage.monthly, 0, 50000) * 12;
    } else if (isSemiRetired) {
      trad401kContribBasis += ptScale * ptc.trad401k * 12;
      trad401kMatchBasis   += ptMatchAnnual;
      roth401kContribBasis += ptScale * ptc.roth401k * 12;
      rothIRAContribBasis  += ptScale * ptc.rothIRA  * 12;
      brokerageBasis       += ptScale * ptc.brokerage * 12;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: ALL pass.

- [ ] **Step 5: Commit**

```bash
git add src/engine.js src/__tests__/engine.test.js
git commit -m "feat(engine): part-time contributions funded from leftover income, scaled when short"
```

---

### Task 3: Engine — part-time employer match

**Files:**
- Modify: `src/engine.js` (semi-retired setup block)
- Test: `src/__tests__/engine.test.js`

**Interfaces:**
- Consumes: `computeEmployerMatch({ income, matchPct, capPct, employeeMonthly })` (existing, unchanged), `ptScale`, `ptc`, `ptIncomeYr`, `partTimeMatchPct`, `partTimeMatchCapPct`.
- Produces: `ptMatchAnnual` — per-year part-time match dollars; flows into `bal.trad401k` monthly (wiring already in place from Task 2) and `trad401kMatchBasis`; reported as `partTimeMatchAnnual`.

- [ ] **Step 1: Write the failing tests**

Append inside the part-time describe block:

```js
  it("part-time employer match lands in trad401k and tracks match basis", () => {
    const data = runProjection(baseParams({
      currentAge: 54, retirementAge: 65, lifeExpectancy: 70,
      withdrawalMode: "fixed", annualSpending: 0,
      partTimeEnabled: true, partTimeStartAge: 55, partTimeIncome: 40000,
      partTimeContrib: { trad401k: 200, roth401k: 0, rothIRA: 0, brokerage: 0 },
      partTimeMatchPct: 100, partTimeMatchCapPct: 6,
    }));
    const y = data.find(d => d.age === 55);
    // $2,400/yr employee = 6% of $40K → fully matched: $2,400
    expect(y.partTimeMatchAnnual).toBeCloseTo(2400, -1);
    expect(y.trad401k).toBeCloseTo(2400 + 2400, -1);
    expect(y.trad401kMatchBasis).toBeCloseTo(2400, -1);
  });

  it("match scales with actual (leftover-capped) contributions", () => {
    const data = runProjection(baseParams({
      currentAge: 54, retirementAge: 65, lifeExpectancy: 70,
      withdrawalMode: "fixed", annualSpending: 37600,
      partTimeEnabled: true, partTimeStartAge: 55, partTimeIncome: 40000,
      partTimeContrib: { trad401k: 400, roth401k: 0, rothIRA: 0, brokerage: 0 },
      partTimeMatchPct: 100, partTimeMatchCapPct: 6,
    }));
    const y = data.find(d => d.age === 55);
    // leftover $2,400 of $4,800 planned → scale 0.5 → employee $2,400/yr = 6% of $40K → match $2,400
    expect(y.partTimeContribAnnual).toBeCloseTo(2400, -1);
    expect(y.partTimeMatchAnnual).toBeCloseTo(2400, -1);
  });

  it("no part-time match when part-time 401(k) contributions are zero", () => {
    const data = runProjection(baseParams({
      currentAge: 54, retirementAge: 65, lifeExpectancy: 70,
      withdrawalMode: "fixed", annualSpending: 0,
      partTimeEnabled: true, partTimeStartAge: 55, partTimeIncome: 40000,
      partTimeContrib: { trad401k: 0, roth401k: 0, rothIRA: 500, brokerage: 0 },
      partTimeMatchPct: 100, partTimeMatchCapPct: 6,
    }));
    expect(data.find(d => d.age === 55).partTimeMatchAnnual).toBe(0);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run -t "part-time"`
Expected: FAIL — first two new tests fail (`partTimeMatchAnnual` stays 0). Third passes trivially; it guards the contribution-gated behavior.

- [ ] **Step 3: Implement the match**

In the semi-retired setup block, after the `ptScale` assignment, add:

```js
      ptMatchAnnual = computeEmployerMatch({
        income: ptIncomeYr,
        matchPct: partTimeMatchPct,
        capPct: partTimeMatchCapPct,
        employeeMonthly: ptScale * (ptc.trad401k + ptc.roth401k),
      });
```

(Monthly deposit into `bal.trad401k` and the `trad401kMatchBasis` line were pre-wired in Task 2.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: ALL pass.

- [ ] **Step 5: Commit**

```bash
git add src/engine.js src/__tests__/engine.test.js
git commit -m "feat(engine): separate part-time employer match on actual part-time 401(k) contributions"
```

---

### Task 4: Engine — tax treatment of part-time income

**Files:**
- Modify: `src/engine.js` (`grossInc` line)
- Test: `src/__tests__/engine.test.js`

**Interfaces:**
- Consumes: `ptIncomeYr`, `ptScale`, `ptc`, `isSemiRetired`, existing `grossInc`/`estTax` pipeline.
- Produces: part-time income (net of pre-tax Trad 401(k) part-time contributions) included in `grossInc`, flowing into `estTax`, `marginalRate`, LTCG stacking, and state tax automatically.

- [ ] **Step 1: Write the failing tests**

Append inside the part-time describe block:

```js
  it("part-time income is taxed; trad 401(k) part-time contributions reduce it", () => {
    const mk = (contrib) => runProjection(baseParams({
      currentAge: 54, retirementAge: 65, lifeExpectancy: 70,
      withdrawalMode: "fixed", annualSpending: 0,
      partTimeEnabled: true, partTimeStartAge: 55, partTimeIncome: 60000,
      partTimeContrib: contrib,
    }));
    const none = mk({ trad401k: 0, roth401k: 0, rothIRA: 0, brokerage: 0 });
    const trad = mk({ trad401k: 1000, roth401k: 0, rothIRA: 0, brokerage: 0 });
    // $60K gross − $15K std deduction = $45K taxable → 1192.5 + (45000−11925)×0.12 = 5161.5
    expect(none.find(d => d.age === 55).estTax).toBeCloseTo(5162, -1);
    // $12K pre-tax 401(k) → $48K gross → $33K taxable → 1192.5 + (33000−11925)×0.12 = 3721.5
    expect(trad.find(d => d.age === 55).estTax).toBeCloseTo(3722, -1);
    // Full-time years remain untaxed by the engine (existing behavior)
    expect(none.find(d => d.age === 54).estTax).toBe(0);
  });

  it("brokerage gains realized in semi-retired years stack on part-time income (CA ordinary)", () => {
    const data = runProjection(baseParams({
      currentAge: 54, retirementAge: 65, lifeExpectancy: 70,
      withdrawalMode: "fixed", annualSpending: 60000,
      accounts: baseAccounts({ brokerage: { balance: 400000, costBasis: 200000 } }),
      partTimeEnabled: true, partTimeStartAge: 55, partTimeIncome: 40000,
      stateTax: "ca",
    }));
    const y = data.find(d => d.age === 55);
    expect(y.capGains).toBeCloseTo(10000, -1); // $20K sold, half is gain
    expect(y.stateTax).toBeGreaterThan(0);      // CA taxes income + gains as ordinary
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run -t "part-time"`
Expected: FAIL — `estTax` is 0 in semi-retired years with no withdrawals (part-time income not yet in `grossInc`).

- [ ] **Step 3: Implement**

In `src/engine.js`, replace

```js
    const grossInc   = yearW.trad401k + penAnnual + ssAnnual * 0.85 + conversion;
```

with

```js
    // Part-time wages are ordinary income; part-time Trad 401(k) deferrals are pre-tax.
    const ptTaxable  = isSemiRetired ? Math.max(0, ptIncomeYr - ptScale * ptc.trad401k * 12) : 0;
    const grossInc   = yearW.trad401k + penAnnual + ssAnnual * 0.85 + conversion + ptTaxable;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: ALL pass (state-tax and LTCG stacking flow through `grossInc` automatically).

- [ ] **Step 5: Commit**

```bash
git add src/engine.js src/__tests__/engine.test.js
git commit -m "feat(engine): tax part-time income as ordinary, net of pre-tax 401(k) deferrals"
```

---

### Task 5: UI state — defaults, persistence, params wiring, limit warnings

**Files:**
- Modify: `src/retirement-planner.jsx`

**Interfaces:**
- Consumes: engine params from Tasks 1–4; existing `DEFAULTS` / `loadSavedState` / `resetAll` / `baseProjectionParams` / `limitWarns` patterns; `contributionLimit401k`, `contributionLimitIRA`, `fmtFull`, `clamp`, `safeNum` (already imported).
- Produces: `partTime` state object `{ enabled, startAge, income, contrib: { trad401k, roth401k, rothIRA, brokerage }, matchPct, matchCapPct }` and setter `setPartTime`; derived `safePartTimeStartAge`; `withdrawalData` starting at the part-time age when enabled. Task 6's `PartTimeCard` receives `partTime` + `setPartTime`; Task 7's chart receives `safePartTimeStartAge`.

There is no UI test harness in this repo; this task is verified by the engine test suite still passing, lint, and the browser verification in Task 8.

- [ ] **Step 1: Add defaults**

In `DEFAULTS` (after `spendingPhases: ...`):

```js
  partTime: {
    enabled: false, startAge: 55, income: 30000,
    contrib: { trad401k: 0, roth401k: 0, rothIRA: 0, brokerage: 0 },
    matchPct: 0, matchCapPct: 6,
  },
```

- [ ] **Step 2: Merge on load**

In `loadSavedState`'s return object (after the `spendingPhases` merge line):

```js
      partTime: {
        ...DEFAULTS.partTime, ...(saved.partTime ?? {}),
        contrib: { ...DEFAULTS.partTime.contrib, ...(saved.partTime?.contrib ?? {}) },
      },
```

- [ ] **Step 3: State, persistence, reset, derived values**

Add state (after the `spendingPhases` useState line):

```js
  const [partTime, setPartTime] = useState(saved.partTime ?? DEFAULTS.partTime);
```

Add `partTime,` to the persisted object inside the `localStorage.setItem` call AND add `partTime` to that effect's dependency array.

In `resetAll`, add `setPartTime(DEFAULTS.partTime);` before `setMcResult(null);`.

After the `rmdAge` line, add:

```js
  const safePartTimeStartAge = clamp(partTime.startAge, safeCurrentAge + 1, Math.max(safeCurrentAge + 1, safeRetirementAge - 1));
```

- [ ] **Step 4: Wire params into the projection**

In `baseProjectionParams`, add before the closing brace:

```js
    partTimeEnabled: partTime.enabled, partTimeStartAge: partTime.startAge,
    partTimeIncome: partTime.income, partTimeContrib: partTime.contrib,
    partTimeMatchPct: partTime.matchPct, partTimeMatchCapPct: partTime.matchCapPct,
```

and add `partTime` to the useMemo dependency array. (The SS optimizer and no-conversion comparison inherit automatically.)

- [ ] **Step 5: Withdrawal chart start age + limit warnings**

Replace

```js
  const withdrawalData = projection.filter(d => d.age >= safeRetirementAge);
```

with

```js
  const withdrawalStartAge = partTime.enabled ? Math.min(safePartTimeStartAge, safeRetirementAge) : safeRetirementAge;
  const withdrawalData = projection.filter(d => d.age >= withdrawalStartAge);
```

After the existing `if (iraAnnual > iraLimit) ...` line, add:

```js
  if (partTime.enabled) {
    const ptK401 = (safeNum(partTime.contrib.trad401k) + safeNum(partTime.contrib.roth401k)) * 12;
    const ptK401Limit = contributionLimit401k(safePartTimeStartAge);
    if (ptK401 > ptK401Limit) limitWarns.push(`Part-time 401(k) contributions of ${fmtFull(ptK401)}/yr exceed the ${fmtFull(ptK401Limit)} employee limit (2025, age ${safePartTimeStartAge}).`);
    const ptIra = safeNum(partTime.contrib.rothIRA) * 12;
    const ptIraLimit = contributionLimitIRA(safePartTimeStartAge);
    if (ptIra > ptIraLimit) limitWarns.push(`Part-time Roth IRA contributions of ${fmtFull(ptIra)}/yr exceed the ${fmtFull(ptIraLimit)} limit (2025, age ${safePartTimeStartAge}).`);
  }
```

- [ ] **Step 6: Verify and commit**

Run: `npm test && npm run lint`
Expected: tests pass; lint clean (no unused vars — `withdrawalStartAge` and `safePartTimeStartAge` are both used; `safePartTimeStartAge` is also used by Tasks 6–7's props, which don't exist yet, and that's fine since it's used here).

```bash
git add src/retirement-planner.jsx
git commit -m "feat(ui): part-time state, persistence, projection params, limit warnings"
```

---

### Task 6: UI — PartTimeCard component

**Files:**
- Modify: `src/components/IncomePanels.jsx` (add `PartTimeCard` export)
- Modify: `src/retirement-planner.jsx` (render it)

**Interfaces:**
- Consumes: `partTime` state object + `setPartTime` from Task 5; existing `IncomeCard`, `NumberInput`, `Toggle`, `fmtFull`, `safeNum`.
- Produces: `PartTimeCard({ partTime, onChange, currentAge, retirementAge, annualSpending, withdrawalMode })` — all inputs hidden when toggled off (IncomeCard behavior), values preserved.

- [ ] **Step 1: Add the component**

In `src/components/IncomePanels.jsx`, add `NumberInput` to the ui.jsx import:

```js
import { Toggle, NumberInput } from "./ui.jsx";
```

Append at the end of the file:

```jsx
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
```

- [ ] **Step 2: Render it**

In `src/retirement-planner.jsx`, update the IncomePanels import:

```js
import { IncomeCard, SSOptimizerPanel, PartTimeCard } from "./components/IncomePanels.jsx";
```

In the "Retirement income sources" grid (the `<div className="grid md:grid-cols-2 gap-4">` containing the SS and Pension `IncomeCard`s), add after the Pension card:

```jsx
          <PartTimeCard partTime={partTime} onChange={setPartTime}
            currentAge={safeCurrentAge} retirementAge={safeRetirementAge}
            annualSpending={annualSpending} withdrawalMode={withdrawalMode} />
```

- [ ] **Step 3: Verify and commit**

Run: `npm test && npm run lint && npm run build`
Expected: all pass, build succeeds.

```bash
git add src/components/IncomePanels.jsx src/retirement-planner.jsx
git commit -m "feat(ui): Part-Time Work income card with contributions, match, and coverage readout"
```

---

### Task 7: Chart — semi-retirement band and marker

**Files:**
- Modify: `src/components/charts.jsx` (`ProjectionChart`)
- Modify: `src/retirement-planner.jsx` (pass the prop)

**Interfaces:**
- Consumes: `safePartTimeStartAge` and `partTime.enabled` from Task 5.
- Produces: `ProjectionChart` accepts optional `partTimeStartAge` (number | null; null = feature off).

- [ ] **Step 1: Extend ProjectionChart**

Change the signature:

```js
export function ProjectionChart({ projection, currentAge, retirementAge, lifeExpectancy, rmdAge, partTimeStartAge = null }) {
```

Add a part-time entry to the `spine` array (immediately after the `Retire` entry so the collision filter favors Retire):

```js
    ...(partTimeStartAge != null ? [{ age: partTimeStartAge, label: "Part-time", color: "#B4642D" }] : []),
```

Add the phase band alongside the existing `ReferenceArea`s (before the tax-optimization band):

```jsx
        {partTimeStartAge != null && partTimeStartAge < retirementAge && (
          <ReferenceArea x1={Math.max(partTimeStartAge, currentAge)} x2={retirementAge} fill="#B4642D" fillOpacity={0.05} />
        )}
```

- [ ] **Step 2: Pass the prop**

In `src/retirement-planner.jsx`, the `<ProjectionChart ... />` call gains:

```jsx
            partTimeStartAge={partTime.enabled ? safePartTimeStartAge : null}
```

Also update the hero card's shading legend line from

```jsx
            <p className="text-xs text-haze hidden sm:block">shaded: <span className="text-evergreen-dark">conversion window</span> · <span className="text-danger">RMD years</span></p>
```

to

```jsx
            <p className="text-xs text-haze hidden sm:block">shaded: {partTime.enabled && <><span className="text-copper">part-time</span> · </>}<span className="text-evergreen-dark">conversion window</span> · <span className="text-danger">RMD years</span></p>
```

- [ ] **Step 3: Verify and commit**

Run: `npm test && npm run lint && npm run build`
Expected: all pass.

```bash
git add src/components/charts.jsx src/retirement-planner.jsx
git commit -m "feat(charts): shade the semi-retirement window on the projection chart"
```

---

### Task 8: End-to-end verification

**Files:** none (verification only; fix-forward if issues are found)

- [ ] **Step 1: Full automated pass**

Run: `npm test && npm run lint && npm run build`
Expected: every test passes, lint clean, production build succeeds.

- [ ] **Step 2: Browser verification**

Start the Vite dev server (port 5173) via the browser-preview tooling (create `.claude/launch.json` with `{"version":"0.0.1","configurations":[{"name":"dev","runtimeExecutable":"npm","runtimeArgs":["run","dev"],"port":5173}]}` if missing — never run the dev server via plain Bash). Then verify:

1. Load the app; confirm no console errors, the Part-Time Work card renders (toggled off, dimmed) next to Social Security and Pension.
2. Toggle Part-Time Work on → inputs appear. Set: birth year 1980, retire at 65, start age 55, income $40,000, spending $60,000. Confirm the readout shows ~$20,000/yr drawn from savings, the withdrawals chart now starts at 55 with brokerage bars, and the projection chart shows the "Part-time" band ending at the Retire line.
3. Set income to $80,000 and Roth IRA part-time contribution to $500/mo. Confirm the readout flips to leftover/funded-% mode and the sticky-bar "At 65" total increases.
4. Set Match % 100, cap 6, with 401(k) part-time contributions at $0 → the "no match will be earned" hint shows; set Trad 401(k) to $200/mo → hint disappears.
5. Toggle the card off → inputs collapse, projection returns to two-phase; toggle back on → values were preserved.
6. Reload the page → part-time settings persisted via localStorage.
7. Click Reset All → part-time returns to defaults (off).

Take a screenshot of the enabled state for the final report.

- [ ] **Step 3: Commit any fixes**

If verification exposed issues, fix, re-run `npm test && npm run lint`, and commit with a message describing the fix.
