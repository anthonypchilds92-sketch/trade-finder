// Reads KeepTradeCut's public dynasty rankings once a day and saves values keyed by Sleeper ID,
// so the site can use KTC values (browsers can't read KTC directly). Unofficial: if KTC changes its
// page, this step fails quietly and the site keeps using FantasyCalc.
import { readFile, writeFile } from 'node:fs/promises';

const UA = 'Mozilla/5.0 (personal dynasty trade-finder; one request per day)';
const res = await fetch('https://keeptradecut.com/dynasty-rankings?page=0&filters=QB|WR|RB|TE|RDP&format=2', { headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
const html = await res.text();
const m = html.match(/(?:var|let|const)\s+playersArray\s*=\s*(\[[\s\S]*?\]);\s*\n/) || html.match(/playersArray\s*=\s*(\[[\s\S]*?\]);/);
if (!m) {
  console.log('status', res.status, 'length', html.length);
  console.log('title', (html.match(/<title>([^<]*)/) || [])[1]);
  for (const key of ['playersArray', 'superflexValues', 'oneQBValues', 'cf-chl', 'challenge', '__NEXT_DATA__']) {
    const i = html.indexOf(key); console.log(key, i, i >= 0 ? JSON.stringify(html.slice(Math.max(0, i - 80), i + 160)) : '');
  }
  throw new Error('KTC playersArray not found (page format changed?)');
}
const arr = JSON.parse(m[1]);

// Name matching against Sleeper IDs (FantasyCalc gives names + Sleeper IDs; Sleeper's player list covers the rest)
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z]/g, '');
const fc = await (await fetch('https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=10&ppr=0.5')).json();
const sleeper = await (await fetch('https://api.sleeper.app/v1/players/nfl')).json();
const byKey = new Map();
const add = (name, pos, id) => { const k = norm(name) + '|' + pos; if (!byKey.has(k)) byKey.set(k, String(id)); };
for (const r of fc) if (r.player?.sleeperId) add(r.player.name, r.player.position, r.player.sleeperId);
for (const [id, p] of Object.entries(sleeper)) if (p.active && ['QB', 'RB', 'WR', 'TE'].includes(p.position)) add(p.full_name || `${p.first_name} ${p.last_name}`, p.position, id);

const values = {}, picks = [], unmatched = [];
for (const p of arr) {
  const sf = p.superflexValues || {}, one = p.oneQBValues || {};
  const v = sf.value ?? p.value;
  const tep = sf.tep?.value ?? null;       // TE-premium variant, when KTC provides it
  if (p.position === 'RDP' || /\b20\d\d\b/.test(p.playerName) && /(1st|2nd|3rd|4th|round|pick)/i.test(p.playerName)) {
    picks.push({ name: p.playerName, value: v }); continue;
  }
  const id = byKey.get(norm(p.playerName) + '|' + p.position);
  if (!id) { unmatched.push(p.playerName); continue; }
  values[id] = { v, tep, oneQB: one.value ?? null, name: p.playerName };
}
const out = { date: new Date().toISOString().slice(0, 10), count: Object.keys(values).length, values, picks, unmatched };
await writeFile('data/ktc.json', JSON.stringify(out));

// Keep a KTC history too, so buy-low dips can be measured on KTC values
let hist = { dates: [], values: {} };
try { hist = JSON.parse(await readFile('data/history-ktc.json', 'utf8')); } catch {}
const today = out.date;
let idx = hist.dates.indexOf(today);
if (idx === -1) { hist.dates.push(today); idx = hist.dates.length - 1; for (const k of Object.keys(hist.values)) hist.values[k].push(null); }
for (const [id, x] of Object.entries(values)) { hist.values[id] ??= new Array(hist.dates.length).fill(null); hist.values[id][idx] = x.v; }
const cutoff = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
const from = hist.dates.findIndex(d => d >= cutoff);
if (from > 0) { hist.dates = hist.dates.slice(from); for (const k of Object.keys(hist.values)) hist.values[k] = hist.values[k].slice(from); }
await writeFile('data/history-ktc.json', JSON.stringify(hist));
console.log(`KTC: ${arr.length} entries, ${out.count} matched, ${picks.length} picks, ${unmatched.length} unmatched: ${unmatched.slice(0, 15).join(', ')}`);
