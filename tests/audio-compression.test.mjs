import test from 'node:test';
import assert from 'node:assert/strict';
import { AUDIO_ASSET_ROOT, OPUS_AUDIO_MIME, resolveAudioAsset, supportsOpusAudio, switchToMp3Fallback } from '../js/audio-format.js';
import { ACTIVE_AUDIO_TRACKS } from '../scripts/compress-audio.mjs';

const variants = Object.freeze({
  'engine.mp3': 'engine.opus.ogg',
  'radio-kano.mp3': 'radio-kano.opus.ogg',
});

test('Opus support detection accepts the browser maybe/probably responses and fails closed', () => {
  assert.equal(supportsOpusAudio({ canPlayType: (mime) => mime === OPUS_AUDIO_MIME ? 'probably' : '' }), true);
  assert.equal(supportsOpusAudio({ canPlayType: () => 'maybe' }), true);
  assert.equal(supportsOpusAudio({ canPlayType: () => '' }), false);
  assert.equal(supportsOpusAudio({ canPlayType: () => { throw new Error('probe failed'); } }), false);
  assert.equal(supportsOpusAudio(null), false);
});

test('registered compressed variants are selected only if the browser supports Opus', () => {
  assert.deepEqual(resolveAudioAsset('radio-kano.mp3', variants, true), {
    url: `${AUDIO_ASSET_ROOT}radio-kano.opus.ogg`,
    fallbackUrl: `${AUDIO_ASSET_ROOT}radio-kano.mp3`,
    format: 'opus',
    mp3Url: `${AUDIO_ASSET_ROOT}radio-kano.mp3`,
  });
  assert.equal(resolveAudioAsset('radio-kano.mp3', variants, false).url, `${AUDIO_ASSET_ROOT}radio-kano.mp3`);
  assert.equal(resolveAudioAsset('radio-kano.mp3', {}, true).format, 'mp3');
});

test('audio asset resolution rejects traversal and non-audio paths', () => {
  assert.equal(resolveAudioAsset('../secret.mp3', variants, true), null);
  assert.equal(resolveAudioAsset('folder/radio-kano.mp3', variants, true), null);
  assert.equal(resolveAudioAsset('radio-kano.wav', variants, true), null);
});

test('Ogg playback failure can switch to MP3 exactly once without touching the original file', () => {
  const player = {
    src: `${AUDIO_ASSET_ROOT}radio-kano.opus.ogg`,
    __kanoAudioFallbackUrl: `${AUDIO_ASSET_ROOT}radio-kano.mp3`,
    __kanoAudioFallbackUsed: false,
    loadCount: 0,
    load() { this.loadCount += 1; },
  };
  assert.equal(switchToMp3Fallback(player), true);
  assert.equal(player.src, `${AUDIO_ASSET_ROOT}radio-kano.mp3`);
  assert.equal(player.__kanoAudioUsingMp3Fallback, true);
  assert.equal(player.loadCount, 1);
  assert.equal(switchToMp3Fallback(player), false);
  assert.equal(player.loadCount, 1);
});

test('audio compression operates on the eight active tracks and keeps source MP3s as fallbacks', () => {
  assert.equal(ACTIVE_AUDIO_TRACKS.length, 8);
  assert.deepEqual(ACTIVE_AUDIO_TRACKS.map(({ file }) => file), [
    'engine.mp3', 'horn.mp3', 'radio-kano.mp3', 'rahama.mp3',
    'freedom.mp3', 'cool.mp3', 'arewa.mp3', 'wazobia.mp3',
  ]);
  assert.ok(ACTIVE_AUDIO_TRACKS.every(({ bitrate }) => /^\d+k$/.test(bitrate) && Number.parseInt(bitrate, 10) >= 64 && Number.parseInt(bitrate, 10) <= 96));
});
