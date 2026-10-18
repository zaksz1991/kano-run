/**
 * Kano Life — 3D Model Asset Audit
 *
 * Checks model files and reports loading failures.
 *
 * This utility does not replace the existing ModelManager
 * or change how the game renders its assets.
 */

export function createModelAssetAudit() {
  const records = new Map();

  function start(assetPath) {
    if (typeof assetPath !== "string" || !assetPath.trim()) {
      throw new TypeError(
        "A valid model asset path is required."
      );
    }

    const record = {
      path: assetPath,
      status: "loading",
      startedAt: performance.now(),
      finishedAt: null,
      durationMs: null,
      error: null,
    };

    records.set(assetPath, record);

    return record;
  }

  function succeed(assetPath, model) {
    const record = records.get(assetPath);

    if (!record) {
      throw new Error(
        `Asset audit was not started: ${assetPath}`
      );
    }

    const finishedAt = performance.now();

    record.status = model ? "loaded" : "empty";
    record.finishedAt = finishedAt;
    record.durationMs =
      finishedAt - record.startedAt;

    record.hasScene = Boolean(model?.scene);
    record.hasChildren =
      Array.isArray(model?.scene?.children) &&
      model.scene.children.length > 0;

    if (!model) {
      record.error = "The loader returned no model.";
    }

    return record;
  }

  function fail(assetPath, error) {
    const record = records.get(assetPath);

    if (!record) {
      throw new Error(
        `Asset audit was not started: ${assetPath}`
      );
    }

    record.status = "failed";
    record.finishedAt = performance.now();
    record.durationMs =
      record.finishedAt - record.startedAt;

    record.error =
      error instanceof Error
        ? error.message
        : String(error ?? "Unknown loading error");

    return record;
  }

  function getReport() {
    const assets = Array.from(records.values());

    return {
      total: assets.length,
      loaded: assets.filter(
        (asset) => asset.status === "loaded"
      ).length,
      failed: assets.filter(
        (asset) => asset.status === "failed"
      ).length,
      empty: assets.filter(
        (asset) => asset.status === "empty"
      ).length,
      loading: assets.filter(
        (asset) => asset.status === "loading"
      ).length,
      assets: assets.map((asset) => ({ ...asset })),
    };
  }

  function printReport() {
    const report = getReport();

    console.table(
      report.assets.map((asset) => ({
        path: asset.path,
        status: asset.status,
        durationMs: asset.durationMs,
        error: asset.error,
      }))
    );

    return report;
  }

  return {
    start,
    succeed,
    fail,
    getReport,
    printReport,
  };
}