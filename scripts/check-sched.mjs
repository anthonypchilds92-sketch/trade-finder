// One-off: divisions and full regular-season schedule
const L = '1312072052827521024', S = 'https://api.sleeper.app/v1';
const get = async u => (await fetch(u)).json();
const [league, users, rosters] = await Promise.all([get(`${S}/league/${L}`), get(`${S}/league/${L}/users`), get(`${S}/league/${L}/rosters`)]);
const uById = new Map(users.map(u => [u.user_id, u]));
const name = rid => { const r = rosters.find(x => x.roster_id === rid); const u = uById.get(r.owner_id); return u?.metadata?.team_name || u?.display_name; };
console.log('division names:', JSON.stringify(Object.fromEntries(Object.entries(league.metadata || {}).filter(([k]) => /division/.test(k)))));
for (const r of rosters.sort((a, b) => (a.settings.division - b.settings.division) || (b.settings.wins - a.settings.wins)))
  console.log(`DIV ${r.settings.division} | ${name(r.roster_id)} | ${r.settings.wins}-${r.settings.losses} | PF ${r.settings.fpts}.${String(r.settings.fpts_decimal || 0).padStart(2, '0')}`);
const me = rosters.find(r => uById.get(r.owner_id)?.display_name === 'childsy14').roster_id;
const opp = {};
for (let w = 1; w <= 14; w++) {
  const ms = await get(`${S}/league/${L}/matchups/${w}`);
  const mine = ms.find(m => m.roster_id === me);
  const o = ms.find(m => m.matchup_id === mine.matchup_id && m.roster_id !== me);
  const res = mine.points || o?.points ? `${mine.points}-${o?.points}` : 'to play';
  console.log(`W${w}: vs ${name(o?.roster_id)} (${res})`);
  opp[name(o?.roster_id)] = (opp[name(o?.roster_id)] || 0) + 1;
}
console.log('COUNTS', JSON.stringify(opp));
