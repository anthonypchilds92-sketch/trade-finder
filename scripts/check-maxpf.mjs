// One-off: compare max PF calculation variants against the league's official weekly numbers
const L = '1312072052827521024', S = 'https://api.sleeper.app/v1';
const get = async u => (await fetch(u)).json();
const official = {
  Anthony: [157.98,100.7,138.38,125.52,113.92,125.74,150.38,176.52], Nitharsan: [137.2,146.3,145.62,181.78,117.32,112.18,151.06,119.56],
  Chris: [165.62,177.02,130.96,185,177.14,123.9,129.22,103.06], 'Joe A': [181.94,147.96,157.28,124.56,204.06,161.78,123.32,156.14],
  'Joe D': [180.68,139.16,169.04,203.38,175.88,148.98,151.68,127.94], Oli: [184.26,130.88,178.3,147.18,180.52,148.16,200.24,172.32],
  Matt: [159,171.38,165.06,193.86,184.4,144.72,185.52,191.04], Aidan: [170.5,189.2,201.8,160.24,175.5,173.92,172,187.72],
  Dan: [170.06,198.92,228.36,202.38,186.26,181.16,157.7,146.66], Amogh: [237,172.76,186.92,217.26,202.24,117.42,157.48,188.56],
};
const [league, users, rosters, players] = await Promise.all([get(`${S}/league/${L}`), get(`${S}/league/${L}/users`), get(`${S}/league/${L}/rosters`), get(`${S}/players/nfl`)]);
const slots = league.roster_positions.filter(s => s !== 'BN');
console.log('slots', slots.join(','), '| leg', league.settings.leg);
const FLEX = { FLEX: ['RB', 'WR', 'TE'], SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'], REC_FLEX: ['WR', 'TE'], WRRB_FLEX: ['RB', 'WR'] };
// Exact optimum via small search: assign dedicated slots greedily per position is optimal for this structure
function best(pool) {
  const byPos = p => pool.filter(x => (players[x.id]?.fantasy_positions || [players[x.id]?.position]).includes(p)).sort((a, b) => b.pts - a.pts);
  const used = new Set(); let tot = 0;
  for (const s of slots.filter(s => !FLEX[s])) { const c = byPos(s).find(x => !used.has(x.id)); if (c) { used.add(c.id); tot += c.pts; } }
  for (const s of slots.filter(s => FLEX[s])) {
    const c = pool.filter(x => !used.has(x.id) && FLEX[s].some(p => (players[x.id]?.fantasy_positions || [players[x.id]?.position]).includes(p))).sort((a, b) => b.pts - a.pts)[0];
    if (c) { used.add(c.id); tot += c.pts; }
  }
  return tot;
}
const uById = new Map(users.map(u => [u.user_id, u]));
const rInfo = new Map(rosters.map(r => [r.roster_id, { name: uById.get(r.owner_id)?.display_name, team: uById.get(r.owner_id)?.metadata?.team_name, taxi: new Set(r.taxi || []), reserve: new Set(r.reserve || []), ppts: (r.settings.ppts || 0) + (r.settings.ppts_decimal || 0) / 100 }]));
console.log('rosters:', [...rInfo.entries()].map(([id, r]) => `${id}=${r.name}/${r.team} taxi:${r.taxi.size} ir:${r.reserve.size} sleeperMaxPF:${r.ppts}`).join(' | '));
const weeks = [1, 2, 3, 4, 5, 6, 7, 8];
const res = {};
for (const w of weeks) {
  const ms = await get(`${S}/league/${L}/matchups/${w}`);
  if (w === 1) console.log('matchup keys:', Object.keys(ms[0]).join(','));
  for (const m of ms) {
    const ri = rInfo.get(m.roster_id);
    const pts = m.players_points || {};
    const all = (m.players || []).map(id => ({ id, pts: pts[id] || 0 }));
    const v = {
      matchupPlayers: best(all),
      minusTaxiNow: best(all.filter(x => !ri.taxi.has(x.id))),
      minusTaxiAndIR: best(all.filter(x => !ri.taxi.has(x.id) && !ri.reserve.has(x.id))),
      minusIRNow: best(all.filter(x => !ri.reserve.has(x.id))),
    };
    (res[m.roster_id] ??= []).push({ w, ...v, nPlayers: all.length, starterPts: m.points });
  }
}
// compare with official, matching rosters to the official names by best fit
const names = Object.keys(official);
for (const [rid, rows] of Object.entries(res)) {
  const ri = rInfo.get(+rid);
  let bestName = null, bestErr = 1e9;
  for (const n of names) { const e = rows.reduce((s, r, i) => s + Math.abs(r.minusTaxiNow - official[n][i]), 0); if (e < bestErr) { bestErr = e; bestName = n; } }
  console.log(`\n${ri.name} (${ri.team}) ~ ${bestName}  players/week: ${rows.map(r => r.nPlayers).join(',')}`);
  for (const k of ['matchupPlayers', 'minusTaxiNow', 'minusTaxiAndIR', 'minusIRNow']) {
    const diffs = rows.map((r, i) => (r[k] - official[bestName][i]).toFixed(1));
    console.log(`  ${k.padEnd(15)} total ${rows.reduce((s, r) => s + r[k], 0).toFixed(1)} vs ${official[bestName].reduce((a, b) => a + b, 0).toFixed(1)} | diffs ${diffs.join(' ')}`);
  }
}
