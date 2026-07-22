# HN Reader — Comments First

A lightweight, single-page Hacker News digest that surfaces the most-discussed threads first. No server, no build step — just a plain HTML file that queries the public [HN Algolia API](https://hn.algolia.com/api).

## Why "Comments First"?

The default HN front page ranks stories by a points/time decay formula. This app lets you flip that perspective: filter by a timeframe, set a minimum comment threshold, and sort by **most commented**, **most points**, or **most recent** — so you never miss a heated discussion.

## Features

- 🔎 Find and rank HN stories over 24 h / 3 d / 7 d / 30 d windows
- ⚙️ Filter by discussion size and sort by comments, points, or recency
- 🔗 Open the original article from its headline or jump directly to the HN discussion
- ✅ Track read stories locally, with controls to mark them read or unread
- 🔖 Persist filters and reflect them in the URL for bookmarkable, shareable views
- 🌓 Responsive light and dark themes — zero external dependencies

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
