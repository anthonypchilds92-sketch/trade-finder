// One-off: debug the most recent trade's grade and verdict on real data
import { readFile } from 'node:fs/promises';
const html = await readFile('index.html', 'utf8');
const module = { exports: {} }; new Function('module', html.split('/*ENGINE-START*/')[1].split('/*ENGINE-END*/')[0])(module);
const E = module.exports, L = '1312072052827521024', S = 'https://api.sleeper.app/v1';
const get = async u => (await fetch(u)).json();
const league = await get(`${S}/league/${L}`);
const [users, rosters, fc, sp, stats, tp] = await Promise.all([get(`${S}/league/${L}/users`), get(`${S}/league/${L}/rosters`),
  get('https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=10&ppr=0.5'), get(`${S}/players/nfl`), get(`${S}/stats/nfl/regular/${league.season}`), get(`${S}/league/${L}/traded_picks`)]);
const last = league.settings.last_scored_leg, matchups = {}, schedule = {};
for (let w = 1; w <= 14; w++) { const ms = await get(`${S}/league/${L}/matchups/${w}`); if (w <= last) matchups[w] = ms; else schedule[w] = ms.map(m => ({ roster_id: m.roster_id, matchup_id: m.matchup_id })); }
const txns = []; for (let w = 0; w <= last + 1; w++) txns.push(...(await get(`${S}/league/${L}/transactions/${w}`)).filter(t => t.type === 'trade'));
const ktc = JSON.parse(await readFile('data/ktc.json', 'utf8')), historyKtc = JSON.parse(await readFile('data/history-ktc.json', 'utf8'));
const input = E.applyValues({ league, users, rosters, fc, sleeperPlayers: sp, stats, matchups, tradedPicks: tp, myUsername: 'childsy14', ktc, historyKtc,
  tradeHistory: [{ season: league.season, rosters: rosters.map(r => ({ roster_id: r.roster_id, owner_id: r.owner_id })), txns }] }, 'ktc');
const m = E.buildModel(input, { strategy: {}, marks: {} });
const e = m.tradeLog[0];
console.log('trade', new Date(e.when).toISOString(), 'leg', e.leg, 'atTime', e.atTime);
for (const sd of e.sides) {
  console.log(`SIDE ${sd.teamName}: got ${sd.got.map(a => `${a.name} [${a.kind} v=${Math.round(a.value)} then=${a.then} age=${a.age && a.age.toFixed(1)} pos=${a.pos}]`).join('; ')} | gave ${sd.gave.map(a => `${a.name} [${a.kind} v=${Math.round(a.value)} then=${a.then} age=${a.age && a.age.toFixed(1)}]`).join('; ')}`);
}
const odds = E.playoffOdds(m, matchups, schedule, Math.max(0, e.leg - 1), 14, 800);
for (const sd of e.sides) { const j = E.judgeSide(sd, m, odds, { entry: e, weeksLeft: 14 - last + 3 }); console.log('JUDGE', sd.teamName, '→', j?.label, '|', j?.text); }
