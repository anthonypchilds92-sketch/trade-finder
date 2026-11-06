// One-off: find KTC's trade-calculator value-adjustment code
const UA = 'Mozilla/5.0 (personal dynasty trade-finder)';
const page = await (await fetch('https://keeptradecut.com/trade-calculator', { headers: { 'User-Agent': UA } })).text();
console.log('page length', page.length);
const srcs = [...page.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(m => m[1]).filter(s => !/googletag|google-analytics|gtag|ads|cloudflare|jquery|bootstrap/i.test(s));
console.log('scripts:', srcs.join('\n'));
const inline = [...page.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const bodies = [['inline', inline.join('\n')]];
for (const s of srcs) {
  const url = s.startsWith('http') ? s : new URL(s, 'https://keeptradecut.com').href;
  try { bodies.push([url, await (await fetch(url, { headers: { 'User-Agent': UA } })).text()]); } catch (e) { console.log('fail', url); }
}
for (const [name, body] of bodies) {
  for (const key of ['adjust', 'Adjust', 'valueAdj', 'raw', 'Math.pow', '**']) {
    let i = 0, n = 0;
    while ((i = body.indexOf(key, i)) !== -1 && n < 6) {
      const ctx = body.slice(Math.max(0, i - 300), i + 500).replace(/\s+/g, ' ');
      if (/adjust/i.test(ctx) || key === 'Math.pow') { console.log(`\n=== ${name} [${key}] @${i}\n${ctx}`); n++; }
      i += key.length;
    }
  }
}
