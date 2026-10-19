/**
 * Kano Life — Wedding Convoy Director
 * Additive event/state module for wedding and celebration convoy gameplay.
 * Does not create Three.js meshes or replace the existing traffic/physics loop.
 */

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const pick = (items, random = Math.random) => items[Math.floor(random() * items.length)];

const DEFAULTS = {
  invitationChance: 0.12,
  minimumDrivers: 3,
  maximumDrivers: 8,
  assembleSeconds: 18,
  eventSeconds: 150,
  cooldownSeconds: 240,
  safeSpeed: 8,
  recklessSpeed: 15,
  spectatorDensity: 0.6,
};

export class KanoWeddingConvoyDirector {
  constructor(options = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.random = options.random || Math.random;
    this.onEvent = options.onEvent || (() => {});
    this.onHorn = options.onHorn || (() => {});
    this.onIncident = options.onIncident || (() => {});
    this.onConvoyState = options.onConvoyState || (() => {});
    this.onInvitation = options.onInvitation || (() => {});
    this.state = 'idle';
    this.cooldown = 0;
    this.elapsed = 0;
    this.event = null;
    this.participants = [];
    this.incidents = [];
    this.disposed = false;
  }

  /** Call periodically with simulated game time, not wall-clock time. */
  update(dt, context = {}) {
    if (this.disposed || !Number.isFinite(dt) || dt <= 0) return;
    const delta = Math.min(dt, 0.25);
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - delta);
    this.elapsed += delta;

    if (this.state === 'idle') {
      if (this.cooldown <= 0 && context.inWorld !== false && this.random() < this.options.invitationChance * delta / 60) {
        this.createInvitation(context);
      }
      return;
    }

    if (this.state === 'invited') {
      this.event.invitationRemaining -= delta;
      if (this.event.invitationRemaining <= 0) this.expireInvitation();
      return;
    }

    if (this.state === 'assembling') {
      this.event.assembleRemaining -= delta;
      if (this.event.assembleRemaining <= 0) this.startConvoy();
      return;
    }

    if (this.state === 'active') {
      this.event.remaining -= delta;
      this.updateParticipants(delta, context);
      if (this.event.remaining <= 0) this.finishConvoy('completed');
    }
  }

  createInvitation(context = {}) {
    if (this.state !== 'idle') return null;
    const locations = context.locations?.length ? context.locations : ['wedding gathering point', 'neighbourhood junction', 'celebration venue'];
    this.event = {
      id: `kano-wedding-${Math.floor(this.random() * 1e9).toString(36)}-${Math.floor(this.elapsed)}`,
      kind: pick(['wedding', 'naming ceremony', 'family celebration'], this.random),
      location: pick(locations, this.random),
      invitationRemaining: 35,
      assembleRemaining: this.options.assembleSeconds,
      remaining: this.options.eventSeconds,
      startedAt: this.elapsed,
      participantsTarget: Math.floor(this.options.minimumDrivers + this.random() * (this.options.maximumDrivers - this.options.minimumDrivers + 1)),
      spectators: Math.floor(8 + this.random() * 32),
      status: 'invited',
    };
    this.state = 'invited';
    this.onInvitation({ ...this.event });
    this.onEvent({ type: 'convoy_invitation', event: { ...this.event } });
    return { ...this.event };
  }

  acceptInvitation(player = {}, availableDrivers = []) {
    if (this.state !== 'invited' || !this.event) return false;
    this.participants = [{
      id: player.id || 'player',
      isPlayer: true,
      style: player.drivingStyle || 'balanced',
      vehicleId: player.vehicleId || null,
      joined: true,
      active: true,
      risk: 0,
      laneOffset: 0,
      speedTarget: this.options.safeSpeed,
    }];
    for (const driver of availableDrivers) {
      if (this.participants.length >= this.event.participantsTarget) break;
      if (!driver || driver.available === false || driver.id === this.participants[0].id) continue;
      this.participants.push({
        id: driver.id,
        isPlayer: false,
        style: driver.personality === 'reckless' ? 'showoff' : (driver.drivingStyle || 'balanced'),
        vehicleId: driver.vehicleId || null,
        joined: true,
        active: true,
        risk: 0,
        laneOffset: this.random() * 2 - 1,
        speedTarget: driver.personality === 'reckless' ? this.options.recklessSpeed : this.options.safeSpeed,
      });
    }
    this.event.status = 'assembling';
    this.state = 'assembling';
    this.onEvent({ type: 'convoy_assembling', event: { ...this.event }, participants: this.getParticipants() });
    return true;
  }

  declineInvitation(reason = 'declined') {
    if (this.state !== 'invited') return false;
    this.onEvent({ type: 'convoy_invitation_declined', reason, event: { ...this.event } });
    this.reset(this.options.cooldownSeconds);
    return true;
  }

  startConvoy() {
    if (this.state !== 'assembling' || !this.event) return;
    this.state = 'active';
    this.event.status = 'active';
    this.event.remaining = this.options.eventSeconds;
    this.onHorn({ eventId: this.event.id, count: this.participants.length });
    this.onEvent({ type: 'convoy_started', event: { ...this.event }, participants: this.getParticipants() });
    this.onConvoyState({ state: this.state, event: { ...this.event }, participants: this.getParticipants() });
  }

  updateParticipants(dt, context) {
    const congestion = clamp(Number(context.congestion) || 0, 0, 1);
    const spectators = clamp(Number(context.spectatorDensity ?? this.options.spectatorDensity), 0, 1);
    for (const participant of this.participants) {
      if (!participant.active) continue;
      const showoff = participant.style === 'showoff' || participant.style === 'reckless';
      const target = showoff ? this.options.recklessSpeed : this.options.safeSpeed;
      participant.speedTarget = target * (1 - congestion * 0.65);
      participant.risk = clamp(participant.risk + dt * (showoff ? 0.018 : 0.004) * (1 + spectators) * (1 + congestion), 0, 1);
      // A movement adapter may read these values; this module does not move meshes.
    }
    this.onConvoyState({ state: this.state, event: { ...this.event }, participants: this.getParticipants() });
  }

  /** Call from the game's existing collision/incident system. */
  reportIncident({ participantId, kind = 'near_miss', severity = 0.2, targetType = 'vehicle', position = null } = {}) {
    if (this.state !== 'active' || !this.event) return false;
    const participant = this.participants.find((item) => item.id === participantId);
    const incident = {
      id: `${this.event.id}-incident-${this.incidents.length + 1}`,
      eventId: this.event.id,
      participantId: participantId || 'unknown',
      kind,
      severity: clamp(Number(severity) || 0, 0, 1),
      targetType,
      position,
      time: this.elapsed,
      resolved: false,
    };
    this.incidents.push(incident);
    if (participant) participant.risk = clamp(participant.risk + incident.severity * 0.4, 0, 1);
    this.onIncident({ ...incident });
    this.onEvent({ type: 'convoy_incident', incident: { ...incident } });
    return true;
  }

  leaveConvoy(participantId = 'player', reason = 'left') {
    const participant = this.participants.find((item) => item.id === participantId);
    if (!participant || !participant.active) return false;
    participant.active = false;
    this.onEvent({ type: 'convoy_participant_left', participant: { ...participant }, reason });
    if (!this.participants.some((item) => item.active)) this.finishConvoy('all_left');
    return true;
  }

  finishConvoy(reason = 'completed') {
    if (!this.event) return;
    const summary = {
      event: { ...this.event, status: reason },
      reason,
      participantCount: this.participants.length,
      activeParticipants: this.participants.filter((item) => item.active).length,
      incidents: this.incidents.filter((item) => item.eventId === this.event.id).map((item) => ({ ...item })),
      duration: this.options.eventSeconds - Math.max(0, this.event.remaining || 0),
    };
    this.onEvent({ type: 'convoy_finished', summary });
    this.reset(this.options.cooldownSeconds);
  }

  expireInvitation() {
    if (this.event) this.onEvent({ type: 'convoy_invitation_expired', event: { ...this.event } });
    this.reset(this.options.cooldownSeconds * 0.5);
  }

  reset(cooldown = 0) {
    this.state = 'idle';
    this.cooldown = Math.max(0, cooldown);
    this.event = null;
    this.participants = [];
  }

  getParticipants() {
    return this.participants.map((participant) => ({ ...participant }));
  }

  getSnapshot() {
    return {
      state: this.state,
      cooldown: this.cooldown,
      event: this.event ? { ...this.event } : null,
      participants: this.getParticipants(),
      incidentCount: this.incidents.length,
    };
  }

  dispose() {
    this.disposed = true;
    this.reset(0);
    this.incidents.length = 0;
  }
}
