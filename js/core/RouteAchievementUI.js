import { Logger } from "./Logger.js";

export class RouteAchievementUI {
  constructor({
    achievementManager,
    container = null,
    containerId = "route-achievements",
    documentRef = globalThis.document,
  } = {}) {
    if (!achievementManager) {
      throw new Error("RouteAchievementUI requires an achievementManager.");
    }

    this.achievementManager = achievementManager;
    this.document = documentRef;
    this.container =
      container || this.document?.getElementById(containerId) || null;
    this.abortController = null;
    this.destroyed = false;
    this.category = "all";
    this.filter = "all";

    if (this.container) {
      this.mount();
    } else {
      Logger.warn?.(
        `RouteAchievementUI: container "${containerId}" was not found.`
      );
    }
  }

  mount() {
    if (!this.container || this.destroyed) return;

    this.abortController?.abort();
    this.abortController = new AbortController();

    this.container.classList.add("kano-achievements");
    this.container.setAttribute("aria-label", "Driving achievements");

    this.container.innerHTML = `
      <section class="achievement-panel">
        <header class="achievement-header">
          <div>
            <h2>Achievements</h2>
            <p>Track your progress across Kano.</p>
          </div>
          <button type="button" data-action="refresh">Refresh</button>
        </header>

        <div class="achievement-summary" aria-live="polite"></div>

        <div class="achievement-filters">
          <label>
            Category
            <select data-filter="category">
              <option value="all">All categories</option>
              <option value="driving">Driving</option>
              <option value="exploration">Exploration</option>
              <option value="service">Passenger service</option>
              <option value="economy">Economy</option>
              <option value="skill">Driving skills</option>
            </select>
          </label>

          <label>
            Status
            <select data-filter="status">
              <option value="all">All achievements</option>
              <option value="unlocked">Unlocked</option>
              <option value="locked">Locked</option>
              <option value="claimable">Rewards to claim</option>
              <option value="claimed">Rewards claimed</option>
            </select>
          </label>
        </div>

        <div class="achievement-list"></div>

        <p class="achievement-empty" hidden>
          No achievements match these filters.
        </p>

        <p class="achievement-feedback" role="status" aria-live="polite"></p>
      </section>
    `;

    this.container.addEventListener(
      "click",
      (event) => this.handleClick(event),
      { signal: this.abortController.signal }
    );

    this.container.addEventListener(
      "change",
      (event) => this.handleChange(event),
      { signal: this.abortController.signal }
    );

    this.render();
  }

  handleClick(event) {
    const button = event.target.closest("button[data-action]");

    if (!button || !this.container?.contains(button)) return;

    if (button.dataset.action === "refresh") {
      this.render();
      return;
    }

    if (button.dataset.action === "claim") {
      this.claimReward(button.dataset.achievementId);
    }
  }

  handleChange(event) {
    const select = event.target.closest("select[data-filter]");

    if (!select || !this.container?.contains(select)) return;

    if (select.dataset.filter === "category") {
      this.category = select.value;
    } else if (select.dataset.filter === "status") {
      this.filter = select.value;
    }

    this.renderAchievements();
  }

  claimReward(id) {
    const result = this.achievementManager.claimReward(id);
    const feedback = this.container?.querySelector(
      ".achievement-feedback"
    );

    if (!result.success) {
      const messages = {
        not_found: "Achievement not found.",
        not_unlocked: "Unlock this achievement before claiming its reward.",
        already_claimed: "This reward has already been claimed.",
        economy_unavailable: "The reward could not be credited. Try again.",
        destroyed: "The achievement manager is unavailable.",
      };

      if (feedback) {
        feedback.textContent =
          messages[result.reason] || "Unable to claim reward.";
      }

      this.render();
      return result;
    }

    if (feedback) {
      feedback.textContent =
        `Reward claimed: ₦${this.formatNumber(result.reward)}.`;
    }

    this.render();
    return result;
  }

  render() {
    if (!this.container || this.destroyed) return;

    this.renderSummary();
    this.renderAchievements();
  }

  renderSummary() {
    const summaryElement = this.container.querySelector(
      ".achievement-summary"
    );

    if (!summaryElement) return;

    const summary = this.achievementManager.getSummary();
    const cards = [
      ["Total", summary.total],
      ["Unlocked", summary.unlocked],
      ["Locked", summary.locked],
      ["Rewards available", `₦${this.formatNumber(summary.totalRewardsClaimable)}`],
    ];

    summaryElement.replaceChildren();

    for (const [label, value] of cards) {
      const card = this.document.createElement("div");
      card.className = "achievement-summary-card";

      const labelElement = this.document.createElement("span");
      labelElement.className = "achievement-summary-label";
      labelElement.textContent = label;

      const valueElement = this.document.createElement("strong");
      valueElement.className = "achievement-summary-value";
      valueElement.textContent = String(value);

      card.append(labelElement, valueElement);
      summaryElement.appendChild(card);
    }
  }

  getFilteredAchievements() {
    return this.achievementManager.getAchievements({
      category: this.category === "all" ? null : this.category,
    }).filter((achievement) => {
      switch (this.filter) {
        case "unlocked":
          return achievement.unlocked;

        case "locked":
          return !achievement.unlocked;

        case "claimable":
          return achievement.unlocked && !achievement.rewardClaimed;

        case "claimed":
          return achievement.rewardClaimed;

        default:
          return true;
      }
    });
  }

  renderAchievements() {
    const list = this.container.querySelector(".achievement-list");
    const empty = this.container.querySelector(".achievement-empty");

    if (!list) return;

    const achievements = this.getFilteredAchievements();

    list.replaceChildren();

    for (const achievement of achievements) {
      list.appendChild(this.createAchievementCard(achievement));
    }

    if (empty) {
      empty.hidden = achievements.length > 0;
    }
  }

  createAchievementCard(achievement) {
    const card = this.document.createElement("article");
    card.className = "achievement-card";
    card.dataset.achievementId = achievement.id;

    card.classList.toggle("is-unlocked", achievement.unlocked);
    card.classList.toggle("is-claimed", achievement.rewardClaimed);

    const heading = this.document.createElement("div");
    heading.className = "achievement-card-heading";

    const titleGroup = this.document.createElement("div");

    const title = this.document.createElement("h3");
    title.textContent = achievement.title;

    const category = this.document.createElement("span");
    category.className = "achievement-category";
    category.textContent = this.capitalize(achievement.category);

    titleGroup.append(title, category);

    const status = this.document.createElement("span");
    status.className = "achievement-status";
    status.textContent = achievement.rewardClaimed
      ? "Claimed"
      : achievement.unlocked
        ? "Unlocked"
        : "Locked";

    heading.append(titleGroup, status);

    const description = this.document.createElement("p");
    description.className = "achievement-description";
    description.textContent = achievement.description;

    const progressLabel = this.document.createElement("div");
    progressLabel.className = "achievement-progress-label";

    const progressText = this.document.createElement("span");
    progressText.textContent = "Progress";

    const progressValue = this.document.createElement("span");
    progressValue.textContent =
      `${this.formatNumber(achievement.progress)} / ` +
      `${this.formatNumber(achievement.target)}`;

    progressLabel.append(progressText, progressValue);

    const progress = this.document.createElement("progress");
    progress.className = "achievement-progress";
    progress.max = achievement.target;
    progress.value = Math.min(
      achievement.progress,
      achievement.target
    );
    progress.setAttribute(
      "aria-label",
      `${achievement.title} progress`
    );

    const footer = this.document.createElement("div");
    footer.className = "achievement-card-footer";

    const reward = this.document.createElement("span");
    reward.className = "achievement-reward";
    reward.textContent = `Reward: ₦${this.formatNumber(achievement.reward)}`;

    footer.appendChild(reward);

    if (achievement.rewardClaimed) {
      const claimed = this.document.createElement("span");
      claimed.className = "achievement-claimed";
      claimed.textContent = "Reward claimed";
      footer.appendChild(claimed);
    } else if (achievement.unlocked) {
      const button = this.document.createElement("button");
      button.type = "button";
      button.dataset.action = "claim";
      button.dataset.achievementId = achievement.id;
      button.textContent = "Claim reward";
      footer.appendChild(button);
    }

    card.append(
      heading,
      description,
      progressLabel,
      progress,
      footer
    );

    return card;
  }

  capitalize(value) {
    const text = String(value || "");
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
  }

  formatNumber(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) return "0";

    return new Intl.NumberFormat("en-NG", {
      maximumFractionDigits: 1,
    }).format(number);
  }

  destroy() {
    if (this.destroyed) return;

    this.destroyed = true;
    this.abortController?.abort();
    this.abortController = null;

    if (this.container) {
      this.container.replaceChildren();
      this.container.classList.remove("kano-achievements");
      this.container.removeAttribute("aria-label");
    }

    this.container = null;
    this.achievementManager = null;
    this.document = null;
  }
}

export default RouteAchievementUI;