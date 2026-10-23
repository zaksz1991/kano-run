# Kano Life — Step 82 Source Audit

## Confirmed source-level risks addressed

### Household water capacity

The household-water domain model exports `MAX_HOUSEHOLD_WATER_LITRES` and includes it as `maxLitres` in `householdWaterReport`. The UI now trusts that report field rather than maintaining a separate identifier reference at render time. If a malformed report does not supply a positive finite limit, the UI safely falls back to 500 litres for the purchase-button capacity check.

The purchase transaction and its domain-model capacity validation are otherwise unchanged. This edit changes only how the interface decides whether to disable the water purchase button.

### Aure & Culture section observer

The UI module uses `SECTION_ID` in its startup observer. The complete replacement explicitly declares `SECTION_ID = 'kano-aure-culture'` and disconnects the observer once the section mounts. Existing relationships, health-tracking, meal, wellbeing, privacy, and wallet behavior is preserved.

## Cumulative coverage

The ZIP also retains Step 81's local error/rejection/resource audit, Long Tasks observer, feature-detected Long Animation Frames attribution, and observer mount guards in the other listed life modules.

## Verification boundary

The Node test suite, syntax checks, local import validation, and release-structure checks all passed. No claim is made here that Vite produced a deployable bundle or that the production site passed an interactive browser test; neither was available in this workspace.
