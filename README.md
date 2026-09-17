# HN Reader — The conversations worth catching

A lightweight, single-page Hacker News digest that surfaces the few threads worth your time. No server, no build step — just a plain HTML file that queries the public [HN Algolia API](https://hn.algolia.com/api).

## Why not just read the front page?

The HN front page ranks stories by a points/time decay formula, and raw sorts have their own blind spots: points alone miss the thread worth reading, comments alone reward flamewars, and both systematically hide anything posted in the last few hours. This app lets you filter by timeframe and by an absolute quality floor, then rank by **Ember**, **most commented**, **most points**, or **most recent**.

## Features

- 💎 **Ember** — an absolute score that ranks the few stories you shouldn't miss today
- 🔎 Find and rank HN stories over 24 h / 3 d / 7 d / 30 d windows
- ⏱️ Trim the list to the time you actually have with a minimum-Ember threshold
- 🔗 Open the original submission from its headline or jump straight to the HN comments
- ✅ Track read stories locally, with controls to mark them read or unread
- 🔖 Persist filters and reflect them in the URL for bookmarkable, shareable views
- 🌓 Responsive light and dark themes — zero external dependencies

## The Ember score

Points measure approval, comments measure talkability, and neither alone tells you what to read. Ember combines them, then corrects for the two ways raw counts mislead you.

```math
\text{Ember} = \underbrace{\ln(\hat{P}+1) + \tfrac{1}{2}\ln(\hat{C}+1)}_{\text{magnitude}} - \underbrace{w \cdot d(P) \cdot \max\left(0, \ln\tfrac{r}{h}\right)}_{\text{heat penalty}} - \underbrace{\tfrac{1}{4}\max\left(0, \ln\tfrac{a}{24}\right)}_{\text{staleness}}
```

where $a$ is the story's age in hours, $r = (C+1)/(P+1)$ is the comment-to-point ratio, and $\hat{P}, \hat{C}$ are the point and comment counts projected forward by the share of the accumulation curve already elapsed:

```math
\hat{P} = P / f(a), \quad \hat{C} = C / f(a), \quad f(a) = \max\left(1 - e^{-a/m},\ 0.2\right)
```

and $d(P)$ damps the heat penalty by how much endorsement the story actually collected:

```math
d(P) = \max\left(\frac{E}{E + P},\ 0.4\right)
```

Three corrections are doing the work:

- **Maturity projection.** Votes and comments accrue on a saturating curve, so a 3-hour-old story is a censored sample and can never win a raw-count sort. Dividing by $f(a)$ estimates where it will land, which surfaces breakouts hours earlier and makes everything in the window comparable. Capped at 5× so nothing brand new explodes.
- **Heat penalty.** Comments add value sublinearly up to a point; past it, a high ratio means an argument or a re-litigated topic rather than depth. Below the threshold the net exponent on $r$ is $+0.5$; above it the penalty takes over, so the response is an inverted-U rather than a straight reward.
- **Endorsement damping.** A high ratio only means *pile-on* while few people have endorsed the story. Once many have, the same ratio describes a widely approved but divisive piece — which is signal, not noise. $d(P)$ therefore shrinks the penalty as points accumulate: the net exponent on $r$ above the threshold runs from $-1.0$ for a story almost nobody upvoted to $-0.1$ for one that many did.

The $0.4$ floor on $d(P)$ is load-bearing. The magnitude term already contributes $+\tfrac{1}{2}$ per log-unit of comments, so an undamped $E/(E+P)$ drops the penalty slope below that above roughly 300 points — at which point extra comments start *helping* again and the inverted-U collapses into exactly the flamewar-rewards-you behaviour Ember exists to prevent. The floor keeps $w \cdot d(P) > \tfrac{1}{2}$ at every point level. `test-ember.mjs` guards this directly.

The scale is **absolute and logarithmic**: a score means the same thing in every timeframe, and every $+1$ is roughly $2.7\times$ the reception. Typical values run from 4 to 11. Stories at or above `emberBar` are badged **don't miss** — an absolute threshold, not a top-N, so on a dull day it correctly returns nothing.

### Choosing a threshold

The **Minimum Ember** control is the volume knob: pick the floor that matches the time you have. Measured against a live 24-hour window:

| Floor | Stories | Reading session |
|---|---|---|
| Any | ~190 | Browsing |
| 7.5+ | ~22 | A coffee |
| 8.5+ | ~10 | Ten minutes |
| 9+ | ~7 | Five minutes |
| 9.5+ | ~2 | The ones you'd regret missing |

### Tuning

The five constants are experiments, not settled truth. Override any of them with a URL parameter; values persist locally and are written back to the URL so a tuned setup stays bookmarkable.

| Parameter | Symbol | Default | Effect |
|---|---|---|---|
| `emberHeat` | $h$ | `1.2` | Ratio at which comments start counting against a story. Lower is stricter about flamewars. |
| `emberWeight` | $w$ | `1.5` | How hard the heat penalty bites. `0` disables it. |
| `emberMaturity` | $m$ | `6` | Accumulation-curve time constant in hours. Higher projects young stories further forward, favouring fresh ones more aggressively. |
| `emberEndorsement` | $E$ | `150` | Points at which half the heat penalty is forgiven. Higher keeps punishing divisive stories that many people upvoted. |
| `emberBar` | — | `9.5` | Score needed for the **don't miss** badge. |

```
index.html?sort=ember&timeframe=86400&minEmber=9&emberHeat=0.9
```

### A note on the API prefilter

The Algolia endpoint returns at most 1,000 hits, newest first, so an unfiltered 30-day query would silently discard everything older than its first thousand results. Each timeframe therefore carries a minimum-points prefilter (24 h → 5, 3 d → 10, 7 d → 20, 30 d → 200) chosen to keep the window under that cap.

A high floor would otherwise hide fresh stories that the maturity projection already rates highly — a six-hour-old story on 199 points and 239 comments scores 8.72, clearing the default floor, yet sits below the 30-day prefilter. Any window whose floor exceeds the 24-hour floor therefore issues a second query covering the last 24 hours at the lower floor, and the two result sets are merged and deduplicated before scoring.

Stories that are both old and below their window's floor are still not retrieved; the cap makes some floor unavoidable. If a window ever does exceed 1,000 matches, the status bar says `first 1,000 matches` rather than failing silently.

### Tests

```bash
node test-ember.mjs       # deterministic: scoring behaves as designed
node test-thresholds.mjs  # live: windows stay under the API cap, floors stay useful
```

## Running Locally

Open `index.html` directly in any modern browser:

```bash
# macOS
open index.html

# Linux
xdg-open index.html
```

No build step or local server required. The Algolia API is public and requires no API key.

## Deploying to GitHub Pages

1. Push this repository to GitHub.
2. Go to **Settings → Pages**.
3. Under **Source**, select **GitHub Actions**.
4. Push any commit to `main` — the workflow in `.github/workflows/deploy.yml` will build and publish the site automatically.
5. Your site will be live at `https://<username>.github.io/<repo>/`.

## License

MIT
