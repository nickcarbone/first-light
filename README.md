# First Light

Follow the sunrise around the world. A big globe shows the line where the sun is coming up; a card shows one place on that line — a webcam if one is nearby, and the sound of that morning:

1. **Live microphone** — an open mic from [Locustream](https://locusonus.org/soundmap/) (Locus Sonus) that is at dawn right now
2. **Field recording** — a geotagged dawn or outdoor recording from [Freesound](https://freesound.org/) near that place, matched to the local season where tags allow
3. **Local radio** — a station from [Radio Browser](https://www.radio-browser.info/) near that place

The card always says which one you're hearing. Every 8 minutes it moves on, west with the dawn.

Keys: **Space** pause · **N** next place · **F** full screen. The cursor hides after 4 seconds without movement.

## Files

| Path | What it is |
|---|---|
| `index.html` | The whole page. Settings are in `CONFIG` near the top of the script. |
| `data/places.json` | ~1,100 places (every capital, plus larger towns) from Natural Earth, with time zones. Built by `scripts/build-places.py`. |
| `data/soundings.json` | Freesound recordings near each place. Rebuilt weekly by the GitHub Action. |
| `worker/worker.js` | Cloudflare Worker that holds the Windy key and fetches webcams. |
| `.github/workflows/soundings.yml` | Weekly job (Sundays 04:17 UTC, or run by hand) that refreshes `soundings.json`. |

## Setup

The page works straight away with live microphones and radio. Webcams and field recordings each need a free key.

### 1. Turn on GitHub Pages

Repo **Settings → Pages → Build and deployment**: deploy from branch `main`, folder `/ (root)`. The page will be at `https://nickcarbone.github.io/first-light/`.

### 2. Field recordings (Freesound)

1. Make a free Freesound account, then apply for API credentials at <https://freesound.org/apiv2/apply>. Copy the **API key** it gives you.
2. In this repo: **Settings → Secrets and variables → Actions → New repository secret**. Name it `FREESOUND_TOKEN` and paste the key.
3. **Actions → Refresh soundings → Run workflow.** It makes about one search per area, slowly enough to stay inside Freesound's limits, so it takes 15–20 minutes. When it finishes it commits `data/soundings.json`.

### 3. Webcams (Windy + Cloudflare Worker)

Windy's image links expire after 10 minutes, so the page has to ask for fresh ones live. The Worker does that asking, so the Windy key never appears in the public page.

1. Get a free **Webcams API** key from [api.windy.com](https://api.windy.com/webcams).
2. In the [Cloudflare dashboard](https://dash.cloudflare.com/) (free account): **Workers & Pages → Create → Worker**. Name it `first-light` and deploy the starter.
3. **Edit code**: replace everything with the contents of `worker/worker.js`, then **Deploy**.
4. Worker **Settings → Variables and Secrets**:
   - add a **Secret** `WINDY_KEY` with your Windy key
   - add a **Text** variable `ALLOWED_ORIGINS` set to `https://nickcarbone.github.io`
5. Copy the Worker's address (something like `https://first-light.<you>.workers.dev`).
6. Check it: open `https://first-light.<you>.workers.dev/webcams?lat=51.5&lon=-0.12` in a browser. You should see JSON with a `webcams` list.
7. In `index.html`, set `WORKER_URL` in `CONFIG` to that address and commit.

To try a Worker without committing, add `?worker=https://first-light.<you>.workers.dev` to the page address.

Dashboard labels move around; if a menu name above doesn't match, the steps are the same in spirit.

## Testing at another time of day

Add `?at=` with a UTC time and the page runs its clock from there, for example `?at=2026-10-22T05:30Z` (central Europe at dawn) or `?at=2026-10-21T20:45Z` (Japan). `?dwell=2` shortens the stay at each place to two minutes.

## Things to know

- **Live microphones come and go.** Locustream mics are run by volunteers; the list is fetched every 30 minutes and only active ones are used. A few publish only plain-http streams, which browsers block on an https page: the page tries an https version, and if that fails it leaves the mic out for six hours and falls back to a recording or radio. Coverage is thickest in Europe, Japan and the eastern US.
- **The dawn chorus is seasonal.** Birds sing hardest in spring. The page prefers recordings tagged with the current season in that hemisphere, demotes ones tagged with a different season and says so on the card. Most recordings carry no season tag.
- **Windy free tier.** Images are small and must not be stretched (Windy's terms), so they show at their own size or smaller. Every image links back to its Windy page, and the credit line in the footer is required.
- **Freesound licences.** Each recording shows its author and licence (CC0, CC BY or CC BY-NC) with a link to its page. This is a personal, non-commercial page, which all three allow.
- **Locustream terms** say the sounds are free and open to distribute, record and adapt; they ask projects to mention Locus Sonus, which the page does.
- The Worker caches each webcam lookup for 4 minutes and answers only requests from `ALLOWED_ORIGINS` (and localhost, for testing). Requests sent with no `Origin` header, such as opening the URL directly, are allowed so you can check it.

## Credits

Webcams provided by [windy.com](https://www.windy.com/) — [add a webcam](https://www.windy.com/webcams/add). Live microphones from [Locustream, Locus Sonus](https://locusonus.org/soundmap/). Recordings from [Freesound](https://freesound.org/) under their own licences. Radio via [Radio Browser](https://www.radio-browser.info/). Places and coastlines from [Natural Earth](https://www.naturalearthdata.com/) via [world-atlas](https://github.com/topojson/world-atlas). Globe drawn with [d3](https://d3js.org/).
