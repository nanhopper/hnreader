import { readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
const grab = name => {
  const start = html.indexOf(`    function ${name}(`);
  return html.slice(start, html.indexOf('\n    }\n', start) + 7);
};
const constants = html.slice(html.indexOf('const EMBER_DEFAULTS'), html.indexOf('const state ='));
const { EMBER_DEFAULTS, EMBER_LIMITS, EMBER_SLIDERS, emberToSlider, sliderToEmber } = new Function(
  `${constants}\n${grab('emberToSlider')}\n${grab('sliderToEmber')}\n`
  + 'return { EMBER_DEFAULTS, EMBER_LIMITS, EMBER_SLIDERS, emberToSlider, sliderToEmber };'
)();

const failures = [];

// Every default must survive a round trip, or opening the panel would silently
// retune the score the moment anything called sync.
for (const [key, value] of Object.entries(EMBER_DEFAULTS)) {
  const back = sliderToEmber(key, emberToSlider(key, value));
  if (back !== value) failures.push(`${key}: default ${value} round-trips to ${back}`);
}

// Slider ends must reach the declared limits exactly.
for (const [key, [min, max]] of Object.entries(EMBER_LIMITS)) {
  const low = sliderToEmber(key, 0);
  const high = sliderToEmber(key, 1000);
  if (low !== min) failures.push(`${key}: position 0 gives ${low}, expected ${min}`);
  if (high !== max) failures.push(`${key}: position 1000 gives ${high}, expected ${max}`);
}

// Monotonic and in range across the whole track.
for (const key of Object.keys(EMBER_SLIDERS)) {
  const [min, max] = EMBER_LIMITS[key];
  let previous = -Infinity;
  for (let position = 0; position <= 1000; position += 1) {
    const value = sliderToEmber(key, position);
    if (!Number.isFinite(value)) { failures.push(`${key}: non-finite at ${position}`); break; }
    if (value < min || value > max) { failures.push(`${key}: ${value} out of [${min}, ${max}] at ${position}`); break; }
    if (value < previous) { failures.push(`${key}: decreased at ${position}`); break; }
    previous = value;
  }
}

// Out-of-range input must clamp rather than escape the limits.
for (const [key, [min, max]] of Object.entries(EMBER_LIMITS)) {
  if (emberToSlider(key, -999) !== 0) failures.push(`${key}: below-min did not clamp to 0`);
  if (emberToSlider(key, 1e9) !== 1000) failures.push(`${key}: above-max did not clamp to 1000`);
  if (sliderToEmber(key, -50) !== min) failures.push(`${key}: negative position did not clamp`);
  if (sliderToEmber(key, 5000) !== max) failures.push(`${key}: overlarge position did not clamp`);
}

// The log scale exists so defaults are not stranded at the far left.
const endorsement = emberToSlider('endorsement', EMBER_DEFAULTS.endorsement) / 10;
console.log(`emberEndorsement default sits at ${endorsement.toFixed(1)}% of the track`);
if (endorsement < 15 || endorsement > 85) failures.push(`endorsement default at ${endorsement}% is unreachable in practice`);

console.log(failures.length ? `FAIL:\n- ${failures.join('\n- ')}` : 'PASS: slider mapping is exact, clamped and monotonic');
process.exit(failures.length ? 1 : 0);
