// Reads recent fantasy-football articles from public RSS feeds and finds players the authors are
// tipping to rise (buy / stash / breakout / sleeper ...) or fall (sell / fade / bust ...).
// Only headlines and links are saved for display; article text is used just to count mentions.
import { writeFile } from 'node:fs/promises';

const FEEDS = [
  ['Dynasty League Football', 'https://dynastyleaguefootball.com/feed/'],
  ['Dynasty Nerds', 'https://www.dynastynerds.com/feed/'],
  ['The Fantasy Footballers', 'https://www.thefantasyfootballers.com/feed/'],
  ['RotoBaller', 'https://www.rotoballer.com/category/nfl/feed'],
  ['FantasyPros', 'https://www.fantasypros.com/nfl/feed/'],
  ['Fantasy Life', 'https://www.fantasylife.com/feed'],
  ['Razzball', 'https://football.razzball.com/feed'],
  ['PFF', 'https://www.pff.com/feed'],
  ['Dynasty Pros', 'https://www.dynastypros.net/feed/'],
  ['Footballguys', 'https://www.footballguys.com/rss/articles'],
];
const DAYS = 10;
const UA = 'Mozilla/5.0 (personal dynasty trade-finder; daily RSS read)';
const POS = /\b(buy(?:-low| low)?|buying|stash|sleepers?|breakouts?|break out|rising|risers?|on the rise|upside|target(?:ing)?|add(?:ing)?|pick ?up|waiver (?:add|target|wire)|league[- ]winner|value is (?:rising|climbing)|undervalued|bounce[- ]back|ascend|emerging|must[- ]add|smash)\b/i;
const NEG = /\b(sell(?:-high| high)?|selling|fade|fading|avoid|bust|busts|fallers?|falling|declin(?:e|ing)|overvalued|drop|cut|trap)\b/i;

const sleeper = await (await fetch('https://api.sleeper.app/v1/players/nfl')).json();
// Full-name index for fantasy-relevant players (avoid deep-roster name collisions)
const byName = new Map();
for (const [id, p] of Object.entries(sleeper)) {
  if (!p.active || !['QB', 'RB', 'WR', 'TE'].includes(p.position)) continue;
  if (p.search_rank != null && p.search_rank > 1200) continue;
  const name = (p.full_name || `${p.first_name} ${p.last_name}`).trim();
  if (name.split(' ').length < 2) continue;
  const key = name.toLowerCase().replace(/[.'’]/g, '');
  if (byName.has(key)) byName.set(key, null); else byName.set(key, { id, name, pos: p.position, team: p.team });
}

const strip = h => h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, "'").replace(/&#\d+;/g, ' ').replace(/\s+/g, ' ');
const tag = (xml, t) => { const m = xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`, 'i')); return m ? m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '').trim() : ''; };
const since = Date.now() - DAYS * 86400000;
const players = new Map();
const sources = [];

for (const [src, url] of FEEDS) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml' } });
    if (!res.ok) { sources.push({ src, ok: false, status: res.status }); continue; }
    const xml = await res.text();
    const items = xml.split(/<item[\s>]/i).slice(1);
    let used = 0;
    for (const it of items) {
      const title = strip(tag(it, 'title'));
      const link = strip(tag(it, 'link')) || (it.match(/<guid[^>]*>([^<]+)/) || [])[1] || '';
      const when = Date.parse(tag(it, 'pubDate') || tag(it, 'dc:date')) || Date.now();
      if (when < since) continue;
      const text = strip(`${tag(it, 'title')}. ${tag(it, 'description')} ${tag(it, 'content:encoded')}`);
      if (!/nfl|football|fantasy|dynasty|waiver|rookie|trade/i.test(title + text.slice(0, 2000))) continue;
      used++;
      const titleTone = POS.test(title) ? 1 : NEG.test(title) ? -1 : 0;
      for (const sentence of text.split(/(?<=[.!?])\s+/)) {
        const low = sentence.toLowerCase().replace(/[.'’]/g, '');
        const words = low.split(/[^a-z-]+/).filter(Boolean);
        const pos = POS.test(sentence), neg = NEG.test(sentence);
        if (!pos && !neg && !titleTone) continue;
        const found = new Set();
        for (let i = 0; i < words.length - 1; i++) {
          for (const n of [2, 3]) {
            const key = words.slice(i, i + n).join(' ');
            const hit = byName.get(key);
            if (hit) found.add(hit);
          }
        }
        for (const hit of found) {
          const e = players.get(hit.id) || { ...hit, up: 0, down: 0, sources: new Set(), articles: new Map() };
          const tone = pos && !neg ? 1 : neg && !pos ? -1 : titleTone;
          if (tone > 0) e.up++; else if (tone < 0) e.down++; else continue;
          e.sources.add(src);
          if (!e.articles.has(link) && e.articles.size < 4) e.articles.set(link, { title, url: link, src, date: new Date(when).toISOString().slice(0, 10), tone });
          players.set(hit.id, e);
        }
      }
    }
    sources.push({ src, ok: true, articles: used });
  } catch (e) { sources.push({ src, ok: false, error: e.message }); }
}

const list = [...players.values()].map(e => ({
  id: e.id, name: e.name, pos: e.pos, team: e.team, up: e.up, down: e.down,
  sources: [...e.sources], score: (e.up - e.down) * Math.sqrt(e.sources.size), articles: [...e.articles.values()],
})).filter(e => e.up + e.down >= 2).sort((a, b) => b.score - a.score);
await writeFile('data/experts.json', JSON.stringify({ generatedAt: new Date().toISOString(), days: DAYS, sources, players: list.slice(0, 150) }));
console.log('Sources:', sources.map(s => `${s.src}: ${s.ok ? s.articles + ' articles' : 'failed ' + (s.status || s.error)}`).join(' | '));
console.log('Top tipped:', list.slice(0, 15).map(p => `${p.name} (+${p.up}/-${p.down}, ${p.sources.length} src)`).join(', '));
