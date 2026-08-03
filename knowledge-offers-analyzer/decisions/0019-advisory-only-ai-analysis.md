---
title: ADR-0019 — On-demand AI analysis is advisory-only, admin-triggered, and never a scoring input
type: decision
status: Accepted
updated: 2026-08-03
summary: Admit a third-party LLM as a human-triggered second opinion behind a hard advisory-only boundary.
---

# ADR-0019 — On-demand AI analysis is advisory-only, admin-triggered, and never a scoring input

**Status:** Accepted (operator decision)
**Date:** 2026-08-03

## Context

The operator asked for a feature where, on seeing a promising alert, an admin can request an
analysis from an AI API: the system sends a prepared structured context and receives structured
output — warnings, a score, and reasoning.

This is the first time a **general-purpose language model** enters the system. Every existing
external dependency is a deterministic data source behind a port (AUTO.RIA, Telegram, Postgres).
The AUTO.RIA AI valuation provider added by SPEC-015 is *not* the same thing: it returns a price
estimate for the `active_listing_ask` target under a versioned valuation policy
([[0017-shadow-valuation-evidence|ADR-0017]]). It cannot read a description or produce warnings, so
it cannot serve this request.

Four properties of the project make the trust boundary the decisive question, not the integration:

- **No sold-price ground truth.** [[profitability-methods-coverage]] §5 rejects ML *for scoring*
  because the system cannot train or validate against realized transaction prices. That verdict is
  about the scorer. It does not speak to a model consulted by a human who has already decided to
  look at one specific car.
- **Explainability is a product feature.** [[explainability-gaps]] and B23 require a historical
  alert to be explainable without a source re-fetch. A language model's answer is not reproducible
  by re-running it.
- **The description is attacker-controlled.** The seller writes it. Any pipeline that feeds seller
  text to a model whose output influences system behaviour is a prompt-injection surface. Today
  description text only reaches a deterministic, negation-aware keyword scanner (`condition.ts`),
  which cannot be instructed.
- **Budget discipline.** [[0009-monthly-rate-limit-pool|ADR-0009]] governs a 20,000-request AUTO.RIA
  pool. An LLM spends a *different* currency, so it needs its own ceiling rather than a share of
  that pool.

## Decision

1. **Advisory-only, permanently.** AI analysis output MUST NOT influence `score`, `priceCore`,
   `total100`, any factor modifier, `assessmentConfidence`, `isOpportunity`, the alert set, any
   threshold, any `ParameterSet`, or the survivorship correction `k` — in either direction. It can
   neither promote nor veto. Reversing this needs a new ADR, and this ADR records that the
   asymmetric "may veto only" variant was considered and rejected: a veto still lets seller-authored
   text decide what the operator sees.

2. **Human-triggered and admin-only.** Analysis runs only on an explicit admin action —
   `/analyze_ai <listing>` in the Telegram bot, with an inline button under an alert as a shortcut
   to the same path. There is no automatic, per-listing, or scheduled invocation. This is the
   feature's primary cost control: spend is bounded by human taps, not by listing volume, so it
   cannot runaway-spend the way a per-listing enrichment would.

3. **Cached on a content hash.** A result is cached and reused for the same
   `(listingId, inputFactHash, promptVersion, modelId)`. A price change, description edit, or
   changed source fact changes the hash and permits a fresh call; a repeated tap on unchanged input
   is free. Cache hits MUST be labelled with the original capture time so the operator never reads a
   stale answer as current.

4. **The description is untrusted data, not instruction.** It is passed inside an explicitly
   delimited block, identified to the model as quoted third-party text, and never concatenated into
   the instruction section. The response MUST be validated against a strict schema; free-form or
   schema-violating output is discarded rather than repaired or displayed. Because of §1, a
   successful injection can at most produce a misleading advisory paragraph — it cannot alter an
   alert, a score, or any stored scoring state.

5. **Immutable, redacted evidence — the SPEC-015 pattern, reused.** Every attempt persists model
   id, prompt version, sampling parameters, the input fact snapshot, the validated structured
   output, terminal status, and capture time. Rendering reads that record, never the live model, so
   a past analysis stays explainable without a re-call. Provider terms and retention are an operator
   gate, exactly as the AUTO.RIA provider credential is.

6. **A separate budget with its own ceiling.** AI analysis MUST NOT draw on the AUTO.RIA monthly
   pool. It gets its own monthly cap, a per-admin rate limit, and its own entries in the
   `BudgetActivity` ledger so `/budget` reports it alongside source spend. A zero cap disables the
   feature, and the feature is disabled by default.

7. **Model claims are labelled, never promoted.** Reliability claims a model makes about an engine
   or gearbox are rendered as model-generated and unverified. They MUST NOT be written into the
   curated repair-risk tables by any automatic path; promoting one is a deliberate human edit with
   the usual config audit trail.

8. **The AI numeric score is subordinate to the deterministic score.** It is rendered in its own
   labelled section, never adjacent to or formatted like the Total Deal Score, and always carries
   the model-opinion label. Recorded reservation: this number is the least defensible output in the
   system — no ground truth, not reproducible, and visually authoritative. The structured
   warnings, the inspection checklist, and the questions-to-ask-the-seller are where this feature's
   value actually is. §8 exists so the weakest output cannot anchor the operator against a
   better-evidenced one.

## Consequences

**Positive.** The operator gets a genuinely useful second opinion at the moment of decision — the
step a good перекуп already performs by asking a knowledgeable friend about one specific car — with
per-model failure knowledge and inspection questions the deterministic scorer will never carry.
Because it is on-demand, advisory, and cached, its cost is bounded and its blast radius on failure
is a single message. An outage, a bad key, an exhausted cap, or a schema-invalid response leaves
discovery, scoring, and alerts untouched.

**Negative / to maintain.** A new external system class enters the stack, which requires a
constitution amendment (Technology & External Constraints) and a `ValuationProvider`-style port with
contract tests. Prompt and schema versions become maintained artifacts, and a prompt change is a
behaviour change that must be versioned like a `ParameterSet`. The system now stores third-party
model output, so retention and provider terms need an explicit operator decision. There is a
standing risk that the advisory score acquires de-facto authority through habit; §8 mitigates the
presentation, but only §1 makes it structurally harmless.

**Explicitly not decided here.** Which vendor or model is used, its pricing, and whether listing
content may lawfully be sent to it. Those are operator/deployment gates, matching how ADR-0017
treats the AUTO.RIA provider credential.

## Related

- [[decisions/README]] · [[0017-shadow-valuation-evidence|ADR-0017]] (the evidence pattern reused
  here) · [[0011-evidence-gated-scoring-rollout|ADR-0011]] ·
  [[0018-assessment-confidence-and-monetary-output|ADR-0018]] (same output-never-input rule) ·
  [[0009-monthly-rate-limit-pool|ADR-0009]] · [[0002-monitoring-via-official-api|ADR-0002]]
- [[profitability-methods-coverage]] §5 · [[explainability-gaps]] · [[glossary]]
- Specs: `017-on-demand-ai-analysis`, `016-full-evaluation-breakdown`
- Constitution amendment: v1.2.0 → v1.3.0
