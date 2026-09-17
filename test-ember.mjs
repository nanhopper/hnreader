import { readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
const grab = name => {
  const start = html.indexOf(`    function ${name}(`);
  const end = html.indexOf('\n    }\n', start) + '\n    }\n'.length;
  if (start < 0 || end < start) throw new Error(`could not extract ${name}`);
  return html.slice(start, end);
};
const constants = html.slice(html.indexOf('const EMBER_DEFAULTS'), html.indexOf('const state ='));

const { emberScore, EMBER_DEFAULTS } = new Function(
  `${constants}\n${grab('emberScore')}\nreturn { emberScore, EMBER_DEFAULTS };`
)();

const now = Math.floor(Date.now() / 1000);
const story = (label, points, num_comments, ageHours) => ({
  label, points, num_comments, created_at_i: now - ageHours * 3600, ageHours
});

const cases = [
  story('Deep essay, quiet approval', 600, 180, 20),
  story('Fresh breakout', 180, 60, 4),
  story('Flamewar', 300, 900, 20),
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
  'Fresh breakout',
  'Flamewar',
  'Dull but upvoted',
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
console.log({ morePoints, younger, flameHurts, finite });
process.exit(ok && morePoints && younger && flameHurts && finite ? 0 : 1);
