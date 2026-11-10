// One-off: check sell flags and value trends for my roster on real data
import { readFile } from 'node:fs/promises';
const html = await readFile('index.html', 'utf8');
const module = { exports: {} }; new Function('module', html.split('/*ENGINE-START*/')[1].split('/*ENGINE-END*/')[0])(module);
const E = module.exports, L = '1312072052827521024', S = 'https://api.sleeper.app/v1';
const get = async u => (await fetch(u)).json();
const league = await get(`${S}/league/${L}`);
const [users, rosters, fc, sp, stats] = await Promise.all([get(`${S}/league/${L}/users`), get(`${S}/league/${L}/rosters`),
  get('https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=10&ppr=0.5'), get(`${S}/players/nfl`), get(`${S}/stats/nfl/regular/${league.season}`)]);
const ktc = JSON.parse(await readFile('data/ktc.json', 'utf8')), historyKtc = JSON.parse(await readFile('data/history-ktc.json', 'utf8'));
const input = E.applyValues({ league, users, rosters, fc, sleeperPlayers: sp, stats, myUsername: 'childsy14', ktc, historyKtc }, 'ktc');
console.log('trend label:', input.trendLabel, '| ktc history dates:', historyKtc.dates.join(','));
const m = E.buildModel(input, { strategy: {}, marks: {} });
for (const p of m.me.players.filter(p => p.value >= 700).sort((a, b) => b.value - a.value))
  console.log(`${p.name.padEnd(22)} ${p.pos} age ${Math.floor(p.age)} value ${Math.round(p.value)} trend ${Math.round(p.trend)} ageMult ${p.ageMult} sell ${p.sell.toFixed(2)}${p.sell >= 0.45 ? ' SELL-TAG' : ''}${p.dip ? ' DIP' : ''}`);
const give = m.me.assets.filter(a => a.kind === 'player' && a.value >= 600 && (a.sell >= 0.35 || a.ageMult < 0.9)).map(a => a.name);
console.log('auto-shopped:', give.join(', '));
