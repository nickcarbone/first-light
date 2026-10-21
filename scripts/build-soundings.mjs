// Build data/soundings.json: geotagged dawn and outdoor recordings from
// Freesound near each place in data/places.json.
//
// Runs in the weekly GitHub Action (Node 20+, no dependencies).
// Needs a free Freesound API key in the FREESOUND_TOKEN environment variable:
// https://freesound.org/apiv2/apply
//
// Freesound docs: https://freesound.org/docs/api/resources_apiv2.html
// The geotag filter syntax is {!geofilt sfield=geotag pt=LAT,LON d=KM}.

import { readFile, writeFile } from "node:fs/promises";

const TOKEN = process.env.FREESOUND_TOKEN;
if (!TOKEN) {
  console.error("FREESOUND_TOKEN is not set. Add it under Settings → Secrets → Actions.");
  process.exit(1);
}

const RADIUS_KM = 80;          // search radius around each place
const CLUSTER_KM = 60;         // places closer than this share one search
const KEEP = 4;                // recordings kept per place
const PAUSE_MS = 1100;         // stays under Freesound's per-minute limit
const MAX_REQUESTS = 1900;     // stays under Freesound's daily limit
const LIMIT = Number(process.env.FL_LIMIT) || Infinity; // for quick local tests
const PAUSE = process.env.FL_LIMIT ? 0 : PAUSE_MS;

const TAGS = [
  "dawn", "dawn-chorus", "dawnchorus", "sunrise", "daybreak", "morning", "early-morning",
  "birds", "birdsong", "bird", "birds-singing",
  "soundscape", "ambience", "ambient", "field-recording", "nature", "atmosphere",
];
const SCORE = {
  dawn: 6, "dawn-chorus": 8, dawnchorus: 8, sunrise: 6, daybreak: 6, morning: 4, "early-morning": 5,
  birds: 3, birdsong: 4, bird: 2, "birds-singing": 3,
  soundscape: 1, ambience: 1, ambient: 1, "field-recording": 1, nature: 1, atmosphere: 1,
  music: -6, song: -4, synth: -6, loop: -4, processed: -4, voice: -3, speech: -4, talking: -2,
  "sound-design": -4, effect: -3, fx: -3,
};
const SEASONS = { spring: "spring", summer: "summer", autumn: "autumn", fall: "autumn", winter: "winter" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function km(a, b) {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

let requests = 0;
async function search(lat, lon) {
  const filter = [
    `{!geofilt sfield=geotag pt=${lat.toFixed(4)},${lon.toFixed(4)} d=${RADIUS_KM}}`,
    `tag:(${TAGS.join(" OR ")})`,
    "duration:[45 TO *]",
  ].join(" ");
  const params = new URLSearchParams({
    token: TOKEN,
    query: "",
    filter,
    fields: "id,name,username,license,previews,geotag,duration,tags,url",
    page_size: "30",
    sort: "downloads_desc",
  });
  const url = `https://freesound.org/apiv2/search/?${params}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    requests++;
    const res = await fetch(url);
    if (res.status === 429) {
      console.warn("rate limited, waiting 65 s");
      await sleep(65000);
      continue;
    }
    if (!res.ok) throw new Error(`Freesound ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json()).results || [];
  }
  return [];
}

function shape(r, centre) {
  const tags = (r.tags || []).map((t) => t.toLowerCase());
  let score = 0;
  for (const t of tags) score += SCORE[t] || 0;
  const [glat, glon] = String(r.geotag || "").trim().split(/\s+/).map(Number);
  const season = tags.map((t) => SEASONS[t]).find(Boolean) || null;
  const preview = r.previews?.["preview-hq-mp3"] || r.previews?.["preview-lq-mp3"];
  if (!preview || !Number.isFinite(glat) || !Number.isFinite(glon)) return null;
  return {
    id: r.id,
    title: r.name,
    user: r.username,
    licence: r.license,
    page: r.url,
    preview,
    lat: +glat.toFixed(4),
    lon: +glon.toFixed(4),
    km: Math.round(km(centre, { lat: glat, lon: glon })),
    secs: Math.round(r.duration),
    season,
    dawn: tags.some((t) => ["dawn", "dawn-chorus", "dawnchorus", "sunrise", "daybreak", "early-morning"].includes(t)),
    score,
  };
}

const { places } = JSON.parse(await readFile(new URL("../data/places.json", import.meta.url)));

// Group nearby places so each search serves several of them.
const byPop = [...places].sort((a, b) => b.pop - a.pop);
const cells = [];
const placeCell = {};
for (const p of byPop) {
  const near = cells.find((c) => km(c, p) < CLUSTER_KM);
  if (near) { placeCell[p.id] = near.i; continue; }
  const cell = { i: cells.length, lat: p.lat, lon: p.lon, recs: [] };
  cells.push(cell);
  placeCell[p.id] = cell.i;
}
console.log(`${places.length} places → ${cells.length} searches`);

let done = 0;
for (const cell of cells) {
  if (done >= LIMIT) break;
  if (requests >= MAX_REQUESTS) { console.warn("request budget reached; stopping early"); break; }
  try {
    const results = await search(cell.lat, cell.lon);
    cell.recs = results
      .map((r) => shape(r, cell))
      .filter((r) => r && r.score >= 1)
      .sort((a, b) => b.score - a.score || a.km - b.km)
      .slice(0, KEEP);
  } catch (e) {
    console.warn(`cell ${cell.i} failed: ${e.message}`);
  }
  done++;
  if (done % 50 === 0) console.log(`${done}/${cells.length}`);
  await sleep(PAUSE);
}

const withSound = cells.filter((c) => c.recs.length).length;
await writeFile(new URL("../data/soundings.json", import.meta.url), JSON.stringify({
  generated: new Date().toISOString(),
  source: "Freesound (freesound.org) — each recording credited under its own licence",
  radiusKm: RADIUS_KM,
  cellsWithSound: withSound,
  cells: cells.map(({ lat, lon, recs }) => ({ lat, lon, recs })),
  placeCell,
}));
console.log(`done: ${withSound}/${cells.length} areas have recordings; ${requests} requests`);
