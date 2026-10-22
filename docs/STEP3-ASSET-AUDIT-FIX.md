# Step 3 asset audit startup fix

The first `npm run assets:audit` failed with `ReferenceError: Cannot access 'modelRoot' before initialization`. The script used `modelRoot` in a temporal-dead-zone check before its `const` declaration.

The fix declares `modelRoot` immediately after `publicFiles`, before external GLB URI traversal and catalog discovery. The duplicate later declaration is removed. The asset audit remains report-only: it creates `artifacts/public-reference-audit/report.md` and `report.json` but never moves or deletes files.

A regression test runs the audit in an isolated temporary fixture that includes a model directory and an intentionally unreferenced sample asset. It verifies successful exit, both reports, and that the sample asset remains in place.

## Verify locally

Run from the repository root:

```powershell
npm test
npm run assets:audit
```

Review `artifacts/public-reference-audit/report.md`. All reported files remain review candidates until references are checked and movement is explicitly approved.
