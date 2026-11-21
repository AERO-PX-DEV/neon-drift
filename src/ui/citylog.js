import { LORE } from '../world/fragments.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// info: { clock, weather, district, traffic, nowPlaying } · progress: { fragments: Set, photos: Set }
export function cityLogHTML(info, progress, spots, visited = []) {
  const D = info.district;
  const frags = LORE.map(([title, text], i) => (progress.fragments.has(i)
    ? `<div class="lore"><b>${i + 1}. ${esc(title)}</b><p>${esc(text)}</p></div>`
    : `<div class="lore locked">${i + 1}. ░░░░░░ <span>memory fragment not found</span></div>`)).join('');
  const photos = spots.map((s, i) => `<li class="${progress.photos.has(i) ? 'got' : ''}">${progress.photos.has(i) ? '◉' : '○'} ${esc(s.name)}<span>${esc(s.hint)}</span></li>`).join('');
  return `
    <h3>CITY LOG · ${esc(info.clock)}</h3>
    <div class="dn">${esc(D.name)}</div><p class="fl">${esc(D.flavour)}</p>
    <table><tr><td>Mood</td><td>${esc(D.mood)}</td></tr><tr><td>Population</td><td>${esc(D.density)}</td></tr>
    <tr><td>Weather</td><td>${esc(info.weather)}</td></tr><tr><td>Traffic</td><td>${esc(info.traffic)}</td></tr>
    <tr><td>On the radio</td><td>${esc(info.nowPlaying) || '—'}</td></tr></table>
    <h3>MEMORY FRAGMENTS · ${progress.fragments.size}/${LORE.length}</h3>${frags}
    <h3>PHOTO SPOTS · ${progress.photos.size}/${spots.length}</h3><ul class="spots">${photos}</ul>
    ${visited.length ? `<h3>PLACES YOU'VE DOCKED</h3><p>${visited.map(esc).join(' · ')}</p>` : ''}`;
}
