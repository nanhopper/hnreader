import { readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
const grab = name => {
  const start = html.indexOf(`    function ${name}(`);
  const end = html.indexOf('\n    }\n', start) + '\n    }\n'.length;
  if (start < 0 || end < start) throw new Error(`could not extract ${name}`);
  return html.slice(start, end);
};
const constants = html.slice(html.indexOf('const EMBER_DEFAULTS'), html.indexOf('const state ='));

const {
  emberScore,
  buildMissExport,
  EMBER_DEFAULTS,
  EMBER_LIMITS
} = new Function(
  `${constants}\n${grab('emberScore')}\n${grab('buildMissExport')}\n`
  + 'return { emberScore, buildMissExport, EMBER_DEFAULTS, EMBER_LIMITS };'
)();

const now = Math.floor(Date.now() / 1000);
const story = (label, points, num_comments, ageHours) => ({
  label, title: label, points, num_comments, created_at_i: now - ageHours * 3600, ageHours
});

const cases = [
  story('Deep essay, quiet approval', 600, 180, 20),
  story('Fresh breakout', 180, 60, 4),
  story('Divisive but endorsed', 300, 900, 20),
  story('Pile-on, little approval', 60, 500, 20),
  story('Dull but upvoted', 120, 30, 22),
  story('Genuine megathread', 1500, 1200, 20),
  story('Brand new, no traction', 5, 1, 0.2)
];

const scored = cases
  .map(s => ({ ...s, ember: emberScore(s, now, EMBER_DEFAULTS) }))
  .sort((a, b) => b.ember - a.ember);

console.table(scored.map(s => ({
  story: s.label,
  points: s.points,
  comments: s.num_comments,
  age: `${s.ageHours}h`,
  ratio: ((s.num_comments + 1) / (s.points + 1)).toFixed(2),
  ember: s.ember.toFixed(2),
  flagged: s.ember >= EMBER_DEFAULTS.bar ? 'DON\'T MISS' : ''
})));

const order = scored.map(s => s.label);
const expected = [
  'Genuine megathread',
  'Deep essay, quiet approval',
  'Divisive but endorsed',
  'Fresh breakout',
  'Dull but upvoted',
  'Pile-on, little approval',
  'Brand new, no traction'
];
const ok = order.every((label, index) => label === expected[index]);
console.log(ok ? '\nPASS: ranking matches the designed ordering' : `\nFAIL: got ${order.join(' > ')}`);

// Monotonicity / sanity checks.
const base = story('base', 400, 160, 18);
const morePoints = emberScore({ ...base, points: 500 }, now, EMBER_DEFAULTS) > emberScore(base, now, EMBER_DEFAULTS);
const younger = emberScore({ ...base, created_at_i: now - 5 * 3600 }, now, EMBER_DEFAULTS) > emberScore(base, now, EMBER_DEFAULTS);
const flameHurts = emberScore({ ...base, num_comments: 2000 }, now, EMBER_DEFAULTS) < emberScore({ ...base, num_comments: 480 }, now, EMBER_DEFAULTS);
const finite = Number.isFinite(emberScore({ points: 0, num_comments: 0, created_at_i: now }, now, EMBER_DEFAULTS));

// Endorsement damping: at the same ratio, a story many people upvoted should
// keep less of the heat penalty than one almost nobody did.
const penaltyOf = (points, num_comments) => {
  const s = { points, num_comments, created_at_i: now - 20 * 3600 };
  return emberScore(s, now, { ...EMBER_DEFAULTS, weight: 0 }) - emberScore(s, now, EMBER_DEFAULTS);
};
const endorsementForgives = penaltyOf(600, 1800) < penaltyOf(60, 180);

// Regression guard: the inverted-U must survive at every point level. Plain
// E/(E+P) damping breaks this above ~300 points, where the magnitude term
// outruns the shrinking penalty and extra comments start helping again.
const uShapeHolds = [50, 200, 400, 800, 2000, 5000].every(points => {
  const at = num_comments => emberScore({ points, num_comments, created_at_i: now - 20 * 3600 }, now, EMBER_DEFAULTS);
  return at(points * 6) < at(points * 2);
});

// Every selectable weight must preserve the post-threshold decline, not just
// the default. This guards the relationship between the weight and damping
// floors that makes the inverted-U hold for highly endorsed stories.
const allowedWeightsHold = [EMBER_LIMITS.weight[0], EMBER_DEFAULTS.weight, EMBER_LIMITS.weight[1]]
  .every(weight => [50, 200, 400, 800, 2000, 5000].every(points => {
    const config = { ...EMBER_DEFAULTS, weight };
    const at = num_comments => emberScore({ points, num_comments, created_at_i: now - 20 * 3600 }, now, config);
    return at(points * 6) < at(points * 2);
  }));

// Ask HN is intentionally participatory. It gets a higher expected discussion
// baseline, while sufficiently extreme ratios must still lower its score.
const askBase = { title: 'Ask HN: What are you working on?', points: 372, num_comments: 1179, created_at_i: now - 87 * 3600 };
const genericBase = { ...askBase, title: 'A regular submission' };
const askScore = emberScore(askBase, now, EMBER_DEFAULTS);
const genericScore = emberScore(genericBase, now, EMBER_DEFAULTS);
const askGetsParticipatoryBaseline = askScore > genericScore;
const askClearsReadingFloor = askScore >= 8.5 && genericScore < 8.5;
const askHeatStillBites = emberScore({ ...askBase, num_comments: askBase.points * 8 }, now, EMBER_DEFAULTS)
  < emberScore({ ...askBase, num_comments: askBase.points * 3 }, now, EMBER_DEFAULTS);

const missExport = buildMissExport({
  version: 1,
  misses: {
    42: { objectID: '42', title: 'A missed story', ember: 8.4 }
  }
}, now, EMBER_DEFAULTS);
const missExportWorks = missExport.schema_version === 1
  && missExport.objective === 'threads a reader would regret missing'
  && missExport.exported_at === now
  && missExport.misses.length === 1
  && missExport.misses[0].objectID === '42'
  && missExport.active_config.heat === EMBER_DEFAULTS.heat;

console.log({
  morePoints,
  younger,
  flameHurts,
  finite,
  endorsementForgives,
  uShapeHolds,
  allowedWeightsHold,
  askGetsParticipatoryBaseline,
  askClearsReadingFloor,
  askHeatStillBites,
  missExportWorks
});
process.exit(ok
  && morePoints
  && younger
  && flameHurts
  && finite
  && endorsementForgives
  && uShapeHolds
  && allowedWeightsHold
  && askGetsParticipatoryBaseline
  && askClearsReadingFloor
  && askHeatStillBites
  && missExportWorks ? 0 : 1);
