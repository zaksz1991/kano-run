from pathlib import Path
root = Path(__file__).resolve().parents[1]
storage = (root / 'js' / 'storage.js').read_text()
interaction = (root / 'js' / 'KanoInteractionReliability.js').read_text()
checks = {
    'existing save key retained': "kano-life-save-v4" in storage,
    'checkpoint field normalized': 'activeRunCheckpoint' in storage and 'activeRunCheckpoint,' in storage,
    'periodic run checkpoint': 'checkpointElapsed >= 4' in interaction and 'checkpointActiveRun' in interaction,
    'resume button': 'kano-resume-run-button' in interaction and 'RESUME SAVED RUN' in interaction,
    'live high score': 'save.highScore = Math.max' in interaction,
    'live achievements': 'checkLiveAchievements()' in interaction and 'unlockAchievement(achievement.id)' in interaction,
    'per-tribe challenge panel retained': 'HAUSA · YORUBA · IGBO CHALLENGES' in interaction,
    'GLB fallback retained': 'installCharacterFallbacks' in interaction,
    'crowd scene integration retained': 'installSceneUpgradeAnimationFix' in interaction,
    'wallet transaction logic retained': 'banking.transactions' in storage and 'banking-failed' in storage,
}
for name, ok in checks.items():
    print(('PASS' if ok else 'FAIL') + ' ' + name)
if not all(checks.values()):
    raise SystemExit(1)
