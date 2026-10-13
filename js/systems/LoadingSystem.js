export default class LoadingSystem {
  constructor({
    title = "KANO RUN",
    subtitle = "Adaidaita Sahu",
    onProgress = null,
    onComplete = null,
  } = {}) {
    this.title = title;
    this.subtitle = subtitle;
    this.onProgress = onProgress;
    this.onComplete = onComplete;

    this.root = null;
    this.progressBar = null;
    this.progressLabel = null;
    this.statusLabel = null;
    this.visible = false;
    this.completed = false;
    this.destroyed = false;
    this.progress = 0;

    this.createUI();
  }

  createUI() {
    if (typeof document === "undefined") return;

    this.root = document.createElement("div");
    this.root.id = "kano-run-loading";

    Object.assign(this.root.style, {
      position: "fixed",
      inset: "0",
      zIndex: "20000",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      boxSizing: "border-box",
      background:
        "radial-gradient(ellipse at center, #173451 0%, #091626 55%, #040a12 100%)",
      color: "#ffffff",
      fontFamily: "Arial, Helvetica, sans-serif",
      opacity: "1",
      transition: "opacity 250ms ease",
    });

    const panel = document.createElement("div");

    Object.assign(panel.style, {
      width: "min(100%, 440px)",
      textAlign: "center",
    });

    const logo = document.createElement("div");
    logo.textContent = "RN";

    Object.assign(logo.style, {
      width: "90px",
      height: "90px",
      display: "grid",
      placeItems: "center",
      margin: "0 auto 28px",
      borderRadius: "24px",
      border: "2px solid #00b4d8",
      background: "linear-gradient(145deg, #16364d, #091725)",
      boxShadow: "0 0 45px rgba(0, 180, 216, 0.18)",
      color: "#00b4d8",
      fontSize: "38px",
      fontWeight: "900",
      letterSpacing: "-3px",
    });

    const heading = document.createElement("h1");
    heading.textContent = this.title;

    Object.assign(heading.style, {
      margin: "0",
      fontSize: "clamp(30px, 8vw, 46px)",
      fontWeight: "900",
      letterSpacing: "3px",
      lineHeight: "1.1",
    });

    const subtitle = document.createElement("p");
    subtitle.textContent = this.subtitle;

    Object.assign(subtitle.style, {
      margin: "12px 0 34px",
      color: "#00b4d8",
      fontSize: "14px",
      fontWeight: "700",
      letterSpacing: "2px",
    });

    const track = document.createElement("div");

    Object.assign(track.style, {
      width: "100%",
      height: "7px",
      overflow: "hidden",
      borderRadius: "10px",
      background: "rgba(255, 255, 255, 0.12)",
    });

    this.progressBar = document.createElement("div");

    Object.assign(this.progressBar.style, {
      width: "0%",
      height: "100%",
      borderRadius: "10px",
      background: "linear-gradient(90deg, #00b4d8, #fbbf24)",
      transition: "width 160ms ease",
    });

    track.appendChild(this.progressBar);

    const information = document.createElement("div");

    Object.assign(information.style, {
      display: "flex",
      justifyContent: "space-between",
      gap: "12px",
      marginTop: "12px",
      fontSize: "12px",
      color: "#b6c7d9",
    });

    this.statusLabel = document.createElement("span");
    this.statusLabel.textContent = "Preparing Kano";

    this.progressLabel = document.createElement("span");
    this.progressLabel.textContent = "0%";

    information.append(this.statusLabel, this.progressLabel);

    const footer = document.createElement("p");
    footer.textContent = "RUFFNECK ENTERTAINMENT";

    Object.assign(footer.style, {
      margin: "38px 0 0",
      color: "#71849a",
      fontSize: "10px",
      fontWeight: "700",
      letterSpacing: "3px",
    });

    panel.append(
      logo,
      heading,
      subtitle,
      track,
      information,
      footer
    );

    this.root.appendChild(panel);
    document.body.appendChild(this.root);

    this.visible = true;
  }

  setProgress(value, status) {
    if (this.destroyed || this.completed) return;

    const nextProgress = Number(value);

    if (!Number.isFinite(nextProgress)) return;

    this.progress = Math.max(
      this.progress,
      Math.min(100, Math.max(0, nextProgress))
    );

    if (this.progressBar) {
      this.progressBar.style.width = `${this.progress}%`;
    }

    if (this.progressLabel) {
      this.progressLabel.textContent =
        `${Math.round(this.progress)}%`;
    }

    if (this.statusLabel && typeof status === "string") {
      this.statusLabel.textContent = status;
    }

    this.onProgress?.({
      progress: this.progress,
      status: status || "",
    });

    return this.progress;
  }

  setStatus(status) {
    if (this.statusLabel && typeof status === "string") {
      this.statusLabel.textContent = status;
    }
  }

  async trackTask(label, task, weight = 1) {
    if (typeof task !== "function") {
      throw new TypeError("Loading task must be a function.");
    }

    this.setStatus(label);

    const result = await task();

    return {
      result,
      weight: Math.max(0, Number(weight) || 1),
    };
  }

  async loadTasks(tasks = []) {
    if (!Array.isArray(tasks)) {
      throw new TypeError("Loading tasks must be an array.");
    }

    if (tasks.length === 0) {
      this.setProgress(100, "Ready to drive");
      return this.complete();
    }

    const totalWeight = tasks.reduce((total, task) => {
      return total + Math.max(0, Number(task.weight) || 1);
    }, 0);

    let completedWeight = 0;
    const results = [];

    for (const task of tasks) {
      if (this.destroyed) {
        throw new Error("Loading system was destroyed.");
      }

      const weight = Math.max(0, Number(task.weight) || 1);
      const label = task.label || "Loading game";

      this.setStatus(label);

      try {
        const result = await task.run();

        results.push(result);
        completedWeight += weight;

        const progress = totalWeight > 0
          ? (completedWeight / totalWeight) * 100
          : 100;

        this.setProgress(progress, label);
      } catch (error) {
        this.setStatus(`Failed: ${label}`);
        throw error;
      }
    }

    this.setProgress(100, "Ready to drive");

    await this.complete();

    return results;
  }

  async complete() {
    if (this.destroyed || this.completed) return;

    this.completed = true;
    this.setProgress(100, "Ready to drive");

    this.onComplete?.();

    await new Promise((resolve) => {
      requestAnimationFrame(() => resolve());
    });

    if (this.root) {
      this.root.style.opacity = "0";

      await new Promise((resolve) => {
        setTimeout(resolve, 260);
      });
    }

    this.hide();
  }

  hide() {
    if (!this.root) return;

    this.root.style.display = "none";
    this.visible = false;
  }

  show() {
    if (!this.root || this.destroyed) return;

    this.root.style.display = "flex";
    this.root.style.opacity = "1";
    this.visible = true;
  }

  reset() {
    this.completed = false;
    this.progress = 0;

    if (this.progressBar) {
      this.progressBar.style.width = "0%";
    }

    if (this.progressLabel) {
      this.progressLabel.textContent = "0%";
    }

    this.setStatus("Preparing Kano");
  }

  destroy() {
    if (this.destroyed) return;

    this.root?.remove();

    this.root = null;
    this.progressBar = null;
    this.progressLabel = null;
    this.statusLabel = null;

    this.visible = false;
    this.destroyed = true;
  }
}