import { Logger } from "./Logger.js";

export class RouteChallengeUI {
  constructor({
    challengeManager,
    container = null,
    containerId = "route-challenges",
    documentRef = globalThis.document,
    onRewardClaimed = null,
  } = {}) {
    if (!challengeManager) {
      throw new Error("RouteChallengeUI requires a challengeManager.");
    }

    this.challengeManager = challengeManager;
    this.document = documentRef;
    this.container =
      container || this.document?.getElementById(containerId) || null;
    this.onRewardClaimed = onRewardClaimed;
    this.abortController = null;
    this.destroyed = false;

    if (this.container) {
      this.mount();
    } else {
      Logger.warn?.(
        `RouteChallengeUI: container "${containerId}" was not found.`
      );
    }
  }

  mount() {
    if (!this.container || this.destroyed) return;

    this.abortController?.abort();
    this.abortController = new AbortController();

    this.container.classList.add("kano-challenges");
    this.container.setAttribute("aria-label", "Route challenges");

    this.container.innerHTML = `
      <section class="challenge-panel">
        <header class="challenge-header">
          <div>
            <h2>Route Challenges</h2>
            <p>Complete objectives and earn rewards.</p>
          </div>
          <button type="button" data-action="refresh">
            Refresh
          </button>
        </header>

        <div class="challenge-summary" aria-live="polite"></div>

        <div class="challenge-list"></div>

        <p class="challenge-empty" hidden>
          No challenges are available right now.
        </p>

        <p class="challenge-feedback" role="status" aria-live="polite"></p>
      </section>
    `;

    this.container.addEventListener(
      "click",
      (event) => this.handleClick(event),
      { signal: this.abortController.signal }
    );

    this.render();
  }

  handleClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button || !this.container?.contains(button)) return;

    const action = button.dataset.action;

    if (action === "refresh") {
      this.render();
      return;
    }

    if (action === "claim") {
      this.claimReward(button.dataset.challengeId);
    }
  }

  claimReward(challengeId) {
    const result = this.challengeManager.claimReward(challengeId);
    const feedback = this.container?.querySelector(
      ".challenge-feedback"
    );

    if (!result.success) {
      const messages = {
        not_found: "Challenge not found.",
        not_completed: "Complete the challenge before claiming its reward.",
        already_claimed: "This reward has already been claimed.",
        economy_unavailable: "The reward could not be credited. Try again.",
        destroyed: "The challenge manager is unavailable.",
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

    try {
      this.onRewardClaimed?.(result);
    } catch (error) {
      Logger.error?.("Challenge reward callback failed.", error);
    }

    this.render();

    return result;
  }

  render() {
    if (!this.container || this.destroyed) return;

    const challenges = this.challengeManager.getChallenges();
    const summary = this.challengeManager.getSummary();

    this.renderSummary(summary);
    this.renderChallenges(challenges);

    const empty = this.container.querySelector(".challenge-empty");
    if (empty) empty.hidden = challenges.length > 0;
  }

  renderSummary(summary) {
    const element = this.container.querySelector(".challenge-summary");
    if (!element) return;

    element.replaceChildren();

    const items = [
      ["Challenges", summary.total],
      ["Completed", summary.completed],
      ["Claimable", summary.claimable],
      ["Available rewards", `₦${this.formatNumber(summary.availableRewards)}`],
    ];

    for (const [label, value] of items) {
      const card = this.document.createElement("div");
      card.className = "challenge-summary-card";

      const title = this.document.createElement("span");
      title.className = "challenge-summary-label";
      title.textContent = label;

      const amount = this.document.createElement("strong");
      amount.className = "challenge-summary-value";
      amount.textContent = String(value);

      card.append(title, amount);
      element.appendChild(card);
    }
  }

  renderChallenges(challenges) {
    const list = this.container.querySelector(".challenge-list");
    if (!list) return;

    list.replaceChildren();

    for (const challenge of challenges) {
      list.appendChild(this.createChallengeCard(challenge));
    }
  }

  createChallengeCard(challenge) {
    const card = this.document.createElement("article");
    card.className = "challenge-card";
    card.dataset.challengeId = challenge.id;

    if (challenge.completed) {
      card.classList.add("is-completed");
    }

    if (challenge.claimed) {
      card.classList.add("is-claimed");
    }

    const heading = this.document.createElement("div");
    heading.className = "challenge-card-heading";

    const title = this.document.createElement("h3");
    title.textContent = challenge.title;

    const difficulty = this.document.createElement("span");
    difficulty.className =
      `challenge-difficulty difficulty-${this.safeClass(challenge.difficulty)}`;
    difficulty.textContent = this.capitalize(challenge.difficulty);

    heading.append(title, difficulty);

    const description = this.document.createElement("p");
    description.className = "challenge-description";
    description.textContent = challenge.description;

    const progressLabel = this.document.createElement("div");
    progressLabel.className = "challenge-progress-label";

    const progressText = this.document.createElement("span");
    progressText.textContent = challenge.completed
      ? "Objective complete"
      : "Progress";

    const progressAmount = this.document.createElement("span");
    progressAmount.textContent =
      `${this.formatNumber(challenge.progress)} / ` +
      `${this.formatNumber(challenge.target)}`;

    progressLabel.append(progressText, progressAmount);

    const progress = this.document.createElement("progress");
    progress.className = "challenge-progress";
    progress.max = challenge.target;
    progress.value = Math.min(challenge.progress, challenge.target);
    progress.setAttribute(
      "aria-label",
      `${challenge.title} progress`
    );

    const footer = this.document.createElement("div");
    footer.className = "challenge-card-footer";

    const reward = this.document.createElement("span");
    reward.className = "challenge-reward";
    reward.textContent = `Reward: ₦${this.formatNumber(challenge.reward)}`;

    footer.appendChild(reward);

    if (challenge.claimed) {
      const status = this.document.createElement("span");
      status.className = "challenge-status";
      status.textContent = "Reward claimed";
      footer.appendChild(status);
    } else if (challenge.completed) {
      const claimButton = this.document.createElement("button");
      claimButton.type = "button";
      claimButton.dataset.action = "claim";
      claimButton.dataset.challengeId = challenge.id;
      claimButton.textContent = "Claim reward";
      footer.appendChild(claimButton);
    } else {
      const status = this.document.createElement("span");
      status.className = "challenge-status";
      status.textContent = "In progress";
      footer.appendChild(status);
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

  safeClass(value) {
    return String(value || "easy")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "");
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
      this.container.classList.remove("kano-challenges");
      this.container.removeAttribute("aria-label");
    }

    this.container = null;
    this.challengeManager = null;
    this.document = null;
    this.onRewardClaimed = null;
  }
}

export default RouteChallengeUI;