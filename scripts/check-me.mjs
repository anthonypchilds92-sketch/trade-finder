// One-off: check fair-value model on real data
import { readFile } from 'node:fs/promises';
const html = await readFile('index.html', 'utf8');
const module = { exports: {} }; new Function('module', html.split('/*ENGINE-START*/')[1].split('/*ENGINE-END*/')[0])(module);
const E = module.exports, L = '1312072052827521024', S = 'https://api.sleeper.app/v1';
const get = async u => (await fetch(u)).json();
const league = await get(`${S}/league/${L}`);
const [users, rosters, fc, sp, stats] = await Promise.all([get(`${S}/league/${L}/users`), get(`${S}/league/${L}/rosters`),
  get('https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=10&ppr=0.5'), get(`${S}/players/nfl`), get(`${S}/stats/nfl/regular/${league.season}`)]);
const matchups = {}; for (let w = 1; w <= 9; w++) matchups[w] = await get(`${S}/league/${L}/matchups/${w}`);
const ktc = JSON.parse(await readFile('data/ktc.json', 'utf8')), historyKtc = JSON.parse(await readFile('data/history-ktc.json', 'utf8'));
const m = E.buildModel(E.applyValues({ league, users, rosters, fc, sleeperPlayers: sp, stats, matchups, myUsername: 'childsy14', ktc, historyKtc }, 'ktc'), { strategy: {}, marks: {} });
console.log('fairFit', JSON.stringify(Object.fromEntries(Object.entries(m.fairFit).map(([k, v]) => [k, v.map(x => +x.toFixed(3))]))));
const show = p => `${p.name.padEnd(20)} ${p.pos} ${Math.floor(p.age)} proj ${p.projPpg?.toFixed(1)} value ${Math.round(p.value)} fair ${p.fairValue ? Math.round(p.fairValue) : '-'} gap ${p.valueGap != null ? Math.round(p.valueGap * 100) + '%' : '-'} sell ${p.sell.toFixed(2)}`;
const qbs = [...m.players.values()].filter(p => p.pos === 'QB' && p.fairValue).sort((a, b) => b.value - a.value).slice(0, 24);
console.log('--- QBs'); qbs.forEach(p => console.log(show(p)));
console.log('--- MY PLAYERS'); m.me.players.filter(p => p.value >= 1000).sort((a, b) => b.value - a.value).forEach(p => console.log(show(p) + (p.overvalued ? ' OVERVALUED' : p.undervalued ? ' undervalued' : '')));
console.log('auto-shopped:', m.me.assets.filter(a => a.kind === 'player' && a.value >= 600 && (a.sell >= 0.35 || a.ageMult < 0.9) && !a.dip).map(a => a.name).join(', '));
