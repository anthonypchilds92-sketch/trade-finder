// Weekly round-up: works out this week's byes, records buy-low / injury-stash lists (so the site can show
// what's new), and writes a markdown summary for a GitHub issue. Reuses the site's own trade engine.
import { readFile, writeFile } from 'node:fs/promises';

const LEAGUE_ID = '1312072052827521024';
const MY_USERNAME = 'childsy14';
const S = 'https://api.sleeper.app/v1';
const SITE = 'https://anthonypchilds92-sketch.github.io/trade-finder/';
const ALL_TEAMS = ['ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','JAX','KC','LV','LAC','LAR','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SF','SEA','TB','TEN','WAS'];

const get = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); };
const soft = p => p.catch(e => { console.warn('skipped:', e.message); return null; });

// Load the engine straight out of index.html so site and round-up always agree
const html = await readFile('index.html', 'utf8');
const engineSrc = html.split('/*ENGINE-START*/')[1].split('/*ENGINE-END*/')[0];
const module = { exports: {} };
new Function('module', engineSrc)(module);
const ENGINE = module.exports;

const league = await get(`${S}/league/${LEAGUE_ID}`);
const state = await get(`${S}/state/nfl`);
const week = state.display_week || state.week;
const season = state.season || league.season;
const qb = (league.roster_positions || []).filter(s => s === 'QB' || s === 'SUPER_FLEX').length >= 2 ? 2 : 1;
const [users, rosters, tradedPicks, fc, trending, sleeperPlayers, stats] = await Promise.all([
  get(`${S}/league/${LEAGUE_ID}/users`), get(`${S}/league/${LEAGUE_ID}/rosters`),
  soft(get(`${S}/league/${LEAGUE_ID}/traded_picks`)),
  get(`https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=${qb}&numTeams=${league.total_rosters || 10}&ppr=${league.scoring_settings?.rec ?? 0.5}&includeAdjacent=true`),
  soft(get(`${S}/players/nfl/trending/add?lookback_hours=72&limit=200`)),
  soft(get(`${S}/players/nfl`)),
  soft(get(`${S}/stats/nfl/regular/${season}`)),
]);
let history = null; try { history = JSON.parse(await readFile('data/history.json', 'utf8')); } catch {}
let ktc = null, historyKtc = null;
try { ktc = JSON.parse(await readFile('data/ktc.json', 'utf8')); } catch {}
try { historyKtc = JSON.parse(await readFile('data/history-ktc.json', 'utf8')); } catch {}

// Byes: teams with no game this week. Try Sleeper's schedule, then ESPN's scoreboard.
async function byeTeams() {
  try {
    const sched = await get(`https://api.sleeper.com/schedule/nfl/regular/${season}`);
    const playing = new Set(sched.filter(g => +g.week === +week).flatMap(g => [g.home, g.away]));
    if (playing.size >= 20) return ALL_TEAMS.filter(t => !playing.has(t));
  } catch (e) { console.warn('Sleeper schedule failed:', e.message); }
  try {
    const sb = await get(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${week}&dates=${season}`);
    const fix = a => ({ WSH: 'WAS', JAC: 'JAX' }[a] || a);
    const playing = new Set((sb.events || []).flatMap(e => e.competitions?.[0]?.competitors?.map(c => fix(c.team.abbreviation)) || []));
    if (playing.size >= 20) return ALL_TEAMS.filter(t => !playing.has(t));
  } catch (e) { console.warn('ESPN scoreboard failed:', e.message); }
  return null;
}
const byes = await byeTeams();

const prefs = { fairness: 0.12, maxAssets: 2, protectPicks: true, strategy: {}, marks: {}, evenDeals: 'prefer' };
const input = ENGINE.applyValues({ league, users, rosters, tradedPicks: tradedPicks || [], fc, sleeperPlayers, stats, trending: trending || [], myUsername: MY_USERNAME, history, ktc, historyKtc }, 'ktc');
const model = ENGINE.buildModel(input, prefs);
const others = [...model.players.values()].filter(p => p.owner !== model.me.rosterId);
const buyLows = others.filter(p => p.buyLow), stashes = others.filter(p => p.injStash);

let prev = {}; try { prev = JSON.parse(await readFile('data/week.json', 'utf8')); } catch {}
const sameWeek = String(prev.week) === String(week) && String(prev.season) === String(season);
const prevBuyLows = sameWeek ? prev.prevBuyLows || [] : prev.buyLows || [];
const prevStashes = sameWeek ? prev.prevStashes || [] : prev.stashes || [];
await writeFile('data/week.json', JSON.stringify({
  season, week, generatedAt: new Date().toISOString(), byes: byes || [], byesKnown: !!byes,
  buyLows: buyLows.map(p => p.id), stashes: stashes.map(p => p.id), prevBuyLows, prevStashes,
}, null, 1));

// ---- Markdown round-up ----
const fmt = ENGINE.fmt;
const team = id => model.teamById.get(id)?.name || '';
const newBL = buyLows.filter(p => !prevBuyLows.includes(p.id));
const newST = stashes.filter(p => !prevStashes.includes(p.id));
const needs = ENGINE.weeklyNeeds(model, prefs, byes || []);
const L = [];
L.push(`## Week ${week} round-up · ${league.name}`, '');
L.push(`[Open your trade finder](${SITE}) for live trades and one-tap offers.`, '');
L.push(byes ? `**On bye:** ${byes.length ? byes.join(', ') : 'nobody'}` : '_Bye weeks unavailable this time; injuries only._', '');
L.push('### Teams short this week');
if (!needs.length) L.push('No contending team has a meaningful hole this week.');
for (const n of needs.slice(0, 6)) {
  L.push(`- **${n.team.name}** (${n.team.wins}–${n.team.losses}): short ~${n.gap.toFixed(1)} pts at **${n.pos}**${n.reasons.length ? `: ${n.reasons.join(', ')}` : ''}.`);
  if (n.trade) L.push(`  - Idea: send ${n.trade.give.map(a => a.name).join(' + ')} for ${n.trade.get.map(a => a.name).join(' + ')} (${fmt(n.trade.gv)} for ${fmt(n.trade.rv)}).`);
}
L.push('', '### New buy-low candidates');
L.push(newBL.length ? newBL.map(p => `- **${p.name}** (${p.pos}, ${Math.floor(p.age)}), ${team(p.owner)}: ${fmt(p.value)}, down ${Math.round(p.dropPct * 100)}%${p.dipDays != null ? ` over ${p.dipDays} days` : ' in 30 days'}`).join('\n') : 'None since last week.');
L.push('', '### New injury stashes');
L.push(newST.length ? newST.map(p => `- **${p.name}** (${p.pos}, ${Math.floor(p.age)}), ${team(p.owner)}: ${p.injury}${p.injuryBody ? ` (${p.injuryBody})` : ''}, ${fmt(p.value)} now, about ${fmt(p.injRebound / p.ageMult)} once healthy`).join('\n') : 'None since last week.');
const fa = ENGINE.freeAgents(model, prefs).list.slice(0, 5);
L.push('', '### Free agents to watch');
L.push(fa.length ? fa.map(f => `- **${f.name}** (${f.pos}, ${f.team}): ${f.notes.join(' · ')}${f.drop ? ` → add, drop ${f.drop.name}` : ''}`).join('\n') : 'Nobody stands out.');
const top = ENGINE.generateTrades(model, prefs).slice(0, 3);
L.push('', '### Top 3 trades right now');
L.push(top.length ? top.map(t => `- **${t.partner.name}**: send ${t.give.map(a => a.name).join(' + ')}, get ${t.get.map(a => a.name).join(' + ')}`).join('\n') : 'None pass the filters right now.');
L.push('', '_Uses KTC values and default settings. Your own Protect/Shop marks and strategy changes apply on the site._');
L.push('', 'cc @anthonypchilds92-sketch');
await writeFile('roundup.md', L.join('\n'));
console.log(L.join('\n'));
