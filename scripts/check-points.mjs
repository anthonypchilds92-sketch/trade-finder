// One-off: sanity-check the points model on real data
import { readFile } from 'node:fs/promises';
const html = await readFile('index.html', 'utf8');
const module = { exports: {} }; new Function('module', html.split('/*ENGINE-START*/')[1].split('/*ENGINE-END*/')[0])(module);
const E = module.exports, L = '1312072052827521024', S = 'https://api.sleeper.app/v1';
const get = async u => (await fetch(u)).json();
const league = await get(`${S}/league/${L}`);
const [users, rosters, fc, sp, stats, statsPrev] = await Promise.all([get(`${S}/league/${L}/users`), get(`${S}/league/${L}/rosters`),
  get('https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=10&ppr=0.5'), get(`${S}/players/nfl`), get(`${S}/stats/nfl/regular/${league.season}`), get(`${S}/stats/nfl/regular/${+league.season - 1}`)]);
const matchups = {}; for (let w = 1; w <= 8; w++) matchups[w] = await get(`${S}/league/${L}/matchups/${w}`);
let ktc = null; try { ktc = JSON.parse(await readFile('data/ktc.json', 'utf8')); } catch {}
const m = E.buildModel(E.applyValues({ league, users, rosters, fc, sleeperPlayers: sp, stats, statsPrev, matchups, myUsername: 'childsy14', ktc }, 'ktc'), { strategy: {}, marks: {} });
console.log('fit:', JSON.stringify(Object.fromEntries(Object.entries(m.fit).map(([k, v]) => [k, v.map(x => +x.toFixed(3))]))), 'modes:', JSON.stringify(m.featMode));
const rows = [...m.proj.entries()].filter(([id, x]) => x.projPpg != null && x.gp >= 3 && x.projRank && x.valRankAll && sp[id]?.team && x.valRankAll - x.projRank >= 6 && x.projPpg >= 7)
  .map(([id, x]) => ({ n: sp[id].full_name, pos: x.pos, age: sp[id].age, proj: x.projPpg.toFixed(1), xp: x.xppg?.toFixed(1), szn: x.seasonPpg.toFixed(1), l4: x.last4?.toFixed(1), r: `${x.pos}${x.projRank} vs val ${x.pos}${x.valRankAll}`, gap: x.valRankAll - x.projRank, own: m.players.get(id) ? m.teamById.get(m.players.get(id).owner).name : 'FA' }))
  .sort((a, b) => b.gap * Math.sqrt(b.proj) - a.gap * Math.sqrt(a.proj)).slice(0, 20);
for (const r of rows) console.log(JSON.stringify(r));
const me = m.me.players.filter(p => p.projPpg != null).sort((a, b) => b.projPpg - a.projPpg).slice(0, 8).map(p => `${p.name} ${p.projPpg.toFixed(1)} (x ${p.xppg?.toFixed(1)}, szn ${p.seasonPpg?.toFixed(1)}, l4 ${p.last4?.toFixed(1)}, '25 ${p.prevPpg?.toFixed(1)})`);
console.log('ME:', me.join(' | '));
