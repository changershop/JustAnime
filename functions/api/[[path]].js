// Cloudflare Pages Function to serve /api/* on Cloudflare Pages deployments
const ANIKOTO_BASE_URL = "https://anikotoapi.site";
const ANIKOTO_WEB_URL = "https://anikototv.to";

const DEFAULT_GENRES = [
  "Action", "Adventure", "Cars", "Comedy", "Dementia", "Demons", "Drama",
  "Ecchi", "Fantasy", "Game", "Harem", "Historical", "Horror", "Isekai",
  "Josei", "Kids", "Magic", "Martial Arts", "Mecha", "Military", "Music",
  "Mystery", "Parody", "Police", "Psychological", "Romance", "Samurai",
  "School", "Sci-Fi", "Seinen", "Shoujo", "Shoujo Ai", "Shounen",
  "Shounen Ai", "Slice of Life", "Space", "Sports", "Super Power",
  "Supernatural", "Thriller", "Vampire"
];

function slugify(text) {
  return String(text || "anime")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildAnimeId(item) {
  const baseSlug = item.slug || slugify(item.title);
  return `${baseSlug}-${item.id}`;
}

function extractNumericId(rawId) {
  if (!rawId) return null;
  const clean = String(rawId).split("?")[0].trim();
  if (/^\d+$/.test(clean)) return parseInt(clean, 10);
  const match = clean.match(/-(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

function normalizeShowType(rawType) {
  if (!rawType) return "TV";
  const t = Array.isArray(rawType) ? rawType[0] : String(rawType);
  if (!t) return "TV";
  const upper = t.toUpperCase();
  if (upper === "TV_SHORT" || upper === "TV") return "TV";
  if (upper === "MOVIE") return "Movie";
  return t;
}

function mapAnimeCard(item, index = 0) {
  const id = buildAnimeId(item);
  const epCount = parseInt(item.episodes, 10) || (item.status === "Not yet aired" ? 0 : 12);
  const showType = normalizeShowType(item.terms_by_type?.type);
  return {
    id,
    data_id: String(item.id),
    number: index + 1,
    poster: item.poster || item.background_image || "",
    title: item.title || item.alternative || "Untitled Anime",
    japanese_title: item.native || item.alternative || item.title || "Untitled Anime",
    description: item.description || "Watch full episodes in HD quality on JustAnime.",
    tvInfo: {
      showType,
      duration: item.duration ? `${item.duration}m` : "24m",
      releaseDate: item.aired || String(item.year || "2026"),
      quality: "HD",
      sub: epCount || 1,
      dub: 0,
      eps: epCount || 1,
    },
    adultContent: false,
  };
}

function parseFilterHtml(html) {
  const results = [];
  const seen = new Set();
  const itemBlocks = html.split(/<div class="item[\s"]/g).slice(1);
  for (const block of itemBlocks) {
    const tipMatch = block.match(/data-tip="(\d+)"/);
    if (!tipMatch) continue;
    const numId = parseInt(tipMatch[1], 10);
    if (seen.has(numId)) continue;
    seen.add(numId);

    const hrefMatch = block.match(/href="https?:\/\/[^/]+\/watch\/([^/"?]+)/);
    const titleMatch =
      block.match(/class="name d-title"[^>]*>([^<]+)</) ||
      block.match(/alt="([^"]+)"/);
    const jpMatch = block.match(/data-jp="([^"]+)"/);
    const imgMatch = block.match(/<img[^>]+src="([^"]+)"/);
    const subMatch = block.match(/ep-status sub"><span>\s*(\d+)/);
    const dubMatch = block.match(/ep-status dub"><span>\s*(\d+)/);
    const totalMatch = block.match(/ep-status total"><span>\s*(\d+)/);
    const typeMatch = block.match(/<div class="right">([^<]+)</);

    const title = (titleMatch ? titleMatch[1] : "Anime").trim();
    const jpTitle = (jpMatch ? jpMatch[1] : title).trim();
    const slug = hrefMatch ? hrefMatch[1] : slugify(title);
    const poster = imgMatch ? imgMatch[1] : "";
    const sub = subMatch ? parseInt(subMatch[1], 10) : 1;
    const dub = dubMatch ? parseInt(dubMatch[1], 10) : 0;
    const eps = totalMatch ? parseInt(totalMatch[1], 10) : sub || 1;
    const showType = normalizeShowType(typeMatch ? typeMatch[1].trim() : "TV");

    results.push({
      id: `${slug}-${numId}`,
      data_id: String(numId),
      number: results.length + 1,
      poster,
      title,
      japanese_title: jpTitle,
      description: "Watch full episodes in HD quality on JustAnime.",
      tvInfo: {
        showType,
        duration: "24m",
        releaseDate: "2026",
        quality: "HD",
        sub,
        dub,
        eps,
      },
      adultContent: false,
    });
  }
  return results;
}

async function fetchCatalog() {
  const pages = [1, 2, 3];
  const resps = await Promise.allSettled(
    pages.map((p) =>
      fetch(`${ANIKOTO_BASE_URL}/recent-anime?page=${p}&per_page=100`, {
        headers: { Accept: "application/json", "User-Agent": "curl/7.88.1" },
      }).then((r) => r.json())
    )
  );
  const seen = new Set();
  const items = [];
  for (const r of resps) {
    if (r.status === "fulfilled" && Array.isArray(r.value?.data)) {
      for (const item of r.value.data) {
        if (item?.id && !seen.has(item.id)) {
          seen.add(item.id);
          items.push(item);
        }
      }
    }
  }
  return items;
}

async function fetchSeries(rawId) {
  const numId = extractNumericId(rawId);
  if (!numId) return null;
  const r = await fetch(`${ANIKOTO_BASE_URL}/series/${numId}`, {
    headers: { Accept: "application/json", "User-Agent": "curl/7.88.1" },
  });
  const j = await r.json();
  return j?.data || null;
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.pathname.replace(/^\/api\/?/, "");
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  try {
    if (!path || path === "") {
      const [catalog, mostViewedHtml] = await Promise.all([
        fetchCatalog(),
        fetch(`${ANIKOTO_WEB_URL}/filter?sort=most-viewed`).then((r) => r.text()).catch(() => ""),
      ]);
      const mostViewed = mostViewedHtml ? parseFilterHtml(mostViewedHtml) : [];
      const playable = catalog.filter((a) => a.status !== "Not yet aired");
      const mapped = (playable.length ? playable : catalog).map((a, i) => mapAnimeCard(a, i));
      const trending = (mostViewed.length ? mostViewed : mapped).slice(0, 12).map((c, i) => ({ ...c, number: i + 1 }));
      const spotlights = trending.slice(0, 10).map((c, i) => ({
        ...c,
        number: i + 1,
        tvInfo: { ...c.tvInfo, episodeInfo: { sub: c.tvInfo.sub || 1, dub: c.tvInfo.dub || 0 } },
      }));
      const topTenList = trending.slice(0, 10).map((c, i) => ({ ...c, number: i + 1 }));

      return new Response(
        JSON.stringify({
          success: true,
          results: {
            spotlights,
            trending,
            topTen: { today: topTenList, week: topTenList, month: topTenList },
            today: { schedule: [] },
            topAiring: mapped.slice(0, 12),
            mostPopular: trending.slice(0, 12),
            mostFavorite: trending.slice(0, 12),
            latestCompleted: mapped.slice(0, 12),
            latestEpisode: mapped.slice(0, 12),
            recentlyAdded: mapped.slice(0, 12),
            topUpcoming: catalog.filter((a) => a.status === "Not yet aired").slice(0, 12).map((a, i) => mapAnimeCard(a, i)),
            genres: DEFAULT_GENRES,
          },
        }),
        { headers }
      );
    }

    if (path === "search/suggest" || path === "search") {
      const keyword = url.searchParams.get("keyword") || "";
      const page = url.searchParams.get("page") || "1";
      const html = await fetch(
        `${ANIKOTO_WEB_URL}/filter?keyword=${encodeURIComponent(keyword)}&page=${page}`
      ).then((r) => r.text()).catch(() => "");
      const items = parseFilterHtml(html);
      if (path === "search/suggest") {
        return new Response(JSON.stringify({ success: true, results: items.slice(0, 10) }), { headers });
      }
      return new Response(JSON.stringify({ success: true, results: { data: items, totalPage: 1 } }), { headers });
    }

    if (path === "info") {
      const rawId = url.searchParams.get("id");
      const series = await fetchSeries(rawId);
      const animeObj = series?.anime;
      if (!animeObj) {
        return new Response(JSON.stringify({ success: false, message: "Not found" }), { status: 404, headers });
      }
      const epCount = series?.episodes?.length || Number(animeObj.is_sub) || 1;
      return new Response(
        JSON.stringify({
          success: true,
          results: {
            data: {
              adultContent: false,
              data_id: String(animeObj.id),
              id: buildAnimeId(animeObj),
              title: animeObj.title || animeObj.alternative || "Untitled",
              japanese_title: animeObj.native || animeObj.title,
              poster: animeObj.poster || "",
              showType: normalizeShowType(animeObj.terms_by_type?.type),
              animeInfo: {
                Overview: animeObj.description || "",
                Japanese: animeObj.native || "",
                Synonyms: animeObj.titles || "",
                Aired: animeObj.aired || "2026",
                Premiered: String(animeObj.year || "2026"),
                Duration: animeObj.duration ? `${animeObj.duration}m` : "24m",
                Status: animeObj.status || "Currently Airing",
                "MAL Score": "8.4",
                Genres: animeObj.terms_by_type?.genre || ["Action"],
                Studios: (animeObj.terms_by_type?.studios || []).join(", "),
                Producers: animeObj.terms_by_type?.producers || [],
                tvInfo: {
                  rating: animeObj.rating || "PG-13",
                  quality: "HD",
                  sub: String(Number(animeObj.is_sub) || epCount),
                  dub: String(Number(animeObj.is_dub) || 0),
                  eps: String(epCount),
                  showType: normalizeShowType(animeObj.terms_by_type?.type),
                  duration: "24m",
                },
              },
              charactersVoiceActors: [],
              recommended_data: [],
              related_data: [],
            },
            seasons: [],
          },
        }),
        { headers }
      );
    }

    if (path.startsWith("episodes/")) {
      const animeId = path.replace("episodes/", "");
      const series = await fetchSeries(animeId);
      const rawEps = Array.isArray(series?.episodes) ? series.episodes : [];
      const episodes = rawEps.map((ep, idx) => ({
        episode_no: Number(ep.number) || idx + 1,
        id: `${animeId}?ep=${ep.id}`,
        data_id: String(ep.id),
        title: ep.name || `Episode ${ep.number || idx + 1}`,
        japanese_title: ep.name || `Episode ${ep.number || idx + 1}`,
        filler: Boolean(ep.is_filler),
      }));
      return new Response(
        JSON.stringify({ success: true, results: { totalEpisodes: episodes.length, episodes } }),
        { headers }
      );
    }

    if (path.startsWith("servers/")) {
      const animeId = path.replace("servers/", "");
      const epId = (url.searchParams.get("ep") || "").split("?").pop();
      const series = await fetchSeries(animeId);
      const rawEps = Array.isArray(series?.episodes) ? series.episodes : [];
      const ep = rawEps.find((e) => String(e.id) === String(epId)) || rawEps[0];
      const servers = [];
      if (ep?.embed_url?.sub) servers.push({ type: "sub", data_id: String(ep.id), server_id: "1", serverName: "HD-1" });
      if (ep?.embed_url?.hsub) servers.push({ type: "sub", data_id: String(ep.id), server_id: "2", serverName: "HD-2" });
      if (ep?.embed_url?.dub) servers.push({ type: "dub", data_id: String(ep.id), server_id: "3", serverName: "HD-1" });
      return new Response(JSON.stringify({ success: true, results: servers }), { headers });
    }

    if (path === "stream") {
      const rawIdParam = url.searchParams.get("id") || "";
      const [animeIdPart, epPart] = rawIdParam.split("?ep=");
      const epId = epPart || url.searchParams.get("ep");
      const type = (url.searchParams.get("type") || "sub").toLowerCase();
      const server = (url.searchParams.get("server") || "hd-1").toLowerCase();
      const series = await fetchSeries(animeIdPart);
      const rawEps = Array.isArray(series?.episodes) ? series.episodes : [];
      const ep = rawEps.find((e) => String(e.id) === String(epId)) || rawEps[0];
      const embedUrl =
        type === "dub"
          ? ep?.embed_url?.dub || ep?.embed_url?.sub
          : server === "hd-2"
            ? ep?.embed_url?.hsub || ep?.embed_url?.sub
            : ep?.embed_url?.sub || ep?.embed_url?.hsub || ep?.embed_url?.dub;
      return new Response(
        JSON.stringify({
          success: true,
          results: {
            streamingLink: [{ id: String(ep?.id || ""), type, link: null, iframe: embedUrl || null, server: "HD-1" }],
            servers: [],
            tracks: [],
          },
        }),
        { headers }
      );
    }

    const catalog = await fetchCatalog();
    return new Response(
      JSON.stringify({
        success: true,
        results: { data: catalog.slice(0, 24).map((a, i) => mapAnimeCard(a, i)), totalPage: 1 },
      }),
      { headers }
    );
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers });
  }
}
