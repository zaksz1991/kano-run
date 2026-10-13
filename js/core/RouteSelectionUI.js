import { EventBus } from "./EventBus.js";
import { Logger } from "./Logger.js";

const DEFAULT_SELECTORS = {
  container: "#route-selection",
  list: "#route-list",
  search: "#route-search",
  district: "#route-district",
  difficulty: "#route-difficulty",
  unlockedOnly: "#route-unlocked-only",
  selectedName: "#selected-route-name",
  selectedDescription: "#selected-route-description",
  selectedDifficulty: "#selected-route-difficulty",
  selectedDistrict: "#selected-route-district",
  selectedDistance: "#selected-route-distance",
  selectedReward: "#selected-route-reward",
  startButton: "#start-route-button",
  status: "#route-selection-status",
  count: "#route-count",
};

export class RouteSelectionUI {
  constructor({
    routeSelector,
    eventBus = EventBus,
    logger = Logger,
    documentRef = globalThis.document,
    selectors = {},
    onStartRoute = null,
  } = {}) {
    if (!routeSelector) {
      throw new Error("RouteSelectionUI requires a routeSelector.");
    }

    this.routeSelector = routeSelector;
    this.eventBus = eventBus;
    this.logger = logger;
    this.document = documentRef;
    this.selectors = { ...DEFAULT_SELECTORS, ...selectors };
    this.onStartRoute = onStartRoute;

    this.elements = {};
    this.listeners = [];
    this.disposed = false;
    this.initialized = false;

    this.handleSearch = this.handleSearch.bind(this);
    this.handleDistrictChange = this.handleDistrictChange.bind(this);
    this.handleDifficultyChange = this.handleDifficultyChange.bind(this);
    this.handleUnlockedChange = this.handleUnlockedChange.bind(this);
    this.handleListClick = this.handleListClick.bind(this);
    this.handleStartClick = this.handleStartClick.bind(this);
  }

  init() {
    this.assertActive();

    if (this.initialized) return this;

    if (!this.document) {
      this.logger?.warn?.(
        "RouteSelectionUI: document is unavailable; initialization skipped.",
      );
      return this;
    }

    this.resolveElements();
    this.bindEvents();
    this.populateFilters();
    this.render();

    this.initialized = true;
    return this;
  }

  resolveElements() {
    for (const [key, selector] of Object.entries(this.selectors)) {
      this.elements[key] = this.document.querySelector(selector);
    }

    if (!this.elements.container) {
      this.logger?.warn?.(
        `RouteSelectionUI: container "${this.selectors.container}" was not found.`,
      );
    }
  }

  bind(element, eventName, handler) {
    if (!element) return;

    element.addEventListener(eventName, handler);
    this.listeners.push({ element, eventName, handler });
  }

  bindEvents() {
    this.bind(this.elements.search, "input", this.handleSearch);
    this.bind(
      this.elements.district,
      "change",
      this.handleDistrictChange,
    );
    this.bind(
      this.elements.difficulty,
      "change",
      this.handleDifficultyChange,
    );
    this.bind(
      this.elements.unlockedOnly,
      "change",
      this.handleUnlockedChange,
    );
    this.bind(this.elements.list, "click", this.handleListClick);
    this.bind(this.elements.startButton, "click", this.handleStartClick);
  }

  populateFilters() {
    this.populateSelect(
      this.elements.district,
      this.routeSelector.getDistricts(),
      "All districts",
    );

    this.populateSelect(
      this.elements.difficulty,
      this.routeSelector.getDifficulties(),
      "All difficulties",
    );
  }

  populateSelect(select, values, allLabel) {
    if (!select) return;

    const previousValue = select.value;
    const fragment = this.document.createDocumentFragment();

    const allOption = this.document.createElement("option");
    allOption.value = "all";
    allOption.textContent = allLabel;
    fragment.appendChild(allOption);

    for (const value of values) {
      const option = this.document.createElement("option");
      option.value = value;
      option.textContent = this.formatLabel(value);
      fragment.appendChild(option);
    }

    select.replaceChildren(fragment);

    if (
      [...select.options].some((option) => option.value === previousValue)
    ) {
      select.value = previousValue;
    } else {
      select.value = "all";
    }
  }

  handleSearch(event) {
    this.routeSelector.setSearch(event.target.value);
    this.renderList();
    this.updateCount();
  }

  handleDistrictChange(event) {
    this.routeSelector.setDistrict(event.target.value);
    this.renderList();
    this.updateCount();
  }

  handleDifficultyChange(event) {
    this.routeSelector.setDifficulty(event.target.value);
    this.renderList();
    this.updateCount();
  }

  handleUnlockedChange(event) {
    this.routeSelector.setUnlockedOnly(event.target.checked);
    this.renderList();
    this.updateCount();
  }

  handleListClick(event) {
    const button = event.target.closest("[data-route-id]");

    if (!button || !this.elements.list?.contains(button)) return;

    const routeId = button.dataset.routeId;
    const result = this.routeSelector.selectRoute(routeId);

    if (!result.success) {
      this.setStatus(
        result.reason === "route_locked"
          ? "This route is locked. Complete more progress to unlock it."
          : "This route could not be selected.",
        "error",
      );
      return;
    }

    this.render();
    this.setStatus(`${result.route.name ?? result.route.id} selected.`);
  }

  async handleStartClick() {
    if (!this.routeSelector.getSelectedRouteId()) {
      this.setStatus("Select a route before starting.", "error");
      return;
    }

    const result = this.routeSelector.startSelectedRoute();

    if (!result.success) {
      this.setStatus(
        this.getStartErrorMessage(result.reason),
        "error",
      );
      return;
    }

    this.setStatus("Route starting…");

    try {
      if (typeof this.onStartRoute === "function") {
        await this.onStartRoute(result.route, result);
      }

      this.emit("route-selection-ui:start", result);
    } catch (error) {
      this.logger?.error?.("RouteSelectionUI: failed to start route.", error);
      this.setStatus("Unable to start this route. Try again.", "error");
    }
  }

  getStartErrorMessage(reason) {
    const messages = {
      no_route_selected: "Select a route before starting.",
      route_not_found: "The selected route could not be found.",
      route_locked: "This route is locked.",
      route_manager_cannot_start_route:
        "Route starting is not available.",
    };

    return messages[reason] ?? "Unable to start this route.";
  }

  render() {
    this.assertActive();

    if (!this.document || !this.initialized && !this.elements.list) {
      return;
    }

    this.renderList();
    this.renderSelectedRoute();
    this.updateCount();

    return this;
  }

  renderList() {
    const list = this.elements.list;

    if (!list) return;

    const routes = this.routeSelector.getFilteredRoutes();
    const fragment = this.document.createDocumentFragment();

    if (routes.length === 0) {
      const empty = this.document.createElement("p");
      empty.className = "route-list-empty";
      empty.textContent = "No routes match your filters.";
      fragment.appendChild(empty);
    }

    for (const route of routes) {
      fragment.appendChild(this.createRouteCard(route));
    }

    list.replaceChildren(fragment);
  }

  createRouteCard(route) {
    const card = this.document.createElement("button");

    card.type = "button";
    card.className = "route-card";
    card.dataset.routeId = route.id;
    card.setAttribute(
      "aria-pressed",
      String(route.id === this.routeSelector.getSelectedRouteId()),
    );

    if (route.id === this.routeSelector.getSelectedRouteId()) {
      card.classList.add("is-selected");
    }

    if (!route.unlocked) {
      card.classList.add("is-locked");
    }

    const name = this.document.createElement("span");
    name.className = "route-card-name";
    name.textContent = route.name ?? route.title ?? route.id;

    const district = this.document.createElement("span");
    district.className = "route-card-district";
    district.textContent = this.formatLabel(
      route.district ?? route.region ?? "Kano",
    );

    const difficulty = this.document.createElement("span");
    difficulty.className = "route-card-difficulty";
    difficulty.textContent = this.formatLabel(
      route.difficulty ?? "normal",
    );

    const distance = this.document.createElement("span");
    distance.className = "route-card-distance";
    distance.textContent = this.formatDistance(route.distance);

    const status = this.document.createElement("span");
    status.className = "route-card-status";
    status.textContent = route.unlocked ? "Available" : "Locked";

    card.append(name, district, difficulty, distance, status);

    if (route.description) {
      const description = this.document.createElement("span");
      description.className = "route-card-description";
      description.textContent = route.description;
      card.appendChild(description);
    }

    return card;
  }

  renderSelectedRoute() {
    const route = this.routeSelector.getSelectedRoute();

    this.setText(
      this.elements.selectedName,
      route?.name ?? route?.title ?? "No route selected",
    );

    this.setText(
      this.elements.selectedDescription,
      route?.description ?? "Choose a route to see its details.",
    );

    this.setText(
      this.elements.selectedDifficulty,
      route ? this.formatLabel(route.difficulty ?? "normal") : "—",
    );

    this.setText(
      this.elements.selectedDistrict,
      route
        ? this.formatLabel(route.district ?? route.region ?? "Kano")
        : "—",
    );

    this.setText(
      this.elements.selectedDistance,
      route ? this.formatDistance(route.distance) : "—",
    );

    this.setText(
      this.elements.selectedReward,
      route ? this.formatReward(route.reward ?? route.baseReward) : "—",
    );

    if (this.elements.startButton) {
      const canStart = Boolean(
        route && this.routeSelector.isRouteUnlocked(route),
      );

      this.elements.startButton.disabled = !canStart;
      this.elements.startButton.textContent = route
        ? canStart
          ? "Start Route"
          : "Route Locked"
        : "Select a Route";
    }
  }

  updateCount() {
    const countElement = this.elements.count;

    if (!countElement) return;

    const filtered = this.routeSelector.getFilteredRoutes().length;
    const total = this.routeSelector.getRoutes().length;

    countElement.textContent = `${filtered} of ${total} routes`;
  }

  setText(element, value) {
    if (element) {
      element.textContent = String(value ?? "");
    }
  }

  setStatus(message, type = "info") {
    const status = this.elements.status;

    if (!status) return;

    status.textContent = message;
    status.dataset.statusType = type;
    status.setAttribute("role", type === "error" ? "alert" : "status");
  }

  formatDistance(distance) {
    const value = Number(distance);

    if (!Number.isFinite(value) || value <= 0) {
      return "Distance varies";
    }

    return `${value.toLocaleString()} km`;
  }

  formatReward(reward) {
    const value = Number(reward);

    if (!Number.isFinite(value) || value < 0) {
      return "Earn fares";
    }

    return `₦${Math.round(value).toLocaleString()}`;
  }

  formatLabel(value) {
    return String(value ?? "")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  emit(eventName, payload) {
    if (typeof this.eventBus?.emit === "function") {
      this.eventBus.emit(eventName, payload);
    } else if (typeof this.eventBus?.publish === "function") {
      this.eventBus.publish(eventName, payload);
    }
  }

  refresh() {
    this.assertActive();

    this.routeSelector.refreshRoutes();
    this.populateFilters();
    this.render();

    return this;
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("RouteSelectionUI has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) return;

    for (const { element, eventName, handler } of this.listeners) {
      element.removeEventListener(eventName, handler);
    }

    this.listeners.length = 0;
    this.elements = {};
    this.initialized = false;
    this.disposed = true;
  }
}

export default RouteSelectionUI;