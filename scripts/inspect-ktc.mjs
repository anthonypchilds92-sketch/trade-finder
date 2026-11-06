// One-off: print KTC's trade-calculator value-adjustment functions
const UA = 'Mozilla/5.0 (personal dynasty trade-finder)';
const page = await (await fetch('https://keeptradecut.com/trade-calculator', { headers: { 'User-Agent': UA } })).text();
const src = (page.match(/<script[^>]+src=["']([^"']*site\.min\.js[^"']*)["']/) || [])[1];
const body = await (await fetch(new URL(src, 'https://keeptradecut.com').href, { headers: { 'User-Agent': UA } })).text();
const show = (label, start, len) => console.log(`\n##### ${label}\n` + body.slice(start, start + len));
for (const name of ['processVNew', 'reverseAdjustNew', 'checkEquality']) {
  const re = new RegExp(`(function\\s+${name}\\s*\\(|${name}\\s*=\\s*function|${name}\\s*=\\s*\\()`);
  const m = body.match(re);
  if (m) show(name, m.index, 1400); else console.log('not found:', name);
}
// The block that computes the adjustment (from the loop over team one's players to the end of the branch)
const k = body.indexOf('teamOne.rawAdj=');
show('calc block', Math.max(0, k - 1600), 4200);
