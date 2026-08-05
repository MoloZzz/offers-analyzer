# Feature Specification: Full evaluation breakdown — one renderer, three surfaces

**Feature Branch**: `016-full-evaluation-breakdown`

**Created**: 2026-08-03

**Status**: **Fully implemented 2026-08-05** — all four user stories (US16.1–US16.4, T001–T022).
Phases 1–2 (shared builder + **Деталі** button) and phases 3–4 (`/check` surface adoption +
forward-compatibility proof) all landed the same day. Presentation-only throughout, so the feature
sits outside the ADR-0011 evidence gates.

**Input**: Operator request 2026-08-03 — "I also want to receive a full (separate parameters)
description of the calculated listings in alerts." Delivery shape chosen by the operator: keep the
alert compact, add a **Деталі** inline button that expands the full breakdown.

## Context & Problem

The alert (`formatOpportunity`) carries seven lines: title, price versus market, discount and
confidence, rating, checks, seller, backlink. It reports *outputs*. The operator cannot see the
inputs that produced them — which cohort tier was resolved, how large the sample was, what the
mileage adjustment did to the base, how `raw × confidence × penalty` decomposed, which flags fired
and from which source, or which factor contributed what.

That information already exists. `EvaluationExplanation` persists all of it (B23), and
`formatWhy` / `formatStoredWhy` already render most of it. The gap is **reach**, not data: the
detail is only available by invoking `/why` with a listing reference, at the moment the operator is
looking at an alert that has the listing right there.

There is a second, quieter problem. Four formatters now render overlapping subsets of the same
evaluation — `formatOpportunity`, `formatPriceDrop`, `formatAssessment`, `formatWhy` /
`formatStoredWhy`. Each new parameter (factors from spec 003, `assessmentConfidence` and the `Z`
decomposition from spec 006) has to be added to each of them, and they will drift. This spec makes
the breakdown a single renderer consumed by every surface rather than adding a fifth variant.

**What already exists and is NOT rebuilt here**: the persisted `EvaluationExplanation` (B23), the
inline-button/callback plumbing (`outcome-callback.ts`, `deal-callback.ts`), the admin gate
(`isAdmin`), Ukrainian flag labels (`FLAG_LABELS`), and `/why`'s source-free rendering contract.

## Guiding constraints (non-negotiable)

- **The alert stays compact.** The pushed message keeps its current scannable shape. Detail is
  pulled, never pushed — the "don't spam the operator" rule applies to message length as well as
  frequency.
- **Zero API budget.** The breakdown renders from the persisted explanation. It MUST NOT trigger a
  source fetch, a re-score, or a cohort request.
- **Presentation only.** No scoring, threshold, `ParameterSet`, or alert-set change. This spec
  cannot alter which listings alert.
- **Degrade by omission.** A parameter absent from a persisted explanation (older schema version,
  inactive factor, unbuilt output) is stated as unavailable and why. It is never rendered as zero,
  as a dash without explanation, or as an invented value.
- **One renderer.** Every surface calls the same breakdown builder. A new parameter is added once.

## User Scenarios & Testing *(mandatory)*

### User Story 16.1 — Breakdown builder over the persisted explanation (Foundational, blocking)

A single pure builder turns an `EvaluationExplanation` into an ordered list of labelled sections
and parameter lines: identity, price and benchmark, cohort, mileage, score decomposition, factors,
flags by source, confidence, monetary output, verdict. Every existing renderer is refactored to
consume it. With every section enabled, the rendered text of `/why` is behaviourally equivalent to
today's for the parameters it already showed.

**Why this priority**: it is the anti-drift move. Building the button first and the shared renderer
second guarantees a fifth divergent formatter.

**Independent Test**: the builder is called with a V1, a V2, and a V3 explanation; each produces a
section list whose available parameters match exactly what that schema version carries, with the
rest marked unavailable and reasoned.

**Acceptance Scenarios**:

1. **Given** a persisted explanation of any schema version, **When** the builder runs, **Then**
   every parameter it emits is traceable to a field of that record — nothing is derived by
   re-computation and nothing is invented.
2. **Given** an explanation whose `factors` array is empty because factors are inactive, **Then**
   the factors section states that factors are inactive rather than showing an empty list or a
   neutral score.
3. **Given** the refactor, **When** the existing `/why` tests run, **Then** they pass with no
   change to the parameters previously rendered.

---

### User Story 16.2 — "Деталі" button under the alert (Priority: P1)

Every opportunity and price-drop alert carries an inline **Деталі** button. Tapping it replies with
the full breakdown for that listing, rendered from the persisted explanation, in the same chat.
The button is idempotent and works on old alerts.

**Why this priority**: this is the operator's actual request — the detail must be reachable from the
alert, without copying a link into a command.

**Independent Test**: an alert is delivered, the button is tapped, and the full breakdown arrives as
a follow-up message with zero source calls recorded in the budget ledger.

**Acceptance Scenarios**:

1. **Given** an alert, **When** the operator taps **Деталі**, **Then** the full breakdown is sent as
   a separate message and the original alert is unmodified.
2. **Given** an alert from before this feature shipped, **When** the button is absent, **Then**
   `/why` still returns the same breakdown (no regression, no orphaned callbacks).
3. **Given** a listing whose stored explanation was never written, **Then** the reply says the
   evaluation predates explanation persistence and offers `/check`, rather than re-fetching.
4. **Given** repeated taps, **Then** each reply is identical and no request is charged.

---

### User Story 16.3 — `/why` and `/check` adopt the shared breakdown (Priority: P2)

`/why` renders the full breakdown from the persisted explanation. `/check` renders the same section
layout from a freshly computed result, so the operator sees one consistent shape regardless of
entry point. `formatAssessment` and `formatStoredWhy` become thin adapters over the builder.

**Why this priority**: consistency and drift-prevention; the operator-visible gain is smaller than
16.2 but the maintenance gain is where this spec pays for itself.

**Independent Test**: the same listing viewed through the alert button, `/why`, and `/check`
produces the same section order and the same parameter labels, differing only in freshness and in
parameters that a live computation carries but a stored record does not.

**Acceptance Scenarios**:

1. **Given** one listing, **When** viewed through all three surfaces, **Then** section order and
   parameter labels are identical.
2. **Given** `/check` on a listing, **Then** it remains the only one of the three that may spend a
   source request, and it says so.

---

### User Story 16.4 — New parameters appear automatically as they ship (Priority: P2)

The builder is written against the explanation schema, so spec-003 factor lines, spec-006
`assessmentConfidence`, and the `Z` decomposition populate their sections the moment those records
start carrying them — with no change to any renderer or surface.

**Why this priority**: it is the sequencing insight. Today `score === priceCore` and `factors` is
empty, so the breakdown is thin; its value grows automatically as the ADR-0010 rollout and SPEC-006
land.

**Independent Test**: a fixture explanation carrying factors, `assessmentConfidence`, and `monetary`
renders all three sections with no renderer change relative to the fixture that lacks them.

**Acceptance Scenarios**:

1. **Given** an explanation carrying `assessmentConfidence`, **Then** its section renders with the
   percent and reason list, with no code change beyond the fixture.
2. **Given** an explanation carrying `monetary`, **Then** the `Z` decomposition renders under its
   own labelled section, subordinate to the score sections.

### Edge Cases

- Breakdown longer than the Telegram message limit → split at a section boundary, never mid-section,
  and number the parts.
- Explanation exists but `ParameterSet` version is no longer known → render the recorded version
  number and mark the parameter set as historical.
- A flag code with no Ukrainian label → render the raw code rather than dropping the flag.
- The listing was re-scored after the alert → the breakdown states which evaluation timestamp it is
  showing (the alert's, not the newest).
- A callback arrives for a listing that has since been deleted → a plain "listing no longer
  available" reply, no error surface.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A single pure builder MUST produce the breakdown from an `EvaluationExplanation`; all
  operator-facing surfaces MUST consume it.
- **FR-002**: The breakdown MUST NOT trigger a source fetch, re-score, cohort request, or budget
  charge on any surface except `/check`.
- **FR-003**: Opportunity and price-drop alerts MUST carry a **Деталі** inline button; the pushed
  alert body MUST remain within its current line budget.
- **FR-004**: An unavailable parameter MUST be stated as unavailable with the reason (schema
  version, inactive factor, missing source field) and MUST NOT be rendered as zero or as a bare
  dash.
- **FR-005**: This feature MUST NOT change `score`, `total100`, `isOpportunity`, any threshold, any
  `ParameterSet`, or the set of listings that alert.
- **FR-006**: The breakdown MUST render for V1, V2, and V3 explanation records, showing exactly the
  parameters each version carries.
- **FR-007**: Messages exceeding the platform limit MUST split at section boundaries with numbered
  parts.
- **FR-008**: The breakdown MUST state the evaluation timestamp and `ParameterSet` version it
  reflects.

### Key Entities

- **BreakdownSection** (value object): `{ key, title, lines[{ label, value, availability, reason? }]
  }` — pure, presentation-agnostic.
- **Breakdown** (value object): ordered `BreakdownSection[]` plus the evaluation timestamp and
  `ParameterSet` version.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The alert body line count is unchanged from pre-016 (plus one button row).
- **SC-002**: Tapping **Деталі** records zero source requests in the budget ledger.
- **SC-003**: All existing `/why`, alert-format, and integration tests pass unchanged.
- **SC-004**: The same listing renders an identical section order across the button, `/why`, and
  `/check`.
- **SC-005**: Every rendered parameter is traceable to one explanation field; zero recomputed or
  invented values.
- **SC-006**: Adding a fixture that carries factors, `assessmentConfidence`, and `monetary` renders
  all three sections with no renderer code change.

## Assumptions

- B23 explanation persistence is in place for newly evaluated listings; historical listings may
  lack it and are handled by US16.2 AS-3.
- Telegram inline-button callbacks are already proven by the outcome and deal buttons.
- The operator reads alerts on a phone, which is why compactness is a constraint rather than a
  preference.

## Out of scope (v1 of this spec)

- Any change to what is *computed* — this spec renders existing values only.
- Backfilling explanations for listings evaluated before B23.
- Localization beyond the existing Ukrainian labels.
- Exporting the breakdown (CSV, file, web view).
- The AI analysis section — that is `017-on-demand-ai-analysis`, rendered separately and labelled
  per [ADR-0019](../../knowledge-offers-analyzer/decisions/0019-advisory-only-ai-analysis.md) §8.

## Related

- [ADR-0018](../../knowledge-offers-analyzer/decisions/0018-assessment-confidence-and-monetary-output.md) ·
  [ADR-0019](../../knowledge-offers-analyzer/decisions/0019-advisory-only-ai-analysis.md) ·
  [ADR-0011](../../knowledge-offers-analyzer/decisions/0011-evidence-gated-scoring-rollout.md)
- Depends on: B23 (persisted explanation). Feeds: spec 003 factor lines, spec 006 confidence and `Z`
- Vault: `explainability-gaps`, `glossary`, `architecture/overview`
