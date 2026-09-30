import express from "express";
import cors from "cors";
import axios from "axios";
import * as cheerio from "cheerio";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ANIKOTO_BASE_URL = (process.env.ANIKOTO_API_URL || "https://anikotoapi.site").replace(/\/+$/, "");
const ANIKOTO_WEB_URL = "https://anikototv.to";

const GENRE_ID_MAP = {
  action: "1",
  "action-adventure": "2344",
  adventure: "2",
  animation: "2345",
  "award-winning": "2357",
  "boys-love": "2330",
  cars: "538",
  comedy: "8",
  dementia: "453",
  demons: "119",
  drama: "62",
  ecchi: "214",
  erotica: "2322",
  fantasy: "3",
  game: "180",
  "girls-love": "2328",
  gourmet: "2326",
  harem: "215",
  historical: "70",
  horror: "222",
  isekai: "74",
  josei: "404",
  kids: "46",
  magic: "203",
  "mahou-shoujo": "2310",
  "martial-arts": "114",
  mecha: "123",
  military: "125",
  music: "242",
  mystery: "57",
  parody: "162",
  police: "136",
  psychological: "73",
  romance: "28",
  samurai: "163",
  school: "14",
  "sci-fi": "12",
  "sci-fi-fantasy": "2352",
  seinen: "50",
  shoujo: "252",
  "shoujo-ai": "235",
  shounen: "15",
  "shounen-ai": "233",
  "slice-of-life": "35",
  space: "124",
  sports: "29",
  "super-power": "16",
  supernatural: "9",
  suspense: "2316",
  thriller: "54",
  vampire: "58",
};

const DEFAULT_GENRES = [
  "Action",
  "Adventure",
  "Cars",
  "Comedy",
  "Dementia",
  "Demons",
  "Drama",
  "Ecchi",
  "Fantasy",
  "Game",
  "Harem",
  "Historical",
  "Horror",
  "Isekai",
  "Josei",
  "Kids",
  "Magic",
  "Martial Arts",
  "Mecha",
  "Military",
  "Music",
  "Mystery",
  "Parody",
  "Police",
  "Psychological",
  "Romance",
  "Samurai",
  "School",
  "Sci-Fi",
  "Seinen",
  "Shoujo",
  "Shoujo Ai",
  "Shounen",
  "Shounen Ai",
  "Slice of Life",
  "Space",
  "Sports",
  "Super Power",
  "Supernatural",
  "Thriller",
  "Vampire",
];

// In-memory caches
const catalogCache = {
  items: [],
  timestamp: 0,
  fetchingPromise: null,
};
const homeWebCache = {
  data: null,
  timestamp: 0,
  fetchingPromise: null,
};
const seriesCache = new Map(); // numericId -> { data, timestamp }
const slugToIdMap = new Map(); // slug -> numericId
const filterCache = new Map(); // cacheKey -> { data, timestamp }

const CATALOG_TTL_MS = 10 * 60 * 1000;
const HOME_WEB_TTL_MS = 10 * 60 * 1000;
const SERIES_TTL_MS = 15 * 60 * 1000;
const FILTER_TTL_MS = 10 * 60 * 1000;

function slugify(text) {
  return String(text || "anime")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildAnimeId(item) {
  const baseSlug = item.slug || slugify(item.title);
  if (item.id) {
    slugToIdMap.set(baseSlug, Number(item.id));
  }
  return `${baseSlug}-${item.id}`;
}

function extractNumericId(rawId) {
  if (!rawId) return null;
  const clean = String(rawId).split("?")[0].trim();
  if (/^\d+$/.test(clean)) return parseInt(clean, 10);
  if (slugToIdMap.has(clean)) return slugToIdMap.get(clean);
  const match = clean.match(/-(\d+)$/);
  if (match) return parseInt(match[1], 10);
  const found = catalogCache.items.find(
    (a) => a.slug === clean || buildAnimeId(a) === clean
  );
  return found ? Number(found.id) : null;
}

function normalizeShowType(rawType) {
  if (!rawType) return "TV";
  const t = Array.isArray(rawType) ? rawType[0] : String(rawType);
  if (!t) return "TV";
  const upper = t.toUpperCase();
  if (upper === "TV_SHORT" || upper === "TV") return "TV";
  if (upper === "MOVIE") return "Movie";
  if (upper === "OVA") return "OVA";
  if (upper === "ONA") return "ONA";
  if (upper === "SPECIAL" || upper === "TV SPECIAL") return "Special";
  if (upper === "MUSIC") return "Music";
  return t;
}

function mapAnimeCard(item, index = 0) {
  const id = buildAnimeId(item);
  const data_id = String(item.id);
  const cachedSeries = seriesCache.get(Number(item.id))?.data;
  const rawEpCount =
    parseInt(item.episodes, 10) ||
    cachedSeries?.episodes?.length ||
    (item.status === "Not yet aired" ? 0 : 12);

  const subCount =
    cachedSeries?.anime?.is_sub !== undefined
      ? Number(cachedSeries.anime.is_sub) || rawEpCount || 1
      : item.subCount !== undefined
        ? Number(item.subCount)
        : rawEpCount || 1;

  const dubCount =
    cachedSeries?.anime?.is_dub !== undefined
      ? Number(cachedSeries.anime.is_dub) || 0
      : item.dubCount !== undefined
        ? Number(item.dubCount)
        : 0;

  const showType = normalizeShowType(item.terms_by_type?.type || item.showType);
  const duration = item.duration ? `${item.duration}m` : "24m";
  const isAdult =
    String(item.rating || "").includes("Rx") ||
    String(item.rating || "").includes("R+");

  return {
    id,
    data_id,
    number: index + 1,
    poster:
      item.poster ||
      item.background_image ||
      "https://cdn.noitatnemucod.net/thumbnail/300x400/100/bcd84731a3eda4f4a306250769675065.jpg",
    title: item.title || item.alternative || "Untitled Anime",
    japanese_title: item.native || item.alternative || item.title || "Untitled Anime",
    description: item.description || "Watch full episodes in HD quality on JustAnime.",
    tvInfo: {
      showType,
      duration,
      releaseDate: item.aired || String(item.year || "2026"),
      quality: "HD",
      sub: subCount,
      dub: dubCount,
      eps: rawEpCount || subCount || 1,
    },
    adultContent: isAdult,
  };
}

function parseAnikotoWebItems($, selector = ".ani.items .item") {
  const results = [];
  const seen = new Set();

  $(selector).each((i, el) => {
    const tip =
      $(el).find("[data-tip]").attr("data-tip") ||
      $(el).attr("data-tip");
    if (!tip || !/^\d+$/.test(String(tip).trim())) return;

    const numId = parseInt(String(tip).trim(), 10);
    if (seen.has(numId)) return;
    seen.add(numId);

    const href =
      $(el).find("a[href*='/watch/']").attr("href") ||
      $(el).find("a").attr("href") ||
      "";
    const rawSlug = href.includes("/watch/")
      ? href.split("/watch/")[1]?.split("/")[0]?.split("?")[0]
      : null;

    const nameEl = $(el).find(".name.d-title, a.name, .title").first();
    const title =
      nameEl.text().trim() ||
      $(el).find("img").attr("alt")?.trim() ||
      "Untitled Anime";
    const jpTitle =
      nameEl.attr("data-jp")?.trim() ||
      $(el).find("[data-jp]").attr("data-jp")?.trim() ||
      title;

    const slug = rawSlug || slugify(title);
    slugToIdMap.set(slug, numId);

    const poster =
      $(el).find("img").attr("src") ||
      $(el).find("img").attr("data-src") ||
      "";

    const subText = $(el).find(".ep-status.sub span").first().text().trim();
    const dubText = $(el).find(".ep-status.dub span").first().text().trim();
    const totalText = $(el).find(".ep-status.total span").first().text().trim();

    const sub = parseInt(subText, 10) || 0;
    const dub = parseInt(dubText, 10) || 0;
    const eps = parseInt(totalText, 10) || sub || dub || 1;

    const rightType =
      $(el).find(".meta .right").first().text().trim() ||
      $(el).find(".meta .dot").last().text().trim() ||
      "TV";
    const showType = normalizeShowType(rightType);

    // Also add into catalogCache if not present so lookup by ID/slug always works
    if (!catalogCache.items.some((a) => Number(a.id) === numId)) {
      catalogCache.items.push({
        id: numId,
        title,
        alternative: jpTitle,
        native: jpTitle,
        slug,
        poster,
        episodes: String(eps),
        subCount: sub || 1,
        dubCount: dub,
        showType,
        terms_by_type: {
          type: [showType],
          genre: $(el)
            .find(".genre a")
            .map((_, g) => $(g).text().trim())
            .get()
            .filter(Boolean),
        },
      });
    }

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
        sub: sub || 1,
        dub,
        eps,
      },
      adultContent: false,
    });
  });

  return results;
}

async function fetchAnikotoFilterPage(queryString) {
  const now = Date.now();
  const cached = filterCache.get(queryString);
  if (cached && now - cached.timestamp < FILTER_TTL_MS) {
    return cached.data;
  }

  const url = queryString.startsWith("http")
    ? queryString
    : `${ANIKOTO_WEB_URL}/filter?${queryString}`;

  const response = await axios.get(url, {
    timeout: 12000,
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    },
  });

  const $ = cheerio.load(response.data);
  const items = parseAnikotoWebItems($, ".ani.items .item");

  let totalPages = 1;
  $(".pagination a, .pagenav a").each((_, a) => {
    const href = $(a).attr("href") || "";
    const m = href.match(/[?&]page=(\d+)/);
    if (m) {
      const p = parseInt(m[1], 10);
      if (p > totalPages) totalPages = p;
    }
    const txt = parseInt($(a).text().trim(), 10);
    if (txt && txt > totalPages) totalPages = txt;
  });

  const result = { items, totalPages };
  filterCache.set(queryString, { data: result, timestamp: now });
  return result;
}

async function fetchAnikotoWebHome() {
  const now = Date.now();
  if (homeWebCache.data && now - homeWebCache.timestamp < HOME_WEB_TTL_MS) {
    return homeWebCache.data;
  }
  if (homeWebCache.fetchingPromise) {
    return homeWebCache.fetchingPromise;
  }

  homeWebCache.fetchingPromise = (async () => {
    try {
      const [homeRes, mostViewedRes, topRatedRes, airingRes] = await Promise.allSettled([
        axios.get(`${ANIKOTO_WEB_URL}/home`, {
          timeout: 12000,
          headers: { "User-Agent": "Mozilla/5.0" },
        }),
        fetchAnikotoFilterPage("sort=most-viewed"),
        fetchAnikotoFilterPage("sort=score"),
        fetchAnikotoFilterPage("status[]=currently-airing&sort=most-viewed"),
      ]);

      const mostViewed =
        mostViewedRes.status === "fulfilled" ? mostViewedRes.value.items : [];
      const topRated =
        topRatedRes.status === "fulfilled" ? topRatedRes.value.items : [];
      const topAiring =
        airingRes.status === "fulfilled" ? airingRes.value.items : [];

      let spotlights = [];
      let latestEpisode = [];
      let topUpcoming = [];
      let recentlyAdded = [];
      let latestCompleted = [];
      let topTenDay = [];
      let topTenWeek = [];
      let topTenMonth = [];

      if (homeRes.status === "fulfilled") {
        const $ = cheerio.load(homeRes.value.data);

        // Parse all sections first so slugToIdMap is populated for spotlights
        $("section").each((_, sec) => {
          const secTitle = $(sec)
            .find(".head .title, h2, .section-title")
            .first()
            .text()
            .trim()
            .toLowerCase();

          if (secTitle.includes("latest episode")) {
            latestEpisode = parseAnikotoWebItems($, $(sec).find(".ani.items .item"));
          } else if (secTitle.includes("upcoming")) {
            topUpcoming = parseAnikotoWebItems($, $(sec).find(".ani.items .item"));
          } else if (secTitle.includes("new added") || secTitle.includes("new release")) {
            const parsed = parseAnikotoWebItems($, $(sec).find(".item"));
            recentlyAdded.push(...parsed);
          } else if (secTitle.includes("completed")) {
            latestCompleted = parseAnikotoWebItems($, $(sec).find(".item"));
          } else if (secTitle.includes("top anime")) {
            const allTop = parseAnikotoWebItems($, $(sec).find(".item"));
            topTenDay = allTop.slice(0, 9).map((it, idx) => ({ ...it, number: idx + 1 }));
            topTenWeek = allTop.slice(9, 18).map((it, idx) => ({ ...it, number: idx + 1 }));
            topTenMonth = allTop.slice(18, 27).map((it, idx) => ({ ...it, number: idx + 1 }));
          }
        });

        // Parse Swiper spotlights
        $(".swiper-slide").each((idx, slide) => {
          const href = $(slide).find("a.play").attr("href") || "";
          const slug = href.split("/watch/")[1]?.split("/")[0]?.split("?")[0];
          if (!slug) return;

          const numId = slugToIdMap.get(slug);
          if (!numId) return;

          const title = $(slide).find(".title").text().trim() || "Featured Anime";
          const jpTitle = $(slide).find(".title").attr("data-jp")?.trim() || title;
          const synopsis = $(slide).find(".synopsis").text().trim();
          const dateText = $(slide).find(".date").text().trim() || "2026";
          const bgStyle = $(slide).find(".image > div").attr("style") || "";
          const bgMatch = bgStyle.match(/url\(['"]?([^'")]+)['"]?\)/);
          const bannerUrl = bgMatch ? bgMatch[1] : "";

          const existingCard =
            mostViewed.find((m) => m.data_id === String(numId)) ||
            latestEpisode.find((m) => m.data_id === String(numId));

          spotlights.push({
            id: `${slug}-${numId}`,
            data_id: String(numId),
            number: spotlights.length + 1,
            poster: bannerUrl || existingCard?.poster || "",
            title,
            japanese_title: jpTitle,
            description: synopsis || existingCard?.description || "",
            tvInfo: {
              showType: existingCard?.tvInfo?.showType || "TV",
              duration: "24m",
              releaseDate: dateText,
              quality: "HD",
              sub: existingCard?.tvInfo?.sub || 12,
              dub: existingCard?.tvInfo?.dub || 0,
              eps: existingCard?.tvInfo?.eps || 12,
              episodeInfo: {
                sub: existingCard?.tvInfo?.sub || 12,
                dub: existingCard?.tvInfo?.dub || 0,
              },
            },
            adultContent: false,
          });
        });
      }

      const data = {
        spotlights,
        mostViewed,
        topRated,
        topAiring,
        latestEpisode,
        topUpcoming,
        recentlyAdded,
        latestCompleted,
        topTenDay,
        topTenWeek,
        topTenMonth,
      };
      homeWebCache.data = data;
      homeWebCache.timestamp = Date.now();
      return data;
    } catch (err) {
      console.error("[Anikoto] Error fetching web home:", err.message);
      return homeWebCache.data;
    } finally {
      homeWebCache.fetchingPromise = null;
    }
  })();

  return homeWebCache.fetchingPromise;
}

let isBackgroundSyncRunning = false;

async function syncAllAnikotoPagesInBackground(seenIds) {
  if (isBackgroundSyncRunning) return;
  isBackgroundSyncRunning = true;
  try {
    let page = 6;
    while (page <= 95) {
      await new Promise((r) => setTimeout(r, 2100));
      const res = await axios.get(`${ANIKOTO_BASE_URL}/recent-anime`, {
        params: { page, per_page: 100 },
        timeout: 12000,
        headers: {
          Accept: "application/json",
          "User-Agent": "curl/7.88.1",
        },
      });
      const list = Array.isArray(res.data?.data)
        ? res.data.data
        : Array.isArray(res.data)
          ? res.data
          : [];
      if (!list || list.length === 0) break;

      for (const item of list) {
        if (item && item.id) {
          if (item.slug) slugToIdMap.set(item.slug, Number(item.id));
          if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            catalogCache.items.push(item);
          }
        }
      }
      catalogCache.timestamp = Date.now();
      const totalPages = res.data?.pagination?.total_pages || 91;
      if (page >= totalPages) break;
      page++;
    }
  } catch (err) {
    // Reached rate limit or end of pages
  } finally {
    isBackgroundSyncRunning = false;
  }
}

async function fetchAnikotoCatalog(forceRefresh = false) {
  const now = Date.now();
  if (
    !forceRefresh &&
    catalogCache.items.length > 0 &&
    now - catalogCache.timestamp < CATALOG_TTL_MS
  ) {
    return catalogCache.items;
  }
  if (catalogCache.fetchingPromise) {
    return catalogCache.fetchingPromise;
  }

  catalogCache.fetchingPromise = (async () => {
    try {
      const pagesToFetch = [1, 2, 3, 4, 5];
      const responses = await Promise.allSettled(
        pagesToFetch.map((page) =>
          axios.get(`${ANIKOTO_BASE_URL}/recent-anime`, {
            params: { page, per_page: 100 },
            timeout: 12000,
            headers: {
              Accept: "application/json",
              "User-Agent": "curl/7.88.1",
            },
          })
        )
      );

      const seen = new Set();
      const allItems = [];

      for (const res of responses) {
        if (res.status === "fulfilled") {
          const list = Array.isArray(res.value.data?.data)
            ? res.value.data.data
            : Array.isArray(res.value.data)
              ? res.value.data
              : [];
          for (const item of list) {
            if (item && item.id && !seen.has(item.id)) {
              seen.add(item.id);
              if (item.slug) slugToIdMap.set(item.slug, Number(item.id));
              allItems.push(item);
            }
          }
        }
      }

      if (allItems.length > 0) {
        for (const existing of catalogCache.items) {
          if (existing && existing.id && !seen.has(existing.id)) {
            seen.add(existing.id);
            allItems.push(existing);
          }
        }
        catalogCache.items = allItems;
        catalogCache.timestamp = Date.now();
        syncAllAnikotoPagesInBackground(seen);
      }
      return catalogCache.items;
    } catch (err) {
      console.error("[Anikoto] Error fetching catalog:", err.message);
      return catalogCache.items;
    } finally {
      catalogCache.fetchingPromise = null;
    }
  })();

  return catalogCache.fetchingPromise;
}

async function resolveSeriesNumericId(rawId) {
  const direct = extractNumericId(rawId);
  if (direct) return direct;

  const cleanSlug = String(rawId || "")
    .split("?")[0]
    .replace(/\/+$/, "")
    .trim();
  if (!cleanSlug) return null;

  try {
    const res = await axios.get(`${ANIKOTO_WEB_URL}/watch/${cleanSlug}/ep-1`, {
      timeout: 10000,
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const $ = cheerio.load(res.data);
    const dataId = $("#watch-main").attr("data-id");
    if (dataId && /^\d+$/.test(dataId)) {
      const numId = parseInt(dataId, 10);
      slugToIdMap.set(cleanSlug, numId);
      return numId;
    }
  } catch (e) {
    // ignore
  }
  return null;
}

async function fetchAnikotoSeries(rawId) {
  const numId = await resolveSeriesNumericId(rawId);
  if (!numId) return null;

  const now = Date.now();
  const cached = seriesCache.get(numId);
  if (cached && now - cached.timestamp < SERIES_TTL_MS) {
    return cached.data;
  }

  try {
    const res = await axios.get(`${ANIKOTO_BASE_URL}/series/${numId}`, {
      timeout: 12000,
      headers: {
        Accept: "application/json",
        "User-Agent": "curl/7.88.1",
      },
    });
    const data = res.data?.data;
    if (data && data.anime) {
      if (data.anime.slug) {
        slugToIdMap.set(data.anime.slug, Number(data.anime.id));
      }
      seriesCache.set(numId, { data, timestamp: now });
      return data;
    }
  } catch (err) {
    console.error(`[Anikoto] Error fetching series ${numId}:`, err.message);
  }
  return cached ? cached.data : null;
}

function rankSearchCards(cards, keyword) {
  const q = String(keyword || "").toLowerCase().trim();
  if (!q) return cards;

  return [...cards].sort((a, b) => {
    const aTitle = String(a.title || "").toLowerCase();
    const bTitle = String(b.title || "").toLowerCase();
    const aJp = String(a.japanese_title || "").toLowerCase();
    const bJp = String(b.japanese_title || "").toLowerCase();

    const aExact = aTitle === q || aJp === q ? 1 : 0;
    const bExact = bTitle === q || bJp === q ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;

    const aStarts = aTitle.startsWith(q) || aJp.startsWith(q) ? 1 : 0;
    const bStarts = bTitle.startsWith(q) || bJp.startsWith(q) ? 1 : 0;
    if (aStarts !== bStarts) return bStarts - aStarts;

    const aTV = a.tvInfo?.showType === "TV" ? 1 : 0;
    const bTV = b.tvInfo?.showType === "TV" ? 1 : 0;
    if (aTV !== bTV) return bTV - aTV;

    const aEps = Number(a.tvInfo?.sub || a.tvInfo?.eps || 0);
    const bEps = Number(b.tvInfo?.sub || b.tvInfo?.eps || 0);
    return bEps - aEps;
  });
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(cors());
  app.use(express.json());

  // 1. Home Info: GET /api
  app.get("/api", async (req, res) => {
    try {
      const [catalog, webHome] = await Promise.all([
        fetchAnikotoCatalog(),
        fetchAnikotoWebHome(),
      ]);

      const playable = catalog.filter((a) => a.status !== "Not yet aired");
      const sourceList = playable.length >= 20 ? playable : catalog;
      const mappedCatalog = sourceList.map((item, idx) => mapAnimeCard(item, idx));

      const spotlights =
        webHome?.spotlights?.length > 0
          ? webHome.spotlights
          : mappedCatalog.slice(0, 10).map((card, idx) => ({
              ...card,
              number: idx + 1,
              tvInfo: {
                ...card.tvInfo,
                episodeInfo: {
                  sub: card.tvInfo.sub || 1,
                  dub: card.tvInfo.dub || 0,
                },
              },
            }));

      const trending =
        webHome?.mostViewed?.length > 0
          ? webHome.mostViewed.slice(0, 12).map((c, idx) => ({ ...c, number: idx + 1 }))
          : mappedCatalog.slice(0, 12).map((c, idx) => ({ ...c, number: idx + 1 }));

      const topTen = {
        today:
          webHome?.topTenDay?.length > 0
            ? webHome.topTenDay
            : trending.slice(0, 10).map((c, i) => ({ ...c, number: i + 1 })),
        week:
          webHome?.topTenWeek?.length > 0
            ? webHome.topTenWeek
            : trending.slice(0, 10).map((c, i) => ({ ...c, number: i + 1 })),
        month:
          webHome?.topTenMonth?.length > 0
            ? webHome.topTenMonth
            : trending.slice(0, 10).map((c, i) => ({ ...c, number: i + 1 })),
      };

      const latestEpisode =
        webHome?.latestEpisode?.length > 0
          ? webHome.latestEpisode
          : mappedCatalog.slice(0, 12);

      const topAiring =
        webHome?.topAiring?.length > 0
          ? webHome.topAiring.slice(0, 12)
          : mappedCatalog.slice(0, 12);

      const mostPopular =
        webHome?.mostViewed?.length > 0
          ? webHome.mostViewed.slice(0, 12)
          : mappedCatalog.slice(0, 12);

      const mostFavorite =
        webHome?.topRated?.length > 0
          ? webHome.topRated.slice(0, 12)
          : mappedCatalog.slice(0, 12);

      const latestCompleted =
        webHome?.latestCompleted?.length > 0
          ? webHome.latestCompleted.slice(0, 12)
          : mappedCatalog
              .filter((_, i) => catalog[i]?.status === "Finished Airing")
              .slice(0, 12);

      const recentlyAdded =
        webHome?.recentlyAdded?.length > 0
          ? webHome.recentlyAdded.slice(0, 12)
          : mappedCatalog.slice(0, 12);

      const topUpcoming =
        webHome?.topUpcoming?.length > 0
          ? webHome.topUpcoming.slice(0, 12)
          : catalog
              .filter((a) => a.status === "Not yet aired")
              .slice(0, 12)
              .map((a, i) => mapAnimeCard(a, i));

      return res.json({
        success: true,
        results: {
          spotlights,
          trending,
          topTen,
          today: { schedule: [] },
          topAiring,
          mostPopular,
          mostFavorite,
          latestCompleted:
            latestCompleted.length > 0 ? latestCompleted : mappedCatalog.slice(0, 12),
          latestEpisode,
          recentlyAdded,
          topUpcoming,
          genres: DEFAULT_GENRES,
        },
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // 2. Top Search: GET /api/top-search
  app.get("/api/top-search", async (req, res) => {
    try {
      const webHome = await fetchAnikotoWebHome();
      const list =
        webHome?.mostViewed?.length > 0
          ? webHome.mostViewed.slice(0, 10)
          : (await fetchAnikotoCatalog()).slice(0, 10).map((a, i) => mapAnimeCard(a, i));
      const results = list.map((item) => ({
        title: item.title,
        link: `/search?keyword=${encodeURIComponent(item.title)}`,
      }));
      return res.json({ success: true, results });
    } catch (err) {
      return res.json({ success: true, results: [] });
    }
  });

  // 3. Random Anime ID: GET /api/random/id
  app.get("/api/random/id", async (req, res) => {
    try {
      const catalog = await fetchAnikotoCatalog();
      const playable = catalog.filter((a) => a.status !== "Not yet aired");
      const pool = playable.length ? playable : catalog;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      return res.json({
        success: true,
        results: pick ? buildAnimeId(pick) : "naruto-eybxz-958",
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // 4. Anime Info: GET /api/info?id=...
  app.get("/api/info", async (req, res) => {
    try {
      const rawId = req.query.id;
      const [catalog, series, webHome] = await Promise.all([
        fetchAnikotoCatalog(),
        fetchAnikotoSeries(rawId),
        fetchAnikotoWebHome(),
      ]);

      const numId = await resolveSeriesNumericId(rawId);
      const catItem = catalog.find((a) => Number(a.id) === Number(numId));
      const animeObj = series?.anime || catItem;

      if (!animeObj) {
        return res.status(404).json({ success: false, message: "Anime not found" });
      }

      const merged = {
        ...catItem,
        ...animeObj,
        terms_by_type: animeObj.terms_by_type || catItem?.terms_by_type || {},
      };

      const epCount =
        series?.episodes?.length ||
        parseInt(merged.episodes, 10) ||
        Number(merged.is_sub) ||
        1;
      const subCount =
        merged.is_sub !== undefined ? Number(merged.is_sub) || epCount : epCount;
      const dubCount =
        merged.is_dub !== undefined ? Number(merged.is_dub) || 0 : 0;

      const genres = merged.terms_by_type?.genre || ["Action", "Adventure"];
      const studios = merged.terms_by_type?.studios || [];
      const producers = merged.terms_by_type?.producers || [];
      const showType = normalizeShowType(merged.terms_by_type?.type);

      const relatedPool =
        webHome?.mostViewed?.length > 0
          ? webHome.mostViewed.filter((a) => a.data_id !== String(merged.id))
          : catalog
              .filter((a) => a.id !== merged.id && a.status !== "Not yet aired")
              .slice(0, 16)
              .map((a, i) => mapAnimeCard(a, i));

      const recommended_data = relatedPool.slice(0, 12);
      const related_data = relatedPool.slice(0, 8);

      return res.json({
        success: true,
        results: {
          data: {
            adultContent:
              String(merged.rating || "").includes("Rx") ||
              String(merged.rating || "").includes("R+"),
            data_id: String(merged.id),
            id: buildAnimeId(merged),
            mal_id: merged.mal_id || "",
            al_id: merged.ani_id || "",
            title: merged.title || merged.alternative || "Untitled",
            japanese_title: merged.native || merged.alternative || merged.title,
            synonyms: merged.titles || merged.alternative || "",
            poster:
              merged.poster ||
              merged.background_image ||
              "https://cdn.noitatnemucod.net/thumbnail/300x400/100/bcd84731a3eda4f4a306250769675065.jpg",
            showType,
            animeInfo: {
              Overview: merged.description || "No description available.",
              Japanese: merged.native || merged.title || "",
              Synonyms: merged.titles || merged.alternative || "",
              Aired: merged.aired || String(merged.year || "2026"),
              Premiered:
                merged.season && merged.year
                  ? `${merged.season.charAt(0).toUpperCase() + merged.season.slice(1)} ${merged.year}`
                  : String(merged.year || "2026"),
              Duration: merged.duration ? `${merged.duration}m` : "24m",
              Status: merged.status || "Currently Airing",
              "MAL Score": "8.4",
              Genres: genres,
              Studios: studios.join(", ") || "Anikoto Studio",
              Producers: producers,
              tvInfo: {
                rating: merged.rating || "PG-13",
                quality: "HD",
                sub: String(subCount),
                dub: String(dubCount),
                eps: String(epCount),
                showType,
                duration: merged.duration ? `${merged.duration}m` : "24m",
              },
            },
            charactersVoiceActors: [],
            recommended_data,
            related_data,
          },
          seasons: [],
        },
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // 5. Episodes List: GET /api/episodes/:id
  app.get("/api/episodes/:id", async (req, res) => {
    try {
      const series = await fetchAnikotoSeries(req.params.id);
      const rawEpisodes = Array.isArray(series?.episodes) ? series.episodes : [];

      const episodes = rawEpisodes.map((ep, idx) => ({
        episode_no: Number(ep.number) || idx + 1,
        id: `${req.params.id}?ep=${ep.id}`,
        data_id: String(ep.id),
        title: ep.name || ep.title || `Episode ${ep.number || idx + 1}`,
        japanese_title: ep.name || `Episode ${ep.number || idx + 1}`,
        filler: Boolean(ep.is_filler),
      }));

      return res.json({
        success: true,
        results: {
          totalEpisodes: episodes.length,
          episodes,
        },
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // 6. Servers for Episode: GET /api/servers/:id?ep=...
  app.get("/api/servers/:id", async (req, res) => {
    try {
      const epId = String(req.query.ep || "").split("?").pop();
      const series = await fetchAnikotoSeries(req.params.id);
      const rawEpisodes = Array.isArray(series?.episodes) ? series.episodes : [];
      const episode =
        rawEpisodes.find((e) => String(e.id) === String(epId)) || rawEpisodes[0];

      const servers = [];
      if (episode?.embed_url?.sub) {
        servers.push({
          type: "sub",
          data_id: String(episode.id),
          server_id: "1",
          serverName: "HD-1",
        });
      }
      if (episode?.embed_url?.hsub) {
        servers.push({
          type: "sub",
          data_id: String(episode.id),
          server_id: "2",
          serverName: "HD-2",
        });
      }
      if (episode?.embed_url?.dub) {
        servers.push({
          type: "dub",
          data_id: String(episode.id),
          server_id: "3",
          serverName: "HD-1",
        });
      }

      if (servers.length === 0 && episode) {
        servers.push({
          type: "sub",
          data_id: String(episode.id),
          server_id: "1",
          serverName: "HD-1",
        });
      }

      return res.json({
        success: true,
        results: servers,
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // 7. Stream Info: GET /api/stream?id=animeId?ep=episodeId&server=hd-1&type=sub
  const MEGAPLAY_AES_KEY = (() => {
    const buf = Buffer.alloc(32);
    Buffer.from("i?LMTAx0Q6,:}50U").copy(buf);
    return buf;
  })();
  const MEGAPLAY_AES_IV = Buffer.from("W0;27ToaUpl_P%'c");

  function decryptMegaPlayToken(token) {
    try {
      let b64 = String(token).replace(/-/g, "+").replace(/_/g, "/");
      const pad = b64.length % 4;
      if (pad) b64 += "====".slice(pad);
      const decipher = crypto.createDecipheriv(
        "aes-256-cbc",
        MEGAPLAY_AES_KEY,
        MEGAPLAY_AES_IV
      );
      let dec = decipher.update(Buffer.from(b64, "base64"), undefined, "utf8");
      dec += decipher.final("utf8");
      return dec;
    } catch (e) {
      return null;
    }
  }

  async function extractMegaPlayStream(embedUrl) {
    if (!embedUrl || !embedUrl.includes("megaplay.buzz")) return null;
    try {
      const origin = new URL(embedUrl).origin;
      const pageRes = await axios.get(embedUrl, {
        timeout: 10000,
        headers: {
          Referer: `${ANIKOTO_WEB_URL}/`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      const html = String(pageRes.data || "");
      const idMatch = html.match(/id="megaplay-player"[^>]*data-id="(\d+)"/) ||
                      html.match(/data-id="(\d+)"/);
      if (!idMatch) return null;

      const dataId = idMatch[1];
      const srcRes = await axios.get(`${origin}/stream/getSources?id=${dataId}`, {
        timeout: 10000,
        headers: {
          Referer: embedUrl,
          "X-Requested-With": "XMLHttpRequest",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      const srcData = srcRes.data;
      let fileUrl = srcData?.sources?.file || srcData?.sources?.[0]?.file || null;

      if (!fileUrl && srcData?.enc) {
        const decrypted = decryptMegaPlayToken(srcData.enc);
        if (decrypted) {
          try {
            const parsed = JSON.parse(decrypted);
            fileUrl = parsed?.file || parsed?.[0]?.file || null;
          } catch {
            if (decrypted.startsWith("http")) fileUrl = decrypted;
          }
        }
      }

      if (!fileUrl) return null;

      return {
        file: fileUrl,
        tracks: Array.isArray(srcData?.tracks) ? srcData.tracks : [],
        intro: srcData?.intro || { start: 0, end: 0 },
        outro: srcData?.outro || { start: 0, end: 0 },
      };
    } catch (err) {
      console.error("[MegaPlay] Failed to extract direct HLS stream:", err.message);
      return null;
    }
  }

  app.get("/api/m3u8-proxy", async (req, res) => {
    try {
      const targetUrl = String(req.query.url || "").trim();
      if (!targetUrl || !targetUrl.startsWith("http")) {
        return res.status(400).send("Missing or invalid url");
      }

      const isM3u8 =
        /\.m3u8(\?|$)/i.test(targetUrl) || /index-[^/]+\.m3u8/i.test(targetUrl);

      const response = await axios.get(targetUrl, {
        responseType: isM3u8 ? "text" : "arraybuffer",
        timeout: 15000,
        headers: {
          Referer: "https://megaplay.buzz/",
          Origin: "https://megaplay.buzz",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      res.setHeader("Access-Control-Allow-Origin", "*");

      const contentType = String(response.headers["content-type"] || "");
      const bodyStr = isM3u8 ? String(response.data) : "";

      if (isM3u8 || bodyStr.trim().startsWith("#EXTM3U")) {
        const text = isM3u8
          ? bodyStr
          : Buffer.from(response.data).toString("utf8");

        const lines = text.split(/\r?\n/);
        const rewritten = lines
          .map((line) => {
            const trimmed = line.trim();
            if (!trimmed) return line;

            // Decrypt /segment/<token> if present
            let processedLine = trimmed.replace(
              /(?:https?:\/\/[^\s\r\n"]+)?\/segment\/([A-Za-z0-9_-]+)/g,
              (full, tok) => decryptMegaPlayToken(tok) || full
            );

            if (processedLine.startsWith("#")) {
              return processedLine.replace(/URI="([^"]+)"/g, (_, uri) => {
                try {
                  const abs = new URL(uri, targetUrl).href;
                  return `URI="/api/m3u8-proxy?url=${encodeURIComponent(abs)}"`;
                } catch {
                  return `URI="${uri}"`;
                }
              });
            }

            try {
              const absUrl = new URL(processedLine, targetUrl).href;
              return `/api/m3u8-proxy?url=${encodeURIComponent(absUrl)}`;
            } catch {
              return processedLine;
            }
          })
          .join("\n");

        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        return res.send(rewritten);
      }

      res.setHeader("Content-Type", contentType || "video/mp2t");
      res.setHeader("Cache-Control", "public, max-age=3600");
      return res.send(Buffer.from(response.data));
    } catch (err) {
      return res.status(502).send("Proxy error: " + err.message);
    }
  });

  app.get("/api/embed", async (req, res) => {
    try {
      const targetUrl = String(req.query.url || "").trim();
      if (!targetUrl || !targetUrl.startsWith("http")) {
        return res.status(400).send("Invalid embed url");
      }
      const origin = new URL(targetUrl).origin;
      const response = await axios.get(targetUrl, {
        timeout: 12000,
        headers: {
          Referer: `${ANIKOTO_WEB_URL}/`,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      let html = String(response.data || "");
      // Remove app.main.js (which contains the SandboxDetector blocker and popup ads)
      html = html.replace(/<script[^>]*app\.main\.js[^>]*><\/script>/gi, "");
      html = html.replace(/<script[^>]*statlytic\.net[^>]*><\/script>/gi, "");
      // Inject base href and neutralize SandboxDetector
      const headInjection = `<base href="${origin}/"><script>window.SandboxDetector={detect:async()=>false,run:async()=>false,showBlockMessage:()=>{}};</script>`;
      html = html.replace(/<head>/i, `<head>${headInjection}`);

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(html);
    } catch (err) {
      return res.redirect(String(req.query.url || "/"));
    }
  });

  app.get("/api/stream", async (req, res) => {
    try {
      const rawIdParam = String(req.query.id || "");
      const [animeIdPart, epPart] = rawIdParam.split("?ep=");
      const epId = epPart || req.query.ep;
      const type = String(req.query.type || "sub").toLowerCase();
      const server = String(req.query.server || "hd-1").toLowerCase();

      const series = await fetchAnikotoSeries(animeIdPart);
      const rawEpisodes = Array.isArray(series?.episodes) ? series.episodes : [];
      const episode =
        rawEpisodes.find((e) => String(e.id) === String(epId)) || rawEpisodes[0];

      const embedUrl =
        type === "dub"
          ? episode?.embed_url?.dub || episode?.embed_url?.sub || episode?.embed_url?.hsub
          : server === "hd-2"
            ? episode?.embed_url?.hsub || episode?.embed_url?.sub || episode?.embed_url?.dub
            : episode?.embed_url?.sub || episode?.embed_url?.hsub || episode?.embed_url?.dub;

      const directStream = await extractMegaPlayStream(embedUrl);
      const safeIframe = embedUrl
        ? `/api/embed?url=${encodeURIComponent(embedUrl)}`
        : null;

      return res.json({
        success: true,
        results: {
          streamingLink: [
            {
              id: String(episode?.id || epId || ""),
              type,
              link: directStream ? { file: directStream.file, type: "hls" } : null,
              tracks: directStream?.tracks || [],
              intro: directStream?.intro || { start: 0, end: 0 },
              outro: directStream?.outro || { start: 0, end: 0 },
              iframe: safeIframe,
              server: req.query.server || "HD-1",
            },
          ],
          servers: [],
          tracks: directStream?.tracks || [],
        },
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // Direct Anikoto API pass-through endpoints (/api/anikoto/recent-anime & /api/anikoto/series/:id)
  app.get("/api/anikoto/recent-anime", async (req, res) => {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const perPage = parseInt(req.query.per_page, 10) || 20;
      const response = await axios.get(`${ANIKOTO_BASE_URL}/recent-anime`, {
        params: { page, per_page: perPage },
        timeout: 12000,
        headers: {
          Accept: "application/json",
          "User-Agent": "curl/7.88.1",
        },
      });
      return res.json(response.data);
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.get("/api/anikoto/series/:id", async (req, res) => {
    try {
      const series = await fetchAnikotoSeries(req.params.id);
      if (!series) {
        return res.status(404).json({ ok: false, error: "Series not found" });
      }
      return res.json({ ok: true, data: series });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 8. Qtip Info: GET /api/qtip/:id
  app.get("/api/qtip/:id", async (req, res) => {
    try {
      const [catalog, series] = await Promise.all([
        fetchAnikotoCatalog(),
        fetchAnikotoSeries(req.params.id),
      ]);
      const numId = await resolveSeriesNumericId(req.params.id);
      const item =
        series?.anime || catalog.find((a) => Number(a.id) === Number(numId));

      if (!item) {
        return res.json({ success: true, results: null });
      }

      const epCount =
        series?.episodes?.length ||
        parseInt(item.episodes, 10) ||
        Number(item.is_sub) ||
        1;

      return res.json({
        success: true,
        results: {
          title: item.title || item.alternative || "Untitled",
          rating: "8.5",
          quality: "HD",
          subCount: Number(item.is_sub) || epCount,
          dubCount: Number(item.is_dub) || 0,
          episodeCount: epCount,
          type: normalizeShowType(item.terms_by_type?.type),
          description: item.description || "Watch in HD on JustAnime.",
          japaneseTitle: item.native || item.alternative || item.title,
          Synonyms: item.titles || item.alternative || "",
          airedDate: item.aired || String(item.year || "2026"),
          status: item.status || "Currently Airing",
          genres: item.terms_by_type?.genre || ["Action", "Fantasy"],
          watchLink: `/watch/${buildAnimeId(item)}`,
        },
      });
    } catch (err) {
      return res.json({ success: true, results: null });
    }
  });

  // 9. Search Suggestions: GET /api/search/suggest?keyword=...
  app.get("/api/search/suggest", async (req, res) => {
    try {
      const keyword = String(req.query.keyword || "").trim();
      if (!keyword) {
        return res.json({ success: true, results: [] });
      }

      let webMatches = [];
      try {
        const filterData = await fetchAnikotoFilterPage(
          `keyword=${encodeURIComponent(keyword)}`
        );
        webMatches = filterData.items || [];
      } catch (e) {
        // fallback to local catalog
      }

      const catalog = await fetchAnikotoCatalog();
      const q = keyword.toLowerCase();
      const localMatches = catalog
        .filter(
          (a) =>
            String(a.title || "").toLowerCase().includes(q) ||
            String(a.alternative || "").toLowerCase().includes(q) ||
            String(a.titles || "").toLowerCase().includes(q) ||
            String(a.native || "").toLowerCase().includes(q)
        )
        .map((a, i) => mapAnimeCard(a, i));

      const seenIds = new Set();
      const combined = [];
      for (const item of [...webMatches, ...localMatches]) {
        if (!seenIds.has(item.data_id)) {
          seenIds.add(item.data_id);
          combined.push(item);
        }
      }

      const ranked = rankSearchCards(combined, keyword).slice(0, 10);
      const results = ranked.map((item) => ({
        id: item.id,
        data_id: item.data_id,
        title: item.title,
        japanese_title: item.japanese_title,
        poster: item.poster,
        releaseDate: item.tvInfo?.releaseDate || "2026",
        showType: item.tvInfo?.showType || "TV",
        duration: item.tvInfo?.duration || "24m",
      }));

      return res.json({ success: true, results });
    } catch (err) {
      return res.json({ success: true, results: [] });
    }
  });

  // 10. Full Search: GET /api/search?keyword=...&page=...
  app.get("/api/search", async (req, res) => {
    try {
      const keyword = String(req.query.keyword || "").trim();
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);

      let webItems = [];
      let totalPage = 1;

      if (keyword) {
        try {
          const filterData = await fetchAnikotoFilterPage(
            `keyword=${encodeURIComponent(keyword)}&page=${page}`
          );
          webItems = filterData.items || [];
          totalPage = filterData.totalPages || 1;
        } catch (e) {
          // fallback to catalog
        }
      }

      const catalog = await fetchAnikotoCatalog();
      const q = keyword.toLowerCase();
      const localMatches = keyword
        ? catalog
            .filter(
              (a) =>
                String(a.title || "").toLowerCase().includes(q) ||
                String(a.alternative || "").toLowerCase().includes(q) ||
                String(a.titles || "").toLowerCase().includes(q) ||
                String(a.native || "").toLowerCase().includes(q)
            )
            .map((a, i) => mapAnimeCard(a, i))
        : catalog.slice((page - 1) * 24, page * 24).map((a, i) => mapAnimeCard(a, i));

      const seenIds = new Set();
      const combined = [];
      for (const item of [...webItems, ...(page === 1 ? localMatches : [])]) {
        if (!seenIds.has(item.data_id)) {
          seenIds.add(item.data_id);
          combined.push(item);
        }
      }

      const ranked = page === 1 ? rankSearchCards(combined, keyword) : combined;

      return res.json({
        success: true,
        results: {
          data: ranked,
          totalPage,
        },
      });
    } catch (err) {
      return res.json({ success: true, results: { data: [], totalPage: 1 } });
    }
  });

  // 11. Schedule: GET /api/schedule?date=... & GET /api/schedule/:id
  app.get("/api/schedule", async (req, res) => {
    try {
      const catalog = await fetchAnikotoCatalog();
      const airing = catalog.filter((a) => a.status === "Currently Airing");
      const list = (airing.length ? airing : catalog).slice(0, 15);
      const results = list.map((item, idx) => ({
        id: buildAnimeId(item),
        data_id: String(item.id),
        title: item.title || item.alternative || "Untitled",
        japanese_title: item.native || item.alternative || item.title,
        time: `${String((idx * 2 + 8) % 24).padStart(2, "0")}:00`,
        episode_no: parseInt(item.episodes, 10) || idx + 1,
      }));
      return res.json({ success: true, results });
    } catch (err) {
      return res.json({ success: true, results: [] });
    }
  });

  app.get("/api/schedule/:id", (req, res) => {
    return res.json({
      success: true,
      results: { nextEpisodeSchedule: null },
    });
  });

  // 12. Producer / Studio: GET /api/producer/:producer
  app.get("/api/producer/:producer", async (req, res) => {
    try {
      const slug = slugify(req.params.producer);
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const perPage = 24;
      const catalog = await fetchAnikotoCatalog();

      const matched = catalog.filter((a) => {
        const studios = (a.terms_by_type?.studios || []).map(slugify);
        const producers = (a.terms_by_type?.producers || []).map(slugify);
        return (
          studios.some((s) => s.includes(slug)) ||
          producers.some((p) => p.includes(slug))
        );
      });

      const list = matched.length ? matched : catalog;
      const totalPage = Math.max(1, Math.ceil(list.length / perPage));
      const slice = list
        .slice((page - 1) * perPage, page * perPage)
        .map((a, i) => mapAnimeCard(a, i));

      return res.json({
        success: true,
        results: {
          data: slice,
          totalPage,
        },
      });
    } catch (err) {
      return res.json({ success: true, results: { data: [], totalPage: 1 } });
    }
  });

  // 13. Genre List: GET /api/genre/:genre
  app.get("/api/genre/:genre", async (req, res) => {
    try {
      const genreSlug = slugify(req.params.genre);
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const genreId = GENRE_ID_MAP[genreSlug];

      if (genreId) {
        try {
          const filterData = await fetchAnikotoFilterPage(
            `genre[]=${encodeURIComponent(genreId)}&sort=most-viewed&page=${page}`
          );
          if (filterData.items.length > 0) {
            return res.json({
              success: true,
              results: {
                data: filterData.items,
                totalPage: filterData.totalPages || 1,
              },
            });
          }
        } catch (e) {
          // fallback to catalog
        }
      }

      const perPage = 24;
      const catalog = await fetchAnikotoCatalog();
      const matched = catalog.filter((a) => {
        const genres = (a.terms_by_type?.genre || []).map(slugify);
        return genres.includes(genreSlug);
      });

      const list = matched.length ? matched : catalog;
      const totalPage = Math.max(1, Math.ceil(list.length / perPage));
      const slice = list
        .slice((page - 1) * perPage, page * perPage)
        .map((a, i) => mapAnimeCard(a, i));

      return res.json({
        success: true,
        results: {
          data: slice,
          totalPage,
        },
      });
    } catch (err) {
      return res.json({ success: true, results: { data: [], totalPage: 1 } });
    }
  });

  // 14. A-Z List: GET /api/az-list & GET /api/az-list/:letter
  app.get(["/api/az-list", "/api/az-list/:letter"], async (req, res) => {
    try {
      const letter = String(req.params.letter || "").toUpperCase();
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);

      try {
        const azUrl =
          letter && letter !== "ALL"
            ? `${ANIKOTO_WEB_URL}/az-list/${encodeURIComponent(letter)}?page=${page}`
            : `${ANIKOTO_WEB_URL}/filter?sort=name-az&page=${page}`;
        const filterData = await fetchAnikotoFilterPage(azUrl);
        if (filterData.items.length > 0) {
          return res.json({
            success: true,
            results: {
              data: filterData.items,
              totalPage: filterData.totalPages || 1,
            },
          });
        }
      } catch (e) {
        // fallback to local catalog
      }

      const perPage = 24;
      const catalog = await fetchAnikotoCatalog();
      let filtered = [...catalog].sort((a, b) =>
        String(a.title || "").localeCompare(String(b.title || ""))
      );

      if (letter && letter !== "ALL") {
        if (letter === "OTHER" || letter === "0-9") {
          filtered = filtered.filter((a) => /^[^a-zA-Z]/.test(String(a.title || "")));
        } else {
          filtered = filtered.filter((a) =>
            String(a.title || "").toUpperCase().startsWith(letter)
          );
        }
      }

      const totalPage = Math.max(1, Math.ceil(filtered.length / perPage));
      const slice = filtered
        .slice((page - 1) * perPage, page * perPage)
        .map((a, i) => mapAnimeCard(a, i));

      return res.json({
        success: true,
        results: {
          data: slice,
          totalPage,
        },
      });
    } catch (err) {
      return res.json({ success: true, results: { data: [], totalPage: 1 } });
    }
  });

  // 15. Category Pages: GET /api/:category (movie, tv, ova, ona, special, most-popular, top-airing, subbed-anime, dubbed-anime, etc.)
  app.get("/api/:category", async (req, res) => {
    try {
      const category = String(req.params.category || "").toLowerCase();
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);

      const categoryFilterMap = {
        movie: "term_type[]=Movie&sort=most-viewed",
        tv: "term_type[]=TV&sort=most-viewed",
        ova: "term_type[]=OVA&sort=most-viewed",
        ona: "term_type[]=ONA&sort=most-viewed",
        special: "term_type[]=Special&sort=most-viewed",
        "subbed-anime": "language[]=sub&sort=most-viewed",
        "dubbed-anime": "language[]=dub&sort=most-viewed",
        "most-popular": "sort=most-viewed",
        "most-favorite": "sort=score",
        "top-airing": "status[]=currently-airing&sort=most-viewed",
        "recently-updated": "sort=latest-updated",
        "recently-added": "sort=latest-added",
        completed: "status[]=finished-airing&sort=most-viewed",
        "top-upcoming": "status[]=not-yet-aired&sort=release-date",
      };

      const filterQuery = categoryFilterMap[category];
      if (filterQuery) {
        try {
          const filterData = await fetchAnikotoFilterPage(`${filterQuery}&page=${page}`);
          if (filterData.items.length > 0) {
            return res.json({
              success: true,
              results: {
                data: filterData.items,
                totalPage: filterData.totalPages || 1,
              },
            });
          }
        } catch (e) {
          // fallback to local catalog
        }
      }

      const perPage = 24;
      const catalog = await fetchAnikotoCatalog();
      const totalPage = Math.max(1, Math.ceil(catalog.length / perPage));
      const slice = catalog
        .slice((page - 1) * perPage, page * perPage)
        .map((a, i) => mapAnimeCard(a, i));

      return res.json({
        success: true,
        results: {
          data: slice,
          totalPage,
        },
      });
    } catch (err) {
      return res.json({ success: true, results: { data: [], totalPage: 1 } });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.use((req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`JustAnime server running on http://0.0.0.0:${PORT}`);
    fetchAnikotoCatalog().catch(() => {});
    fetchAnikotoWebHome().catch(() => {});
    // Auto-sync new anime & episode updates from Anikoto every 10 minutes
    setInterval(() => {
      fetchAnikotoCatalog(true).catch(() => {});
      fetchAnikotoWebHome().catch(() => {});
    }, 10 * 60 * 1000);
  });
}

startServer();
