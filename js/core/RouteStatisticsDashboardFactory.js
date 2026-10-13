import RouteStatisticsDashboard from "./RouteStatisticsDashboard.js";
import RouteStatisticsDashboardUI from "./RouteStatisticsDashboardUI.js";
import RouteStatisticsDashboardController from "./RouteStatisticsDashboardController.js";

export class RouteStatisticsDashboardFactory {
  static create({
    statisticsManager,
    insightsManager = null,
    comparisonManager = null,
    reportManager = null,
    storageManager = null,
    eventBus = null,
    logger = console,
    container = null,
    documentRef = globalThis.document,
    refreshInterval = 30000,
    autoRefresh = false,
    refreshOnEvents = [],
    onError = null,
    mountUI = false,
  } = {}) {
    if (!statisticsManager) {
      throw new TypeError(
        "RouteStatisticsDashboardFactory requires statisticsManager.",
      );
    }

    const dashboard = new RouteStatisticsDashboard({
      statisticsManager,
      insightsManager,
      comparisonManager,
      reportManager,
      storageManager,
      eventBus,
      logger,
    });

    let dashboardUI = null;

    if (container) {
      dashboardUI = new RouteStatisticsDashboardUI({
        dashboard,
        container,
        documentRef,
        refreshInterval: 0,
        onError,
      });
    }

    const controller = new RouteStatisticsDashboardController({
      dashboard,
      dashboardUI,
      statisticsManager,
      eventBus,
      logger,
      refreshOnEvents,
      autoRefresh,
      refreshInterval,
    });

    if (mountUI && dashboardUI) {
      controller.start({ mountUI: true });
    }

    return {
      dashboard,
      dashboardUI,
      controller,

      start(options = {}) {
        controller.start(options);
        return this;
      },

      refresh() {
        return controller.forceRefresh();
      },

      getSnapshot() {
        return controller.getSnapshot();
      },

      getState() {
        return controller.getState();
      },

      stop() {
        controller.stop();
        return this;
      },

      dispose() {
        controller.dispose();
      },
    };
  }
}

export function createRouteStatisticsDashboard(options = {}) {
  return RouteStatisticsDashboardFactory.create(options);
}

export default RouteStatisticsDashboardFactory;