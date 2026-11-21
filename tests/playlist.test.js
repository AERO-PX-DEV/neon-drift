import test from 'node:test';
import assert from 'node:assert/strict';
import { CORE, normalize, matchScore, linkPlaylist, parseFileName, guessStation } from '../src/audio/playlist.js';

const t = (id, name) => ({ id, name, ...parseFileName(name) });

test('normalize handles Ø, $ and extensions', () => {
  assert.equal(normalize('VØJ x GOLDKID$ - Memory Reboot (Over Slowed).MP3'.toLowerCase()), 'voj x goldkids memory reboot over slowed');
});

test('every title word must match', () => {
  assert.equal(matchScore(CORE[0], 'Encrypted Memory.mp3'), 0);
  assert.ok(matchScore(CORE[7], 'encrypted_memory_over_slowed.mp3') > 0.7);
});

test('auto-links the playlist and prefers the right variant', () => {
  const tracks = [
    t('a', 'VØJ, Narvent - Memory Reboot (Slowed).mp3'),
    t('b', 'VØJ, Narvent - Memory Reboot (Over Slowed).mp3'),
    t('c', 'Narvent - Fainted.ogg'),
    t('d', 'random song.mp3'),
    t('e', 'Lonely Lies, GOLDKID$ - Interlinked (Slowed).m4a'),
  ];
  const links = linkPlaylist(CORE, tracks);
  assert.equal(links[0], 'b');
  assert.equal(links[1], 'e');
  assert.equal(links[3], 'c');
  assert.equal(links[4], undefined, 'Embrace has no file');
  assert.ok(!Object.values(links).includes('d'));
});

test('explicit links win and missing files are dropped', () => {
  const tracks = [t('x', 'whatever.mp3'), t('c', 'Narvent - Fainted.ogg')];
  const links = linkPlaylist(CORE, tracks, { 4: 'x', 5: 'gone' });
  assert.equal(links[4], 'x');
  assert.equal(links[5], undefined);
  assert.equal(links[3], 'c');
});

test('stations are guessed from artists and keywords', () => {
  assert.equal(guessStation('Perturbator - Future Club'), 'nocturne');
  assert.equal(guessStation('Kaito Shoma - Hydra'), 'skyline');
  assert.equal(guessStation('someone - night drive (slowed + reverb)'), 'overslowed');
  assert.equal(guessStation('rain ambient loop'), 'offworld');
  assert.equal(guessStation('unknown track'), 'skyline');
});
