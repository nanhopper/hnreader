import { readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
const grab = name => {
  const start = html.indexOf(`    function ${name}(`);
  return html.slice(start, html.indexOf('\n    }\n', start) + 7);
};
const constants = html.slice(html.indexOf('const EMBER_DEFAULTS'), html.indexOf('const state ='));
const { emberScore, EMBER_DEFAULTS, MIN_POINTS_BY_TIMEFRAME, DEFAULT_MIN_POINTS } = new Function(
  `${constants}\n${grab('emberScore')}\nreturn { emberScore, EMBER_DEFAULTS, MIN_POINTS_BY_TIMEFRAME, DEFAULT_MIN_POINTS };`
)();

const MAX_API_PAGES = 10;
const API_HITS_PER_PAGE = 100;
const HIT_CAP = MAX_API_PAGES * API_HITS_PER_PAGE;
const now = Math.floor(Date.now() / 1000);
const timeframes = { '24h': 86400, '3d': 259200, '7d': 604800, '30d': 2592000 };
const floors = [0, 7.5, 8.5, 9, 9.5];

// Mirrors fetchStories: same prefilter, same recent band, same paging, same scoring.
const RECENT_BAND_SECONDS = 86400;

function windowQueries(timeframe) {
  const minPoints = MIN_POINTS_BY_TIMEFRAME[timeframe] ?? DEFAULT_MIN_POINTS;
  const queries = [{ since: now - timeframe, minPoints }];
  const bandMinPoints = MIN_POINTS_BY_TIMEFRAME[RECENT_BAND_SECONDS];
  if (timeframe > RECENT_BAND_SECONDS && minPoints > bandMinPoints) {
    queries.push({ since: now - RECENT_BAND_SECONDS, minPoints: bandMinPoints });
  }
  return queries;
}

async function fetchWindow({ since, minPoints }) {
  const numericFilters = encodeURIComponent(`created_at_i>${since},points>=${minPoints}`);
  const base = `https://hn.algolia.com/api/v1/search_by_date?tags=story&numericFilters=${numericFilters}&hitsPerPage=${API_HITS_PER_PAGE}`;
  const first = await (await fetch(`${base}&page=0`)).json();
  const pageCount = Math.min(Number(first.nbPages || 1), MAX_API_PAGES);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pageCount - 1) }, (_, i) => fetch(`${base}&page=${i + 1}`).then(r => r.json()))
  );
  return {
    minPoints,
    nbHits: Number(first.nbHits || 0),
    truncated: Number(first.nbHits || 0) > HIT_CAP,
    hits: [first, ...rest].flatMap(p => p.hits ?? [])
  };
}

async function load(timeframe) {
  const results = await Promise.all(windowQueries(timeframe).map(fetchWindow));
  const hits = results.flatMap(r => r.hits);
  const unique = [...new Map(hits.map(h => [String(h.objectID), h])).values()];
  return {
    minPoints: results.map(r => r.minPoints).join(' + '),
    nbHits: results.map(r => r.nbHits).join(' + '),
    truncated: results.some(r => r.truncated),
    scored: unique.map(s => ({ ...s, ember: emberScore(s, now, EMBER_DEFAULTS) }))
  };
}

const rows = [];
let failures = [];
for (const [label, timeframe] of Object.entries(timeframes)) {
  const { minPoints, nbHits, truncated, scored } = await load(timeframe);
  const row = { window: label, 'points>=': minPoints, nbHits, truncated: truncated ? 'YES' : 'no' };
  for (const floor of floors) row[floor === 0 ? 'Any' : `${floor}+`] = scored.filter(s => s.ember >= floor).length;
  row['flagged (>=9.5)'] = scored.filter(s => s.ember >= EMBER_DEFAULTS.bar).length;
  rows.push(row);
  if (truncated) failures.push(`${label} window truncated at the 1,000-hit cap (nbHits=${nbHits})`);
}
console.log(`Stories surviving each Ember floor. Badge bar = ${EMBER_DEFAULTS.bar}.\n`);
console.table(rows);

const daily = rows.find(r => r.window === '24h');
if (daily['flagged (>=9.5)'] > 8) failures.push(`24h flags ${daily['flagged (>=9.5)']} stories; the bar is too loose`);
if (daily['9.5+'] === 0 && daily['9+'] === 0) failures.push('24h yields nothing at the strict floors');

console.log(failures.length ? `\nFAIL:\n- ${failures.join('\n- ')}` : '\nPASS: every window stays under the API cap and the ladder degrades sensibly');
process.exit(failures.length ? 1 : 0);
