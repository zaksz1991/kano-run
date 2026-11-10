/** Pure signal timing rules (testable without a browser). Green 45-60 s, then red 45-60 s, per junction. */
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export function cycleOf(i) {
  const green = 45 + Math.floor(hash(i + 1) * 16);
  const red = 45 + Math.floor(hash(i + 7) * 16);
  return { green, red, off: hash(i + 13) * (green + red) };
}

export function signalPhase(i, t) {
  const c = cycleOf(i);
  const len = c.green + c.red;
  const p = (((t + c.off) % len) + len) % len;
  if (p < c.green) {
    const left = c.green - p;
    return { state: left <= 4 ? 'amber' : 'green', left: Math.ceil(left), redAge: 0 };
  }
  const left = len - p;
  return { state: 'red', left: Math.ceil(left), redAge: p - c.green };
}
