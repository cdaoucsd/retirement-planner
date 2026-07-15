# Part-Time Work Phase (Semi-Retirement) — Design Spec

**Date:** 2026-07-15
**Status:** Approved by user

## Overview

Add an optional third phase to the retirement projection between accumulation and
full retirement: a **semi-retired / part-time work phase** (e.g., ages 55–65).
During this phase the user earns part-time income that offsets living expenses;
any shortfall is drawn from savings (brokerage-first), and any surplus can fund
user-specified part-time contributions with a separate part-time employer match.

Today the engine has exactly two phases split at `retirementAge`:

- **Accumulating** (`age < retirementAge`): monthly contributions + employer match flow in.
- **Retired** (`age >= retirementAge`): withdrawals via `computeWithdrawalOrder`,
  SS/pension income, Roth conversions, RMDs.

This feature inserts:

- **Semi-retired** (`partTimeStartAge <= age < retirementAge`, only when enabled).

## User decisions (locked)

1. **Full-time contributions and full-time employer match stop** at the part-time start age.
2. **Shortfall funding:** brokerage first, then the existing pre-59½ withdrawal
   order (Roth contributions, then penalty-flagged 401(k)) — i.e., exactly
   `computeWithdrawalOrder` for that age.
3. **Part-time income is gross** and taxed by the engine (federal + state brackets),
   consistent with retirement withdrawals. Income is entered in today's dollars and
   **inflation-adjusted** each year (like SS, unlike pension).
4. **Spending during part-time years** uses the existing inflation-adjusted
   `annualSpending` (no separate input). Spending-phase multipliers still apply
   (they are a no-op before retirement age since their minimum age is retirement age).
5. **Part-time contributions are separate inputs:** a monthly amount per account
   (Trad 401(k), Roth 401(k), Roth IRA, Brokerage), defaulting to $0, applying only
   during the semi-retired phase, **capped at leftover income**.
6. **Part-time employer match is separate inputs** (match % + cap % of salary),
   computed against part-time income and *actual* (possibly scaled) part-time
   401(k) contributions; flows into Trad 401(k) monthly; not taxed, doesn't consume
   leftover income. Full-time match inputs remain untouched and stop at part-time start.
7. **UI collapse:** all part-time inputs live inside one `IncomeCard` with a toggle;
   toggling off hides the inputs (standard IncomeCard behavior) and the engine
   ignores all part-time params. Entered values persist while toggled off.

## Engine changes (`src/engine.js`)

### New `runProjection` params

```js
partTimeEnabled = false,
partTimeStartAge = 55,        // clamped to [currentAge + 1, retirementAge - 1]
partTimeIncome = 0,           // gross annual, today's dollars, inflation-adjusted
partTimeContrib = { trad401k: 0, roth401k: 0, rothIRA: 0, brokerage: 0 }, // $/mo
partTimeMatchPct = 0,         // employer match % during part-time years
partTimeMatchCapPct = 6,      // match cap as % of part-time salary
```

When `partTimeEnabled` is false, behavior must be byte-identical to today.

### Phase logic

```js
const ptAge = clamp(partTimeStartAge, cAge + 1, rAge - 1);  // when enabled
const isRetired      = age >= rAge;                          // unchanged
const isSemiRetired  = partTimeEnabled && age >= ptAge && !isRetired;
const isAccumulating = !isRetired && !isSemiRetired;
```

- Full-time contributions and full-time employer match are gated on
  `isAccumulating` (was `!isRetired`).

### Semi-retired year mechanics (per year, in order)

1. **Income & leftover.** `ptIncomeYr = partTimeIncome * yearInfl`.
   `spendYr = spending * spendingMultiplier(age, phases) * yearInfl`.
   `leftover = ptIncomeYr - spendYr`.
2. **Contributions (leftover > 0 only).**
   `plannedAnnual = sum(partTimeContrib) * 12`.
   `scale = plannedAnnual > 0 ? min(1, max(0, leftover) / plannedAnnual) : 0`.
   Scaled monthly contributions are added inside the monthly growth loop
   (same pattern as accumulation). Contribution basis trackers
   (`trad401kContribBasis`, `roth401kContribBasis`, `rothIRAContribBasis`,
   `brokerageBasis`) accumulate the scaled amounts.
3. **Part-time employer match.** Computed with `computeEmployerMatch` using
   `income = ptIncomeYr`, `matchPct = partTimeMatchPct`, `capPct = partTimeMatchCapPct`,
   and `employeeMonthly = scaled part-time (trad401k + roth401k) monthly`.
   Match flows into Trad 401(k) monthly; `trad401kMatchBasis` accumulates it.
   Match is computed per-year (scale can change year to year).
4. **Shortfall withdrawal (leftover < 0 only).**
   `needed = -leftover`, withdrawn via `computeWithdrawalOrder(age, rAge, balances, birthYear)`
   with the same brokerage-sale gain realization and Roth-IRA-layer penalty
   tracking as retirement years. Contributions and withdrawals are mutually
   exclusive within a year.
5. **Taxes (display, consistent with existing engine).**
   Part-time gross income joins `grossInc`; scaled **Trad 401(k) part-time
   contributions reduce it** (pre-tax). Realized brokerage gains stack as LTCG
   (or ordinary for CA). Surplus beyond planned contributions is treated like
   unspent salary today: not swept anywhere.

### Unchanged subsystems

- **Roth conversions** and **RMDs**: still gated on full retirement (`isRetired` /
  `age >= rmdAge`). No changes.
- **Monte Carlo** (`runMonteCarlo`): no changes — it starts from the projected
  balance at `retirementAge`, which already reflects part-time drawdown/savings.
- **Rule of 55 flag** in `computeWithdrawalOrder`: unchanged (keyed off
  `retirementAge`); pre-59½ semi-retired 401(k) draws stay conservatively
  penalty-flagged.

### New per-year output fields

- `partTimeIncome` (rounded annual, 0 outside the phase)
- `partTimeMatchAnnual` (rounded, 0 outside the phase)
- `partTimeContribAnnual` (rounded total actually contributed, 0 outside the phase)

`employerMatchAnnual` (existing field) reports the full-time match and becomes 0
once `isAccumulating` is false.

## UI changes

### `src/components/IncomePanels.jsx` — new part-time card content

A third `IncomeCard` ("Part-Time Work", its own icon/color) rendered alongside
Social Security and Pension in the *Money In* grid. Contents (all hidden by the
card's toggle when disabled):

- **Start Age** (min `currentAge + 1`, max `retirementAge - 1`)
- **Gross Annual Income** (today's dollars; helper text notes inflation adjustment
  and that income is taxed)
- **Contributions during part-time years:** compact grid of four monthly inputs
  (Trad 401(k), Roth 401(k), Roth IRA, Brokerage)
- **Part-time employer match:** Match % + Match Cap (% of salary)
- **Readout:** income vs. year-1 spending; either "gap drawn from savings: $X/yr"
  or "leftover after spending: $X/yr" with how much of planned contributions it
  funds; "missing free money" hint when match % > 0 but part-time 401(k)
  contributions are $0.

### `src/retirement-planner.jsx`

- New state: `partTimeEnabled`, `partTimeStartAge`, `partTimeIncome`,
  `partTimeContrib` (object), `partTimeMatchPct`, `partTimeMatchCapPct`.
- Added to `DEFAULTS`, localStorage persistence (same `v3` key — new fields merge
  via existing `{ ...DEFAULTS, ...saved }` spread; `partTimeContrib` needs a
  nested merge like `spendingPhases`), `resetAll`, and `baseProjectionParams`
  (SS optimizer inherits automatically).
- IRS contribution-limit warnings extended: part-time 401(k) and IRA monthly
  inputs checked against annual limits (using current age, same as existing checks).
- Withdrawals-by-source section: when part-time is enabled, filter from
  `partTimeStartAge` instead of `retirementAge` (withdrawals can now occur there).

### `src/components/charts.jsx`

- Projection chart: shaded band or reference line marking the semi-retirement
  window (part-time start → retirement age), consistent with the existing
  conversion-window / RMD shading.

## Validation & edge cases

- `partTimeStartAge` clamped to `[currentAge + 1, retirementAge - 1]`; if the
  window is empty (retirement age ≤ current age + 1), the phase never activates.
- `partTimeIncome = 0` with the toggle on = early drawdown-only phase (valid).
- All-accounts depletion before retirement age: existing depletion warning and
  Roth penalty-risk tracking cover it; no new alert needed.
- Toggling off preserves entered values (state persists; engine just ignores it).
- Input limits: reuse `INPUT_LIMITS.income` for part-time income,
  `INPUT_LIMITS.monthly` for contribution inputs, `matchPct`/`matchCapPct` for match.

## Testing (`src/__tests__/engine.test.js`)

1. **Regression:** `partTimeEnabled: false` (and param omitted) produces output
   identical to current behavior.
2. Contributions + full-time match stop at `partTimeStartAge`; resume never.
3. Shortfall year: withdrawal happens brokerage-first; no part-time contributions.
4. Surplus year: contributions fund in full; excess surplus not swept.
5. Partial leftover: contributions scale proportionally; total contributed equals
   leftover.
6. Part-time match: computed on scaled 401(k) contributions; lands in trad401k;
   `trad401kMatchBasis` grows; $0 when no part-time 401(k) contributions.
7. Tax: part-time income appears in `estTax` basis; trad 401(k) part-time
   contribution reduces it; brokerage-sale gains produce LTCG (and CA ordinary
   treatment when `stateTax: 'ca'`).
8. Inflation: part-time income and spending both inflate; leftover math uses
   same-year dollars.
9. Clamping: `partTimeStartAge` outside `[currentAge+1, retirementAge-1]` clamps.
10. Basis continuity: Roth IRA contribution basis added during part-time years is
    withdrawable penalty-free in later years.
