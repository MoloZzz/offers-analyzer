# Quickstart: Monitoring Budget Stabilization

1. Run `npm test -- poll.spec.ts cohort.spec.ts`.
2. Verify a scored listing is not fetched as legacy recheck work.
3. Verify an unscored listing is only recovered in a 30-minute window.
4. Verify a refused tier-5 benchmark does not stop the next fresh listing from being recorded.
5. Run `/budget` in production after observation; its ledger should show reduced `recheck_detail` and `cohort_average` demand without any historical rewrite.
