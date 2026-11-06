// Saves today's FantasyCalc dynasty values into data/history.json (keeps the last 180 days).
// Run daily by .github/workflows/snapshot.yml so the site can measure how long a player's dip has lasted.
import { readFile, writeFile } from 'node:fs/promises';

const URL = 'https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=10&ppr=0.5&includeAdjacent=true';
const FILE = 'data/history.json';
const KEEP_DAYS = 180;

const res = await fetch(URL);
if (!res.ok) throw new Error(`FantasyCalc returned ${res.status}`);
const rows = await res.json();

let hist = { dates: [], values: {} };
try { hist = JSON.parse(await readFile(FILE, 'utf8')); } catch {}

const today = new Date().toISOString().slice(0, 10);
let idx = hist.dates.indexOf(today);
if (idx === -1) {
  hist.dates.push(today);
  idx = hist.dates.length - 1;
  for (const id of Object.keys(hist.values)) hist.values[id].push(null);
}
// Picks: average value per season + round, saved as "pick:2027:1"
const pickAgg = {};
for (const r of rows) {
  if (r.player?.position !== 'PICK') continue;
  const y = (r.player.name.match(/\b(20\d\d)\b/) || [])[1];
  const rd = (r.player.name.match(/(\d)(?:st|nd|rd|th)\b/i) || r.player.name.match(/Round\s*(\d)/i) || r.player.name.match(/Pick\s*(\d)\./i) || [])[1];
  if (y && rd) (pickAgg[`pick:${y}:${rd}`] ??= []).push(r.value);
}
for (const [k, vs] of Object.entries(pickAgg)) { hist.values[k] ??= new Array(hist.dates.length).fill(null); hist.values[k][idx] = Math.round(vs.reduce((a, b) => a + b, 0) / vs.length); }
for (const r of rows) {
  const id = r.player?.sleeperId;
  if (!id) continue;
  hist.values[id] ??= new Array(hist.dates.length).fill(null);
  hist.values[id][idx] = r.value;
}

// Trim to the last KEEP_DAYS and drop players with no values left
const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
const keepFrom = hist.dates.findIndex(d => d >= cutoff);
if (keepFrom > 0) {
  hist.dates = hist.dates.slice(keepFrom);
  for (const id of Object.keys(hist.values)) hist.values[id] = hist.values[id].slice(keepFrom);
}
for (const [id, v] of Object.entries(hist.values)) if (v.every(x => x == null)) delete hist.values[id];

await writeFile(FILE, JSON.stringify(hist));
console.log(`Saved ${rows.length} values for ${today}; history spans ${hist.dates.length} days.`);
