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
const commentThresholds = [100, 200, 500, 1000];
const AUDIT_EMBER_FLOOR = 8.5;

// Mirrors fetchStories: same prefilter, same recent band, same paging, same scoring.
const RECENT_BAND_SECONDS = 86400;

function windowQueries(filters) {
  const { timeframe } = filters;
  const minPoints = MIN_POINTS_BY_TIMEFRAME[timeframe] ?? DEFAULT_MIN_POINTS;
  const queries = [{ since: now - timeframe, minPoints }];
  const bandMinPoints = MIN_POINTS_BY_TIMEFRAME[RECENT_BAND_SECONDS];
  if (timeframe > RECENT_BAND_SECONDS && minPoints > bandMinPoints) {
    queries.push({ since: now - RECENT_BAND_SECONDS, minPoints: bandMinPoints });
  }
  if (filters.mode === 'comments' && filters.minComments > 0) {
    queries.push({ since: now - timeframe, minComments: filters.minComments });
  }
  return queries;
}

async function fetchWindow(query) {
  const bound = query.minComments === undefined
    ? `points>=${query.minPoints}`
    : `num_comments>=${query.minComments}`;
  const numericFilters = encodeURIComponent(`created_at_i>${query.since},${bound}`);
  const base = `https://hn.algolia.com/api/v1/search_by_date?tags=story&numericFilters=${numericFilters}&hitsPerPage=${API_HITS_PER_PAGE}`;
  const first = await (await fetch(`${base}&page=0`)).json();
  const pageCount = Math.min(Number(first.nbPages || 1), MAX_API_PAGES);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pageCount - 1) }, (_, i) => fetch(`${base}&page=${i + 1}`).then(r => r.json()))
  );
  return {
    bound,
    minPoints: query.minPoints,
    nbHits: Number(first.nbHits || 0),
    truncated: Number(first.nbHits || 0) > HIT_CAP,
    hits: [first, ...rest].flatMap(p => p.hits ?? [])
  };
}

async function load(timeframe) {
  const results = await Promise.all(windowQueries({ timeframe, mode: 'ember' }).map(fetchWindow));
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

// Comments mode adds a num_comments>= query, which is a separate cap risk:
// it is not bounded by points, so a wide window could exceed 1,000 hits.
// This also reports the audit workload -- how many extra stories the user
// would skim in comments mode, and how many of those Ember would have hidden.
const auditRows = [];
for (const [label, timeframe] of Object.entries(timeframes)) {
  for (const minComments of commentThresholds) {
    const queries = windowQueries({ timeframe, mode: 'comments', minComments });
    const results = await Promise.all(queries.map(fetchWindow));
    const commentQuery = results.find(r => r.bound.startsWith('num_comments'));
    const unique = [...new Map(results.flatMap(r => r.hits).map(h => [String(h.objectID), h])).values()];
    const scored = unique
      .filter(s => Number(s.num_comments || 0) >= minComments)
      .map(s => ({ ...s, ember: emberScore(s, now, EMBER_DEFAULTS) }));
    const hidden = scored.filter(s => s.ember < AUDIT_EMBER_FLOOR).length;
    auditRows.push({
      window: label,
      'comments>=': minComments,
      nbHits: commentQuery.nbHits,
      shown: scored.length,
      [`Ember <${AUDIT_EMBER_FLOOR}`]: hidden,
      truncated: commentQuery.truncated ? 'YES' : 'no'
    });
    if (commentQuery.truncated) {
      failures.push(`comments mode ${label}/${minComments}+ truncated at the cap (nbHits=${commentQuery.nbHits})`);
    }
  }
}
console.log(`\nComments mode. "Ember <${AUDIT_EMBER_FLOOR}" is the audit set: what Ember would have hidden.\n`);
console.table(auditRows);

const daily = rows.find(r => r.window === '24h');
if (daily['flagged (>=9.5)'] > 8) failures.push(`24h flags ${daily['flagged (>=9.5)']} stories; the bar is too loose`);
if (daily['9.5+'] === 0 && daily['9+'] === 0) failures.push('24h yields nothing at the strict floors');

console.log(failures.length ? `\nFAIL:\n- ${failures.join('\n- ')}` : '\nPASS: every window stays under the API cap and the ladder degrades sensibly');
process.exit(failures.length ? 1 : 0);
