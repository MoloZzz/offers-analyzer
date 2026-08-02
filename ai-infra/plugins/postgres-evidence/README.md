# PostgreSQL evidence plugin contract

Status: documentation only. This kit does not ship an executable PostgreSQL client, a database
URL, metric queries, credentials, or an automatic evidence command.

Use this extension only when a repository has an approved need for advisory measurements and an
owner for the database, metrics, and review process. It is not needed for the core second-brain,
product-vision, or context-control workflow.

## Required activation decision

Before implementation, record a project decision that names:

- the operator question each metric serves;
- the canonical roadmap or requirement the observation informs;
- the database role and access boundary;
- the reviewer responsible for interpreting the result;
- the local cache location and version-control exclusion;
- the explicit command that runs the measurement.

The decision must say that an observation requests human review only. It must not authorize
feature activation, parameter changes, budget changes, profile enablement, deployment, or other
production changes.

## Required runtime safety

A future implementation must satisfy all of the following:

1. Run only after a human explicitly invokes the evidence command. Never run it from bootstrap,
   build, check, test, CI, hooks, task start, or agent initialization.
2. Read the connection string from the target project's approved secret mechanism. Never copy,
   print, log, commit, or derive credentials in the kit.
3. Require a database role with read-only privileges and also open a PostgreSQL READ ONLY
   transaction. Client validation supplements but never replaces database permissions.
4. Accept only one reviewed SELECT statement per metric. Reject transaction control, write
   statements, data-definition statements, multiple statements, and unbounded interpolation.
5. Use bounded statement, lock, and idle-transaction timeouts. Return safe, redacted errors.
6. Require a deterministic result shape: one row containing a numeric value and an integer sample
   size. Treat missing or malformed data as unavailable evidence.
7. Store only a minimal local observation cache outside version control. The cache must include
   measurement time, metric identity, result, sample size, and registry digest; never raw
   personally sensitive rows or credentials.

## Registry and review contract

Each project-specific metric registry should contain, at minimum:

| Field                  | Meaning                                                 |
| ---------------------- | ------------------------------------------------------- |
| key                    | Stable metric identifier                                |
| owner                  | Canonical roadmap, requirement, or decision it informs  |
| trigger                | Human-review threshold or a no-trigger marker           |
| question               | Operator question answered by the metric                |
| query review reference | Link or identifier for the reviewed query, not a secret |

Registry changes require the same review as a production-read access change. A metric result is
evidence, not truth: assess data quality, cohort definition, freshness, and sample size before
changing a roadmap or decision.

## Verification before rollout

Test a future implementation with a disposable database or mocked client. Prove dry validation
makes no connection, rejected statements execute nothing, the transaction is read-only, errors
redact secrets, and no command can write project configuration or production state.
