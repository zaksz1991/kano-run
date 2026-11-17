/**
 * Wrapping a game method early used to freeze a copy of it, so patches installed on Game.prototype afterwards
 * (empty-tank rescue, fare haggling, ...) were silently skipped. This returns the method late-bound when it is
 * still the plain prototype method, and keeps any wrapper already stacked on the instance.
 */
export function kanoLateBoundMethod(game, name) {
  const current = game?.[name];
  if (typeof current !== 'function') return current;
  if (Object.prototype.hasOwnProperty.call(game, name)) return current.bind(game);
  const proto = Object.getPrototypeOf(game);
  if (typeof proto?.[name] !== 'function') return current.bind(game);
  return function lateBound(...a) { return proto[name].apply(game, a); };
}
