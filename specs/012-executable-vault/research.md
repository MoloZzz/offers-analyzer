# Research: Executable Hybrid Knowledge Vault

## Decision: keep the existing vault and port only the donor mechanism

**Rationale:** Offers Analyzer already has the valuable, domain-specific part of a second brain:
MOCs, ADRs, research, Spec Kit artifacts, and a deliberate decoupled context zone. The donor
adds deterministic retrieval and integrity mechanisms, not a replacement product model.

**Alternatives considered:** Copying `ai-infra/transaction-analytics/` would import unrelated
financial facts and duplicate the source of truth. Building vector RAG would add non-deterministic
retrieval and infrastructure without solving the current ownership and status drift.

## Decision: make the engine repository-configurable and metadata-compatible

**Rationale:** The donor assumes `backend/`, `00 — Index`, title-cased folders, and
`summary/code/rev` frontmatter. Offers uses `src/`, `00-INDEX`, lowercase folders, and
`title/type/updated`. The engine must accept project-configured note names and preserve all
existing frontmatter keys, with `summary`, `code`, and `rev` optional.

**Alternatives considered:** Renaming the whole vault would create a high-risk link migration
with no user value. Maintaining an Offers-only fork with hard-coded paths would recreate the
portability problem.

## Decision: retain the two-layer boundary

**Rationale:** Curated notes are the graph and ranked retrieval corpus. `context/` holds a compact
handoff, logs, and drafts, but is excluded from generated graph and search data. This preserves
ADR-0003 while stopping a growing backlog from becoming a shadow source of truth.

**Alternatives considered:** Indexing all context maximizes recall but dilutes ranking with
historical decisions and stale implementation reports. Deleting old context would destroy useful
history and is out of scope.

## Decision: progressive retrieval, not runtime-specific magic

**Rationale:** L1 generated orientation, L2 `find`, L3 bounded `show`, L4 full read for editing,
and a code map work in every Node-capable runtime. Codex can invoke the commands explicitly.
Claude hooks are an optional convenience only after a separate smoke test.

**Alternatives considered:** Copying the donor's Claude transcript governor as a universal rule
would promise behavior Codex Desktop does not provide. Keeping only prose instructions leaves the
retrieval protocol unenforced and difficult to audit.

## Decision: start validation in observation mode

**Rationale:** Existing notes contain legacy status and duplicated historical context. New checks
first report generated freshness, graph health, status ownership, and retrieval regressions. Only
high-signal rules with a documented zero-warning baseline may later become staged/CI blockers.

**Alternatives considered:** Turning on all donor errors immediately would create noisy bypasses.
Leaving validation at frontmatter/link syntax only would not prevent code-to-knowledge drift.

## Decision: derive Offers facts through a dedicated adapter

**Rationale:** The actual source of entity truth is `src/common/database/data-source.ts`; migrations
are under `src/common/database/migrations`; configuration uses `process.env`; and source adapters
implement `ListingSource`. The finance adapter cannot safely infer these facts.

**Alternatives considered:** Reusing the donor Nest adapter would report nonexistent `backend/`
facts. A generic adapter is retained as a safe fallback when a source fact cannot be proven.

## Decision: make product evidence explicit and advisory

**Rationale:** The existing scoring rollout is already evidence-gated. A registry can report
eligible disappearance events, closed deals, and budget pressure through a read-only database
connection, but must never mutate production state or autonomously prioritize work.

**Alternatives considered:** Running live database measurements in hooks would make commits depend
on machine state. Auto-enabling scoring from thresholds would violate the human approval gates in
ADR-0011.

## Reproducible migration baseline (2026-08-02)

- The retained `scripts/check-vault.js` requires `title`, `type`, and `updated` frontmatter and
  rejects malformed escaped-pipe wikilink aliases; unresolved future-note links remain warnings.
- Before generated artifacts existed, the new check reported only missing `_gen/` files. After the
  hierarchy/graph sweep and explicit build, `npm run vault:check:strict` is clean.
- The donor tool was treated as a mechanism, not a runnable dependency: its finance configuration
  assumed `backend/` and unrelated product paths. The Offers configuration points only to this
  repository, `knowledge-offers-analyzer/`, and a verified local adapter.
- This Windows PowerShell task used native Node/npm commands because the Linux/musl RTK wrapper is
  unavailable in this runtime. The fallback does not waive any quality gate.
