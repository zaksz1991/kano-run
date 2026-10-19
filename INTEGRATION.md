# Integration map

## Shared game loop
Use the existing renderer/physics loop; do not create a competing loop. Suggested frame integration:

```js
scaler.update();
dialogue.update();
```

## Touch input mapping

```js
const touch = new MobileTouchControls({ handlers: {
  steer: value => inputState.steer = value,
  throttle: value => inputState.throttle = value,
  brake: value => inputState.brake = value,
  handbrake: value => inputState.handbrake = value
}});
```
Replace `inputState` property names with the real controls API; do not paste blindly if the existing game uses different names.

## Supabase presence

```js
const online = new OnlinePresenceAndLeaderboard({
  supabase,
  onCount: count => onlineCounter.textContent = `${count} playing now`
});
await online.start({ game: 'kano-life' });
```

The count represents active Realtime presence keys on the configured channel. Do not label it “all-time visitors”.

## Quality scaler

```js
const scaler = new AdaptivePerformanceScaler({ renderer, composer, onChange: q => {
  qualityLabel.textContent = `Graphics: ${q.level === 0 ? 'Low' : q.level === 1 ? 'Medium' : 'High'}`;
}});
```

## Dialogue bubble anchors
For a Three.js passenger, use `Vector3.project(camera)` to map the passenger's world position into viewport pixels and position a DOM anchor there, then pass the anchor to `speakRandom`. Avoid creating DOM elements for every pedestrian; pool/reuse anchors.
