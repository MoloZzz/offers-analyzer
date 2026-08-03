# Feature Specification: Graded accident risk

**Feature Branch**: `018-graded-accident-risk`

**Created**: 2026-08-03

**Status**: Draft

**Input**: Operator request 2026-08-03 — "I don't want to drop all cars after accidents (it could be
a small one) — we need to specify new logic for this." Ratified as
[ADR-0020](../../knowledge-offers-analyzer/decisions/0020-graded-accident-risk.md), which narrows
[ADR-0018](../../knowledge-offers-analyzer/decisions/0018-assessment-confidence-and-monetary-output.md) §5.

## Context & Problem

Two independent rules currently kill any listing associated with an accident:

```
{ code: 'damaged',             disqualifying: true }   // AUTO.RIA autoInfoBar
{ code: 'desc_after_accident', disqualifying: true }   // condition.ts lexicon
```

A disqualifier clamps `score ≤ 0`, so the listing can never become an Opportunity regardless of
price. The description path is the sharper defect: `AFTER_ACCIDENT_PLAIN` groups `'після дтп'` /
`'после дтп'` with `'тотал'` and `'розбит'`. A seller who honestly writes *«після ДТП замінено
бампер»* is treated as a total loss — and is killed even when the AUTO.RIA damage bar is clean.
Honest disclosure of trivial damage is punished exactly as hard as concealed structural damage.

Lightly damaged cars bought cheap and resold after a modest repair are ordinary operator business.
The system cannot see them at all.

**The hard part is not grading — it is not being gamed.** Seller text systematically understates
damage; nobody advertises cut pillars. Any rule where a seller can type their way to a lower penalty
is worse than the blunt clamp it replaces.

**What already exists and is NOT rebuilt here**: the negation-aware, uk+ru guarded-phrase scanner
(`condition.ts`), the red-flag engine and its soft-penalty composition (`red-flags.ts`), learnable
soft-flag weights (spec 002 E4), versioned heuristic tables and `ParameterSet` mechanics (ADR-0005),
and the persisted evaluation explanation (B23).

## Guiding constraints (non-negotiable — ADR-0020)

- **A cheap trap is still not a deal.** A hard floor remains for write-off and structural evidence
  (ADR-0006 invariant preserved, not abandoned).
- **Text may raise severity freely; it may lower it only with corroboration.** Same asymmetry
  ADR-0014 applies to claimed mileage.
- **`unknown` is penalized, not excused.** Absence of lexical evidence is not evidence of minor
  damage.
- **Shadow before flip.** The classifier records its verdict while the current clamp stays live. The
  flip is one operator-approved `ParameterSet` change under ADR-0011.
- **No structured-severity claim.** This spec never asserts damage location, airbag state, or frame
  condition — ADR-0018 §5 still blocks that.
- **Zero API budget.** Classification uses the already-fetched risk bar and stored description.

## User Scenarios & Testing *(mandatory)*

### User Story 18.1 — Severity classifier (Foundational, blocking)

A pure classifier maps the AUTO.RIA risk bar plus the stored description to one of
`cosmetic | moderate | severe | unknown`, with the matched evidence listed. `severe` is reached by
write-off, structural, or integrity markers — total loss, cut or replaced pillars and roof, deployed
airbags, altered geometry, flood, rollover, «конструктор», «розпил». `cosmetic` and `moderate` are
reached only by their own markers. `damaged = true` with no lexical hit yields `unknown`.

**Why this priority**: everything else consumes this verdict, and the anti-gaming property lives
here.

**Independent Test**: a corpus of real uk+ru descriptions classifies with no `severe` case
downgraded; «після ДТП замінено бампер» yields at most `unknown` without VIN evidence and `cosmetic`
with it; «розбитий, тотал» yields `severe`.

**Acceptance Scenarios**:

1. **Given** a description containing a structural or write-off marker, **Then** severity is
   `severe` and every matched marker is listed as evidence.
2. **Given** a description claiming only cosmetic damage and **no** VIN evidence, **Then** severity
   is `unknown` — never `cosmetic` (corroboration asymmetry, ADR-0020 §4).
3. **Given** the same description **with** VIN evidence, **Then** severity may be `cosmetic`.
4. **Given** `damaged = true` and an empty or uninformative description, **Then** severity is
   `unknown` with a "severity not established" reason.
5. **Given** a negated phrase («не був у ДТП», «без ДТП»), **Then** no accident severity fires — the
   existing negation guard applies unchanged.

---

### User Story 18.2 — Shadow recording and rollout report (Priority: P1, ungated)

The classifier runs on every evaluation and persists its verdict in the evaluation explanation
**while the current hard disqualifier stays live**. An admin-only report shows how many listings the
clamp is currently suppressing, their distribution across severity buckets, and what their scores
would have been.

**Why this priority**: this is the evidence ADR-0011 requires, and it is obtainable with no
behaviour change at all. It also answers the honest question — if suppressed listings were reliably
bad, the clamp was earned and the flip should not happen.

**Independent Test**: with shadow recording enabled, `score`, `isOpportunity`, and the alert set are
bit-for-bit identical to the disabled run, while every evaluation carries a severity verdict.

**Acceptance Scenarios**:

1. **Given** shadow mode, **Then** the alert set is provably unchanged and every evaluation records
   a severity verdict with its evidence.
2. **Given** a month of shadow data, **Then** the report shows suppressed-listing counts by bucket,
   their would-be scores, and how many later relisted or sold.
3. **Given** the report, **Then** it states explicitly that it authorizes a review, not a flip.

---

### User Story 18.3 — Graded penalties behind a ParameterSet flip (Priority: P1, gated)

On an operator-approved `ParameterSet` change, `damaged` and `desc_after_accident` stop
disqualifying and become graded soft penalties keyed by bucket: `cosmetic` small, `moderate`
larger, `unknown` medium plus a "verify before travelling" marker. `severe` and `salvage` remain
hard disqualifiers.

**Why this priority**: it is the operator's actual request — but it changes the alert set, so it
cannot precede US18.2's evidence.

**Independent Test**: with the flip off, behaviour equals today exactly; with it on, a `cosmetic`
listing at the same discount alerts where it previously could not, while a `severe` one still
cannot.

**Acceptance Scenarios**:

1. **Given** the flip disabled, **Then** behaviour is bit-for-bit identical to pre-018.
2. **Given** the flip enabled and a `severe` or `salvage` listing, **Then** it is still
   disqualified regardless of discount.
3. **Given** the flip enabled and an `unknown` listing, **Then** a bounded penalty applies **and**
   the alert carries the verify-before-travelling marker.
4. **Given** the flip enabled, **Then** penalty magnitudes come from the `ParameterSet` and the
   change is revertible by reactivating the prior version.

---

### User Story 18.4 — Explanation and operator-facing reasons (Priority: P2)

The severity verdict, its matched evidence, whether corroboration was present, and the applied
penalty appear in the evaluation breakdown (spec 016) and in `/why`. An accident-flagged listing
always tells the operator *what is known* and *what is not*.

**Why this priority**: an accident car that now alerts is only useful if the operator can see why
the system thinks it is survivable.

**Independent Test**: a listing at each severity renders a distinct, evidence-cited explanation
line; `unknown` says severity was not established rather than implying minor damage.

**Acceptance Scenarios**:

1. **Given** any accident-flagged listing, **Then** `/why` names the bucket, the matched markers,
   and whether VIN corroboration applied.
2. **Given** an `unknown` listing, **Then** the wording states severity is unestablished and never
   implies the damage was minor.

### Edge Cases

- Description mentions an accident on a *previous* car or a trade-in → the existing negation and
  guarded-phrase mechanics apply; unresolvable cases fall to `unknown`, never `cosmetic`.
- AUTO.RIA bar clean but the description discloses structural damage → `severe` fires from text
  alone; the bar is not required.
- `damaged = true` and the description claims no accident → contradiction resolves to `unknown` with
  both signals recorded, never to `cosmetic`.
- A `severe`-bucket listing that is also deeply discounted → still disqualified; the discount does
  not buy its way out.
- Interaction with `suspicious_discount > 45%` → **unchanged by this spec** and re-validated at
  rollout. A graded accident car that is legitimately half price is still killed by that separate
  rule; changing it needs its own decision.
- Lexicon errors → versioned config with an audit trail; a correction is a config change, and
  outcomes (spec 002) surface mistakes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A pure classifier MUST map the risk bar plus description to
  `cosmetic | moderate | severe | unknown` with matched evidence, using no new request type.
- **FR-002**: `salvage` and the `severe` bucket MUST remain hard disqualifiers in every
  configuration.
- **FR-003**: Description evidence MUST be able to raise severity, and MUST NOT lower it below
  `unknown` without VIN corroboration.
- **FR-004**: `unknown` MUST apply a bounded penalty and a verify-before-travelling marker, and its
  operator-facing wording MUST NOT imply minor damage.
- **FR-005**: In shadow mode the classifier MUST NOT change `score`, `priceCore`, `total100`,
  `isOpportunity`, or the alert set.
- **FR-006**: The transition from clamp to graded penalties MUST be a single `ParameterSet` change,
  revertible by reactivating the prior version, and MUST require operator approval per ADR-0011.
- **FR-007**: The rollout report MUST show suppressed-listing counts by bucket, their would-be
  scores, and subsequent relist/disappearance outcomes, and MUST state that it authorizes a review
  rather than a change.
- **FR-008**: Severity, evidence, corroboration state, and applied penalty MUST persist in the
  evaluation explanation and render in `/why` and the spec-016 breakdown.
- **FR-009**: The severity lexicon MUST be versioned config, hot-swappable per ADR-0005 mechanics.
- **FR-010**: Existing negation and guarded-phrase behaviour MUST be preserved unchanged.

### Key Entities

- **AccidentSeverity** (value object): `{ bucket, evidence[{ marker, source }], corroborated,
  reason }` — persisted with the evaluation explanation.
- **SeverityLexicon** (versioned config): marker lists per bucket, uk+ru, guarded where negation
  can flip meaning.
- **ParameterSet** (extended): per-bucket penalty magnitudes and the clamp-versus-graded flip.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In shadow mode, `score` and the alert set are bit-for-bit identical to the pre-018
  run across the full fixture corpus.
- **SC-002**: On a labelled description corpus, zero `severe` cases are classified below `severe`.
- **SC-003**: No description-only claim of minor damage reaches `cosmetic` without VIN
  corroboration.
- **SC-004**: The rollout report quantifies, for a full month, how many listings the clamp
  suppressed and their bucket distribution.
- **SC-005**: With the flip enabled, `severe` and `salvage` listings still never alert, at any
  discount, in any test permutation.
- **SC-006**: Poll-cycle API request count is unchanged.
- **SC-007**: After the flip, `/report` precision is comparable before and after over a matched
  window.

## Assumptions

- Lightly damaged cars are genuinely resaleable in the operator's market — this is the operator's
  domain claim and the premise of the whole change.
- The uk+ru lexicon can separate cosmetic from structural language well enough to be useful; it will
  be wrong sometimes, which is why `unknown` is the safe default and the floor for uncorroborated
  claims.
- `risk.vinChecked` / `hasVinReport` is an adequate corroboration signal, matching how ADR-0014 uses
  it for mileage.

## Out of scope (v1 of this spec)

- **Structured severity from the API** — damage location, airbag state, frame condition. Still
  blocked per ADR-0018 §5; reopening needs a VIN-report data decision.
- **Changing `suspicious_discount > 45%`** — a separate rule with a separate rationale.
- **Repair-cost estimation for the graded damage** — that is SPEC-006 `C_rec`, which consumes this
  bucket rather than duplicating it.
- **Photo/CV damage assessment** — deferred with the rest of CV.
- **Reclassifying `confiscated` / `under_credit`** — the backlog's paperwork-cost queue idea is a
  separate decision.

## Related

- [ADR-0020](../../knowledge-offers-analyzer/decisions/0020-graded-accident-risk.md) (authorizing) ·
  [ADR-0018](../../knowledge-offers-analyzer/decisions/0018-assessment-confidence-and-monetary-output.md) §5 (narrowed) ·
  [ADR-0006](../../knowledge-offers-analyzer/decisions/0006-operator-profit-vision.md) ·
  [ADR-0011](../../knowledge-offers-analyzer/decisions/0011-evidence-gated-scoring-rollout.md) ·
  [ADR-0014](../../knowledge-offers-analyzer/decisions/0014-conservative-benchmark-and-mileage-guard.md)
- Feeds: spec 006 (`C_rec`), spec 016 (breakdown rendering), spec 017 (`/analyze_ai` for ambiguous
  cases)
- Vault: `profitability-definition`, `glossary`, `when-to-alert`
