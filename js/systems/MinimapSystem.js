import * as THREE from "../../vendor/three.module.js";

export default class MinimapSystem {
  constructor(scene, options = {}) {
    if (!scene) {
      throw new Error("MinimapSystem requires a THREE.Scene.");
    }

    this.scene = scene;

    this.options = {
      width: 180,
      height: 180,
      worldWidth: 70,
      worldDepth: 130,
      updateInterval: 0.08,
      backgroundColor: "#101a27",
      roadColor: "#626b75",
      laneColor: "#c8cdd2",
      playerColor: "#00d4ff",
      trafficColor: "#ff5b52",
      passengerColor: "#ffd166",
      routeColor: "#5ce1a0",
      borderColor: "#00b4d8",
      ...options,
    };

    this.canvas = null;
    this.context = null;
    this.container = null;

    this.player = null;
    this.traffic = [];
    this.passengers = [];
    this.routePoints = [];

    this.elapsed = 0;
    this.visible = true;
    this.disposed = false;

    this.createCanvas();
  }

  createCanvas() {
    if (typeof document === "undefined") {
      return;
    }

    this.container = document.createElement("div");
    this.container.className = "kano-minimap";

    Object.assign(this.container.style, {
      position: "absolute",
      top: "16px",
      right: "16px",
      width: `${this.options.width}px`,
      height: `${this.options.height}px`,
      zIndex: "20",
      border: `2px solid ${this.options.borderColor}`,
      borderRadius: "12px",
      overflow: "hidden",
      background: this.options.backgroundColor,
      boxShadow: "0 4px 18px rgba(0,0,0,0.4)",
      pointerEvents: "none",
    });

    this.canvas = document.createElement("canvas");
    this.canvas.width = this.options.width * 2;
    this.canvas.height = this.options.height * 2;

    Object.assign(this.canvas.style, {
      display: "block",
      width: "100%",
      height: "100%",
    });

    this.container.appendChild(this.canvas);

    this.context = this.canvas.getContext("2d");

    const parent =
      document.getElementById("game-ui") ||
      document.getElementById("ui") ||
      document.body;

    parent.appendChild(this.container);
  }

  setPlayer(player) {
    this.player = player;
  }

  setTraffic(traffic) {
    this.traffic = Array.isArray(traffic) ? traffic : [];
  }

  setPassengers(passengers) {
    this.passengers = Array.isArray(passengers)
      ? passengers
      : [];
  }

  setRoutePoints(points) {
    this.routePoints = Array.isArray(points) ? points : [];
  }

  setVisible(visible) {
    this.visible = Boolean(visible);

    if (this.container) {
      this.container.style.display = this.visible
        ? "block"
        : "none";
    }
  }

  getPosition(object) {
    if (!object) {
      return null;
    }

    if (object.position) {
      return object.position;
    }

    if (typeof object.getPosition === "function") {
      return object.getPosition();
    }

    return null;
  }

  worldToMap(position, centerX, centerZ, scale) {
    return {
      x:
        this.options.width / 2 +
        (position.x - centerX) * scale,
      y:
        this.options.height / 2 +
        (position.z - centerZ) * scale,
    };
  }

  update(deltaTime = 0) {
    if (
      this.disposed ||
      !this.visible ||
      !this.context ||
      !this.player
    ) {
      return;
    }

    this.elapsed += Math.max(0, deltaTime);

    if (this.elapsed < this.options.updateInterval) {
      return;
    }

    this.elapsed = 0;
    this.draw();
  }

  draw() {
    const ctx = this.context;
    const width = this.options.width;
    const height = this.options.height;

    const playerPosition = this.getPosition(this.player);

    if (!playerPosition) {
      return;
    }

    const scale = Math.min(
      width / this.options.worldWidth,
      height / this.options.worldDepth
    );

    const centerX = playerPosition.x;
    const centerZ = playerPosition.z;

    ctx.save();

    ctx.scale(2, 2);

    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = this.options.backgroundColor;
    ctx.fillRect(0, 0, width, height);

    this.drawRoad(ctx, width, height);
    this.drawRoute(ctx, centerX, centerZ, scale);
    this.drawPassengers(ctx, centerX, centerZ, scale);
    this.drawTraffic(ctx, centerX, centerZ, scale);
    this.drawPlayer(ctx, playerPosition);

    this.drawCompass(ctx, width);

    ctx.restore();
  }

  drawRoad(ctx, width, height) {
    const roadWidth = width * 0.48;
    const roadX = (width - roadWidth) / 2;

    ctx.fillStyle = this.options.roadColor;
    ctx.fillRect(roadX, 0, roadWidth, height);

    ctx.strokeStyle = this.options.laneColor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 8]);

    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.stroke();

    ctx.setLineDash([]);

    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(roadX + 4, 0);
    ctx.lineTo(roadX + 4, height);
    ctx.moveTo(roadX + roadWidth - 4, 0);
    ctx.lineTo(roadX + roadWidth - 4, height);
    ctx.stroke();
  }

  drawRoute(ctx, centerX, centerZ, scale) {
    if (this.routePoints.length < 2) {
      return;
    }

    ctx.strokeStyle = this.options.routeColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();

    let started = false;

    for (const point of this.routePoints) {
      const position = this.getPosition(point);

      if (!position) {
        continue;
      }

      const mapped = this.worldToMap(
        position,
        centerX,
        centerZ,
        scale
      );

      if (
        mapped.x < 0 ||
        mapped.x > this.options.width ||
        mapped.y < 0 ||
        mapped.y > this.options.height
      ) {
        continue;
      }

      if (!started) {
        ctx.moveTo(mapped.x, mapped.y);
        started = true;
      } else {
        ctx.lineTo(mapped.x, mapped.y);
      }
    }

    if (started) {
      ctx.stroke();
    }
  }

  drawPassengers(ctx, centerX, centerZ, scale) {
    ctx.fillStyle = this.options.passengerColor;

    for (const passenger of this.passengers) {
      const position = this.getPosition(passenger);

      if (!position) {
        continue;
      }

      const mapped = this.worldToMap(
        position,
        centerX,
        centerZ,
        scale
      );

      if (!this.isOnMap(mapped)) {
        continue;
      }

      ctx.beginPath();
      ctx.arc(mapped.x, mapped.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawTraffic(ctx, centerX, centerZ, scale) {
    for (const vehicle of this.traffic) {
      const position = this.getPosition(vehicle);

      if (!position) {
        continue;
      }

      const mapped = this.worldToMap(
        position,
        centerX,
        centerZ,
        scale
      );

      if (!this.isOnMap(mapped)) {
        continue;
      }

      const type =
        vehicle.userData?.type ||
        vehicle.type ||
        vehicle.vehicleType ||
        "car";

      ctx.fillStyle =
        type === "keke"
          ? "#fbbf24"
          : type === "police" || type === "karota"
            ? "#5da9ff"
            : this.options.trafficColor;

      ctx.fillRect(mapped.x - 2, mapped.y - 3, 4, 6);
    }
  }

  drawPlayer(ctx, position) {
    const x = this.options.width / 2;
    const y = this.options.height / 2;

    const rotation =
      this.player.rotation?.y ??
      this.player.mesh?.rotation?.y ??
      0;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-rotation);

    ctx.fillStyle = this.options.playerColor;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(6, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 6);
    ctx.closePath();

    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  drawCompass(ctx, width) {
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 11px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillText("N", width / 2, 10);
  }

  isOnMap(point) {
    return (
      point.x >= 0 &&
      point.x <= this.options.width &&
      point.y >= 0 &&
      point.y <= this.options.height
    );
  }

  clear() {
    if (!this.context) {
      return;
    }

    this.context.clearRect(
      0,
      0,
      this.canvas.width,
      this.canvas.height
    );
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.container?.remove();

    this.canvas = null;
    this.context = null;
    this.container = null;

    this.player = null;
    this.traffic = [];
    this.passengers = [];
    this.routePoints = [];

    this.disposed = true;
  }
}