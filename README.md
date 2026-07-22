# HN Reader — Comments First

A lightweight, single-page Hacker News digest that surfaces the most-discussed threads first. No server, no build step — just a plain HTML file that queries the public [HN Algolia API](https://hn.algolia.com/api).

## Why "Comments First"?

The default HN front page ranks stories by a points/time decay formula. This app lets you flip that perspective: filter by a timeframe, set a minimum comment threshold, and sort by **most commented**, **most points**, or **most recent** — so you never miss a heated discussion.

## Features

- 🔎 Query top-commented HN stories over 24 h / 3 d / 7 d / 30 d windows
- ⚙️ Adjustable minimum-comment threshold (default 100)
- 🔗 Headline opens the **HN discussion** directly; a domain chip links to the original article
- ✅ Read stories are tracked in `localStorage` and visually dimmed
- 🌑 Dark-mode, mobile-first UI — zero external dependencies

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
