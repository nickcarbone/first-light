// First Light — Windy webcam proxy for Cloudflare Workers.
//
// Holds the Windy API key as a secret so it never appears in the public page.
// One route:  GET /webcams?lat=<lat>&lon=<lon>&radius=<km>
//
// Settings (Worker → Settings → Variables and Secrets):
//   WINDY_KEY        secret  your Windy Webcams API key (free tier is fine)
//   ALLOWED_ORIGINS  text    comma-separated origins allowed to call this,
//                            e.g. https://nickcarbone.github.io
//
// Windy's free-tier image links expire after 10 minutes, so responses are
// cached for 4 minutes only.

const CACHE_SECONDS = 240;

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "https://nickcarbone.github.io")
      .split(",").map((s) => s.trim()).filter(Boolean);
    const okOrigin = allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const cors = {
      "Access-Control-Allow-Origin": okOrigin ? origin : allowed[0],
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Vary": "Origin",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "GET") return json({ error: "method not allowed" }, 405, cors);
    if (origin && !okOrigin) return json({ error: "origin not allowed" }, 403, cors);

    const url = new URL(request.url);
    if (url.pathname !== "/webcams") return json({ error: "not found" }, 404, cors);
    if (!env.WINDY_KEY) return json({ error: "WINDY_KEY secret is not set" }, 500, cors);

    const lat = Number(url.searchParams.get("lat"));
    const lon = Number(url.searchParams.get("lon"));
    const radius = Math.min(250, Math.max(5, Math.round(Number(url.searchParams.get("radius")) || 100)));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return json({ error: "lat and lon are required" }, 400, cors);
    }

    const key = `https://cache.first-light/webcams?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}&r=${radius}`;
    const cache = caches.default;
    const hit = await cache.match(key);
    if (hit) return withCors(hit, cors);

    const api = new URL("https://api.windy.com/webcams/api/v3/webcams");
    api.searchParams.set("nearby", `${lat.toFixed(4)},${lon.toFixed(4)},${radius}`);
    api.searchParams.set("include", "images,location,player,urls");
    api.searchParams.set("limit", "25");

    const res = await fetch(api, { headers: { "x-windy-api-key": env.WINDY_KEY } });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      return json({ error: `windy ${res.status}`, detail }, 502, cors);
    }
    const data = await res.json();
    const webcams = (data.webcams || []).map((w) => ({
      id: w.webcamId ?? w.id,
      title: w.title,
      status: w.status,
      lat: w.location?.latitude,
      lon: w.location?.longitude,
      city: w.location?.city,
      country: w.location?.country,
      preview: w.images?.current?.preview,
      thumbnail: w.images?.current?.thumbnail,
      daylight: w.images?.daylight?.preview,
      sizes: w.images?.sizes,
      playerDay: w.player?.day,
      detail: w.urls?.detail,
      updated: w.lastUpdatedOn,
    })).filter((w) => w.preview);

    const out = json({ webcams }, 200, {});
    out.headers.set("Cache-Control", `public, max-age=${CACHE_SECONDS}`);
    ctx.waitUntil(cache.put(key, out.clone()));
    return withCors(out, cors);
  },
};

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

function withCors(res, cors) {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(cors)) r.headers.set(k, v);
  return r;
}
