/**
 * Funny passenger and roadside-pedestrian chatter (Hausa with English gloss).
 * Passengers react to the keke's state (speed, potholes, fuel, bumps) and to who
 * they are; pedestrians shout at the keke as it passes. Non-blocking bubbles, rate
 * limited, never shown over a modal event.
 */
import { Game } from './game.js';

const PATCH = Symbol.for('kano.life.funnyChatter.v1');
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export const PASSENGER_LINES = {
  general: [
    ['Malam, kai keke ne ko jirgin sama?', 'Driver, is this a keke or an aeroplane?'],
    ['Ina da biki, ba jana’iza ba!', 'I’m going to a wedding, not a funeral!'],
    ['Wallahi zan sauka a nan, na manta kuɗina… ina wasa!', 'I’m getting off here, I forgot my money… just joking!'],
    ['Kar ka manta, ni ma ina da iyali.', 'Don’t forget, I have a family too.'],
    ['Wannan keke yana waka, ko?', 'This keke is singing, isn’t it?'],
    ['Sannu da zuwa… ni ne nake cikin keken!', 'Welcome… I’m the one in the keke!'],
  ],
  fast: [
    ['Malam ka rage gudu, ban rubuta wasiyya ba!', 'Slow down, I haven’t written my will!'],
    ['Allah ya sa mu isa lafiya, ba cikin labari ba!', 'May we arrive safely, not in the news!'],
    ['Ina addu’a a bayan nan, kai kuma kana tsere!', 'I’m praying back here and you’re racing!'],
  ],
  pothole: [
    ['Ayyah! Kashin bayana!', 'Ouch! My spine!'],
    ['Wannan rami ne ko ɗakin girki?', 'Is that a pothole or a kitchen?'],
    ['Ka ga rami? Ni na gani, bayana ya gani!', 'Did you see the pothole? My back sure did!'],
  ],
  lowFuel: [
    ['Man fetur ya kusa ƙarewa, mu tura ne?', 'Fuel is almost gone, do we push?'],
    ['Idan ya ƙare, ina tura sai ka rage min kuɗi.', 'If it runs out and I push, you discount my fare.'],
  ],
  'market woman': [
    ['Ka kula da kayana, tumatir ne, ba dutse ba!', 'Mind my goods, these are tomatoes, not stones!'],
    ['Idan tumatir ya fashe, kai zaka biya!', 'If a tomato bursts, you pay!'],
    ['Kasuwa ba ta jiran kowa, Malam.', 'The market waits for nobody, driver.'],
  ],
  student: [
    ['Ina da jarrabawa! Ka yi sauri, amma kar ka yi hatsari.', 'I have an exam! Hurry, but don’t crash.'],
    ['Idan na yi rashin nasara, laifin keke ne.', 'If I fail, blame the keke.'],
    ['Malam, ina da kuɗi kaɗan… amma ina da murmushi.', 'I have little money… but I have a smile.'],
  ],
  worker: [
    ['Ina makara aiki, oga zai tsane ni!', 'I’m late for work, the boss will skin me!'],
    ['Karshen wata ya zo, aljihu babu komai.', 'End of month, pockets empty.'],
  ],
  VIP: [
    ['Ba ka da A/C ne?', 'You don’t have A/C?'],
    ['Ina da taro mai muhimmanci, kar ka bi hanyar ramuka!', 'I have an important meeting, avoid the potholes!'],
  ],
};

export const PEDESTRIAN_LINES = [
  ['Keke! Keke! Ina zuwa Sabon Gari!', 'Keke! Keke! I’m going to Sabon Gari!'],
  ['Malam, ka ɗauke ni, ba ni da kuɗi… sai gobe!', 'Driver, carry me, I have no money… until tomorrow!'],
  ['Oga, wannan keke naka ya tsufa fiye da kakana!', 'Boss, your keke is older than my grandfather!'],
  ['Ka kula! Akuya ta ƙetara!', 'Careful! A goat is crossing!'],
  ['Kai! Ka gani na kuwa? Ina tsaye fa!', 'Hey! Did you see me? I’m standing right here!'],
  ['Sai mun ga abin da keke zai yi!', 'Let’s see what this keke can do!'],
  ['Naira nawa har Dakata?', 'How many naira to Dakata?'],
  ['Wannan sabon keke ne ko tsohon fenti?', 'Is that a new keke or old paint?'],
  ['Ka ɗauke ni, ina da kaza a cikin jaka!', 'Pick me up, I have a chicken in my bag!'],
  ['Tsaya! Ka yi kuskure, hanyar ba haka take ba!', 'Stop! Wrong way, that’s not the road!'],
];

let host = null;
function bubble() {
  if (typeof document === 'undefined') return null;
  if (host) return host;
  host = document.createElement('div');
  host.id = 'kano-chatter';
  host.setAttribute('role', 'status');
  host.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:205px;max-width:min(88vw,340px);z-index:35;padding:7px 12px;border-radius:12px;background:rgba(11,30,58,.92);border:1px solid #fbbf24;color:#fff;font:700 12px/1.3 system-ui,sans-serif;pointer-events:none;opacity:0;transition:opacity .25s;text-align:center';
  document.body.append(host);
  return host;
}

let hideTimer = 0;
export function showChatter(who, line) {
  const el = bubble();
  if (!el) return;
  el.replaceChildren();
  const hausa = document.createElement('div');
  hausa.textContent = `${who}: “${line[0]}”`;
  const english = document.createElement('div');
  english.textContent = line[1];
  english.style.cssText = 'opacity:.75;font-weight:500;font-size:11px;margin-top:2px';
  el.append(hausa, english);
  el.style.opacity = '1';
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { el.style.opacity = '0'; }, 4200);
}

export function chooseLine(s, passenger, random = Math.random) {
  const speed = Number(s?.speed) || 0;
  const lastHits = Number(s?.potholeHits) || 0;
  const pools = [];
  if (passenger) {
    pools.push(PASSENGER_LINES.general);
    if (PASSENGER_LINES[passenger.class]) pools.push(PASSENGER_LINES[passenger.class], PASSENGER_LINES[passenger.class]);
    if (/student/i.test(passenger.name || '')) pools.push(PASSENGER_LINES.student);
    if (speed > 55) pools.push(PASSENGER_LINES.fast, PASSENGER_LINES.fast);
    if (Number(s?.fuel) < 18) pools.push(PASSENGER_LINES.lowFuel, PASSENGER_LINES.lowFuel);
    if (s?.__chatterHits !== undefined && lastHits > s.__chatterHits) pools.push(PASSENGER_LINES.pothole, PASSENGER_LINES.pothole, PASSENGER_LINES.pothole);
    const pool = pools[Math.floor(random() * pools.length)];
    return { who: String(passenger.name || 'Passenger').replace(/ \(large passenger\)/, ''), line: pool[Math.floor(random() * pool.length)] };
  }
  return { who: 'Roadside', line: PEDESTRIAN_LINES[Math.floor(random() * PEDESTRIAN_LINES.length)] };
}

function installChatter() {
  if (Game.prototype[PATCH]) return;
  const originalTick = Game.prototype.tick;
  if (typeof originalTick !== 'function') return;
  Game.prototype.tick = function tickWithFunnyChatter(deltaSeconds, ...args) {
    const result = originalTick.call(this, deltaSeconds, ...args);
    try {
      const s = this.s;
      if (this.state === 'PLAY' && s && !s.event && !s.runEnded && (Number(s.speed) || 0) > 3) {
        this.__chatterWait = (this.__chatterWait ?? 8) - Math.min(0.1, Number(deltaSeconds) || 0);
        const hit = s.__chatterHits !== undefined && (Number(s.potholeHits) || 0) > s.__chatterHits;
        if (this.__chatterWait <= 0 || (hit && this.__chatterWait < 7)) {
          const passenger = s.passengers?.length ? s.passengers[Math.floor(Math.random() * s.passengers.length)] : null;
          const out = chooseLine(s, passenger && Math.random() < 0.75 ? passenger : null);
          showChatter(out.who, out.line);
          this.__chatterWait = 11 + Math.random() * 9;
        }
        s.__chatterHits = Number(s.potholeHits) || 0;
      }
    } catch (error) { /* chatter is cosmetic */ }
    return result;
  };
  Object.defineProperty(Game.prototype, PATCH, { value: true });
}
installChatter();
