import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import { createServer as createViteServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ANIKOTO_BASE_URL = process.env.ANIKOTO_API_URL || "https://anikotoapi.site";
const CATALOG_TTL_MS = 15 * 60 * 1000; // 15 minutes
const SERIES_TTL_MS = 10 * 60 * 1000; // 10 minutes

let catalogCache = {
  items: [],
  timestamp: 0,
  fetchingPromise: null,
};

const seriesCache = new Map();

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

function getAnimeId(item) {
  const baseSlug = (item.slug || item.title || "anime")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${baseSlug}-${item.id}`;
}

function mapCardItem(item, index = 0) {
  const showType = item.terms_by_type?.type?.[0] || "TV";
  const subCount = item.is_sub
    ? String(item.is_sub)
    : item.status !== "Not yet aired" && item.episodes
      ? String(item.episodes)
      : item.status !== "Not yet aired"
        ? "1"
        : undefined;
  const dubCount = item.is_dub ? String(item.is_dub) : undefined;
  const duration = item.duration || "24m";

  return {
    id: getAnimeId(item),
    data_id: String(item.id),
    number: index + 1,
    poster: item.poster || "/splash.jpg",
    title: item.title || "Unknown Title",
    japanese_title: item.native || item.alternative || item.title || "Unknown Title",
    description: item.description || "No synopsis available.",
    releaseDate: item.aired || String(item.year || "2026"),
    showType,
    type: showType,
    duration,
    adultContent: item.rating === "Rx",
    tvInfo: {
      showType,
      duration,
      releaseDate: item.aired || String(item.year || "2026"),
      quality: "HD",
      rating: item.rating || "PG-13",
      sub: subCount,
      dub: dubCount,
      eps: item.episodes ? String(item.episodes) : subCount,
      episodeInfo: {
        sub: subCount || "1",
        dub: dubCount,
      },
    },
  };
}

async function fetchAnikotoCatalog() {
  const now = Date.now();
  if (catalogCache.items.length > 0 && now - catalogCache.timestamp < CATALOG_TTL_MS) {
    return catalogCache.items;
  }
  if (catalogCache.fetchingPromise) {
    return catalogCache.fetchingPromise;
  }

  catalogCache.fetchingPromise = (async () => {
    try {
      const pagesToFetch = [1, 2, 3];
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
              allItems.push(item);
            }
          }
        }
      }

      if (allItems.length > 0) {
        catalogCache.items = allItems;
        catalogCache.timestamp = Date.now();
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

async function resolveAnikotoId(rawId) {
  if (!rawId) return null;
  const clean = String(rawId).split("?")[0].trim();
  if (/^\d+$/.test(clean)) return clean;

  const trailingMatch = clean.match(/-(\d+)$/);
  if (trailingMatch) return trailingMatch[1];

  const catalog = await fetchAnikotoCatalog();
  const found = catalog.find(
    (item) =>
      getAnimeId(item) === clean ||
      (item.slug && item.slug.toLowerCase() === clean.toLowerCase()) ||
      String(item.id) === clean
  );
  return found ? String(found.id) : null;
}

async function fetchAnikotoSeries(rawId) {
  const numericId = await resolveAnikotoId(rawId);
  if (!numericId) return null;

  const cached = seriesCache.get(numericId);
  if (cached && Date.now() - cached.timestamp < SERIES_TTL_MS) {
    return cached.data;
  }

  try {
    const response = await axios.get(`${ANIKOTO_BASE_URL}/series/${numericId}`, {
      timeout: 12000,
      headers: {
        Accept: "application/json",
        "User-Agent": "curl/7.88.1",
      },
    });
    const seriesData = response.data?.data || response.data;
    if (seriesData && seriesData.anime) {
      seriesCache.set(numericId, {
        data: seriesData,
        timestamp: Date.now(),
      });
      return seriesData;
    }
  } catch (err) {
    console.warn(`[Anikoto] Series fetch warning for ${numericId}:`, err.message);
  }

  const catalog = await fetchAnikotoCatalog();
  const fallbackItem = catalog.find((item) => String(item.id) === String(numericId));
  if (fallbackItem) {
    return { anime: fallbackItem, episodes: [] };
  }
  return null;
}

function paginateItems(items, page = 1, perPage = 24) {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const start = (safePage - 1) * perPage;
  const sliced = items.slice(start, start + perPage).map((item, idx) => mapCardItem(item, start + idx));
  return {
    data: sliced,
    totalPages,
    totalPage: totalPages,
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // 1. Home Info: GET /api
  app.get("/api", async (req, res) => {
    try {
      const catalog = await fetchAnikotoCatalog();
      const airing = catalog.filter(
        (item) => item.status !== "Not yet aired" && (item.is_sub || item.is_dub)
      );
      const upcoming = catalog.filter((item) => item.status === "Not yet aired");
      const completed = catalog.filter(
        (item) =>
          item.status?.toLowerCase().includes("finished") ||
          item.status?.toLowerCase().includes("completed")
      );
      const activePool = airing.length > 0 ? airing : catalog;

      const spotlights = activePool.slice(0, 10).map((item, i) => mapCardItem(item, i));
      const trending = activePool.slice(0, 10).map((item, i) => mapCardItem(item, i));

      const scoredPool = [...activePool].sort(
        (a, b) => (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0)
      );
      const topToday = activePool.slice(0, 10).map((item, i) => mapCardItem(item, i));
      const topWeek = scoredPool.slice(0, 10).map((item, i) => mapCardItem(item, i));
      const topMonth = [...activePool]
        .reverse()
        .slice(0, 10)
        .map((item, i) => mapCardItem(item, i));

      const latestEpisode = activePool.slice(0, 24).map((item, i) => mapCardItem(item, i));
      const topAiring = activePool.slice(0, 24).map((item, i) => mapCardItem(item, i));
      const mostPopular = scoredPool.slice(0, 24).map((item, i) => mapCardItem(item, i));
      const mostFavorite = [...scoredPool]
        .slice(0, 24)
        .map((item, i) => mapCardItem(item, i));
      const latestCompleted = (completed.length > 0 ? completed : activePool.slice(10, 34)).map(
        (item, i) => mapCardItem(item, i)
      );
      const topUpcoming = (upcoming.length > 0 ? upcoming : catalog.slice(0, 24)).map((item, i) =>
        mapCardItem(item, i)
      );
      const recentlyAdded = catalog.slice(0, 24).map((item, i) => mapCardItem(item, i));

      return res.json({
        success: true,
        results: {
          spotlights,
          trending,
          topTen: {
            today: topToday,
            week: topWeek,
            month: topMonth,
          },
          today: {
            schedule: activePool.slice(0, 10).map((item, idx) => ({
              id: getAnimeId(item),
              data_id: String(item.id),
              title: item.title,
              japanese_title: item.native || item.alternative || item.title,
              time: `${String((14 + idx) % 24).padStart(2, "0")}:30`,
              episode_no: item.next_air_ep || (item.is_sub ? Number(item.is_sub) + 1 : 1),
            })),
          },
          topAiring,
          mostPopular,
          mostFavorite,
          latestCompleted,
          latestEpisode,
          topUpcoming,
          recentlyAdded,
          genres: DEFAULT_GENRES,
        },
      });
    } catch (err) {
      console.error("[API /api] Error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // 2. Random Anime ID: GET /api/random/id
  app.get("/api/random/id", async (req, res) => {
    const catalog = await fetchAnikotoCatalog();
    const airing = catalog.filter((item) => item.status !== "Not yet aired" && item.is_sub);
    const pool = airing.length > 0 ? airing : catalog;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    return res.json({
      success: true,
      results: chosen ? getAnimeId(chosen) : "red-river-993eb-8942",
    });
  });

  // 3. Anime Info: GET /api/info?id=...
  app.get("/api/info", async (req, res) => {
    try {
      const rawId = req.query.id;
      const series = await fetchAnikotoSeries(rawId);
      if (!series || !series.anime) {
        return res.status(404).json({ success: false, results: null });
      }

      const item = series.anime;
      const episodes = Array.isArray(series.episodes) ? series.episodes : [];
      const catalog = await fetchAnikotoCatalog();
      const itemGenres = item.terms_by_type?.genre || [];

      const related = catalog
        .filter(
          (c) =>
            c.id !== item.id &&
            c.terms_by_type?.genre?.some((g) => itemGenres.includes(g))
        )
        .slice(0, 12)
        .map((c, i) => mapCardItem(c, i));

      const recommended = catalog
        .filter((c) => c.id !== item.id && c.status !== "Not yet aired")
        .slice(0, 12)
        .map((c, i) => mapCardItem(c, i));

      const showType = item.terms_by_type?.type?.[0] || "TV";
      const subCount = item.is_sub
        ? String(item.is_sub)
        : episodes.length > 0
          ? String(episodes.length)
          : undefined;
      const dubCount = item.is_dub ? String(item.is_dub) : undefined;

      return res.json({
        success: true,
        results: {
          data: {
            id: getAnimeId(item),
            data_id: String(item.id),
            title: item.title,
            japanese_title: item.native || item.alternative || item.title,
            poster: item.poster || "/splash.jpg",
            showType,
            adultContent: item.rating === "Rx",
            animeInfo: {
              Overview: item.description || "No synopsis available.",
              Japanese: item.native || item.alternative || item.title,
              Synonyms: item.titles || item.alternative || "",
              Aired: item.aired || String(item.year || "2026"),
              Premiered:
                item.season && item.year
                  ? `${item.season.charAt(0).toUpperCase() + item.season.slice(1)} ${item.year}`
                  : String(item.year || "2026"),
              Duration: item.duration || "24m",
              Status:
                item.status === "Not yet aired" && episodes.length === 0
                  ? "Not-yet-aired"
                  : item.status || "Currently Airing",
              "MAL Score": item.score || "N/A",
              Genres: itemGenres,
              Studios: item.terms_by_type?.studios || [],
              Producers: item.terms_by_type?.producers || [],
              tvInfo: {
                rating: item.rating || "PG-13",
                quality: "HD",
                sub: subCount,
                dub: dubCount,
                showType,
                duration: item.duration || "24m",
              },
            },
            charactersVoiceActors: [],
            recommended_data: recommended,
            related_data: related,
          },
          seasons: [],
        },
      });
    } catch (err) {
      console.error("[API /api/info] Error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // 4. Episodes List: GET /api/episodes/:id
  app.get("/api/episodes/:id", async (req, res) => {
    try {
      const rawId = req.params.id;
      const series = await fetchAnikotoSeries(rawId);
      if (!series || !series.anime) {
        return res.json({
          success: true,
          results: { totalEpisodes: 0, episodes: [] },
        });
      }

      const animeSlugId = getAnimeId(series.anime);
      const rawEpisodes = Array.isArray(series.episodes) ? series.episodes : [];
      const sorted = [...rawEpisodes].sort((a, b) => (a.number || 0) - (b.number || 0));

      const episodes = sorted.map((ep, idx) => {
        const epNum = ep.number || idx + 1;
        const epId = ep.id || epNum;
        return {
          id: `${animeSlugId}?ep=${epId}`,
          data_id: String(epId),
          episode_no: epNum,
          title: ep.title || `Episode ${epNum}`,
          japanese_title: ep.jp_title || ep.title || `Episode ${epNum}`,
          filler: false,
        };
      });

      return res.json({
        success: true,
        results: {
          totalEpisodes: episodes.length,
          episodes,
        },
      });
    } catch (err) {
      console.error("[API /api/episodes] Error:", err);
      return res.json({
        success: true,
        results: { totalEpisodes: 0, episodes: [] },
      });
    }
  });

  // 5. Episode Servers: GET /api/servers/:animeId
  app.get("/api/servers/:animeId", async (req, res) => {
    try {
      const { animeId } = req.params;
      const episodeId = String(req.query.ep || "");
      const series = await fetchAnikotoSeries(animeId);
      const rawEpisodes = Array.isArray(series?.episodes) ? series.episodes : [];

      const episode =
        rawEpisodes.find(
          (ep) => String(ep.id) === episodeId || String(ep.number) === episodeId
        ) || rawEpisodes[0];

      const servers = [];
      const subEmbed = episode?.embed_url?.sub || episode?.embed_url?.hsub;
      const dubEmbed = episode?.embed_url?.dub;

      if (subEmbed) {
        servers.push(
          {
            type: "sub",
            data_id: `${episodeId || "1"}-sub-hd1`,
            server_id: "1",
            serverName: "HD-1",
          },
          {
            type: "sub",
            data_id: `${episodeId || "1"}-sub-hd2`,
            server_id: "2",
            serverName: "HD-2",
          }
        );
      }

      if (dubEmbed) {
        servers.push(
          {
            type: "dub",
            data_id: `${episodeId || "1"}-dub-hd1`,
            server_id: "3",
            serverName: "HD-1",
          },
          {
            type: "dub",
            data_id: `${episodeId || "1"}-dub-hd2`,
            server_id: "4",
            serverName: "HD-2",
          }
        );
      }

      if (servers.length === 0) {
        servers.push({
          type: "sub",
          data_id: `${episodeId || "1"}-sub-default`,
          server_id: "1",
          serverName: "HD-1",
        });
      }

      return res.json({
        success: true,
        results: servers,
      });
    } catch (err) {
      console.error("[API /api/servers] Error:", err);
      return res.json({ success: true, results: [] });
    }
  });

  // 6. Stream Info: GET /api/stream
  app.get("/api/stream", async (req, res) => {
    try {
      let rawId = String(req.query.id || "");
      let episodeId = String(req.query.ep || "");

      if (rawId.includes("?ep=")) {
        const parts = rawId.split("?ep=");
        rawId = parts[0];
        episodeId = episodeId || parts[1];
      }

      const type = String(req.query.type || "sub").toLowerCase();
      const server = String(req.query.server || "hd-1");

      const series = await fetchAnikotoSeries(rawId);
      const rawEpisodes = Array.isArray(series?.episodes) ? series.episodes : [];
      const episode =
        rawEpisodes.find(
          (ep) => String(ep.id) === episodeId || String(ep.number) === episodeId
        ) || rawEpisodes[0];

      const embedUrl =
        type === "dub"
          ? episode?.embed_url?.dub || episode?.embed_url?.sub || episode?.embed_url?.hsub
          : episode?.embed_url?.sub || episode?.embed_url?.hsub || episode?.embed_url?.dub;

      return res.json({
        success: true,
        results: {
          streamingLink: embedUrl
            ? [
                {
                  id: episodeId,
                  type,
                  link: null,
                  iframe: embedUrl,
                  server,
                },
              ]
            : [],
          servers: [],
          tracks: [],
        },
      });
    } catch (err) {
      console.error("[API /api/stream] Error:", err);
      return res.json({
        success: true,
        results: { streamingLink: [], servers: [], tracks: [] },
      });
    }
  });

  // 7. Qtip Info: GET /api/qtip/:id
  app.get("/api/qtip/:id", async (req, res) => {
    try {
      const series = await fetchAnikotoSeries(req.params.id);
      if (!series || !series.anime) {
        return res.json({ success: true, results: null });
      }
      const item = series.anime;
      const animeId = getAnimeId(item);
      const subCount = item.is_sub || series.episodes?.length || 1;

      return res.json({
        success: true,
        results: {
          id: animeId,
          title: item.title,
          japaneseTitle: item.native || item.alternative || item.title,
          rating: item.score || "N/A",
          quality: "HD",
          subCount: String(subCount),
          dubCount: item.is_dub ? String(item.is_dub) : undefined,
          episodeCount: item.episodes ? String(item.episodes) : String(subCount),
          type: item.terms_by_type?.type?.[0] || "TV",
          description: item.description || "No synopsis available.",
          Synonyms: item.titles || item.alternative || "",
          airedDate: item.aired || String(item.year || "2026"),
          status: item.status || "Currently Airing",
          genres: item.terms_by_type?.genre || [],
          watchLink: `/watch/${animeId}`,
        },
      });
    } catch (err) {
      return res.json({ success: true, results: null });
    }
  });

  // 8. Schedule: GET /api/schedule & GET /api/schedule/:id
  app.get("/api/schedule/:id", async (req, res) => {
    try {
      const series = await fetchAnikotoSeries(req.params.id);
      const nextTime = series?.anime?.next_air_schedule_time;
      return res.json({
        success: true,
        results: {
          nextEpisodeSchedule: nextTime
            ? new Date(nextTime * 1000).toISOString()
            : null,
        },
      });
    } catch {
      return res.json({ success: true, results: { nextEpisodeSchedule: null } });
    }
  });

  app.get("/api/schedule", async (req, res) => {
    try {
      const catalog = await fetchAnikotoCatalog();
      const airing = catalog.filter((item) => item.status !== "Not yet aired");
      const pool = airing.length > 0 ? airing : catalog;
      const dateStr = String(req.query.date || "");
      const daySeed = dateStr
        .split("")
        .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);

      const rotated = pool.slice(daySeed % 5, (daySeed % 5) + 12);
      const schedule = rotated.map((item, idx) => ({
        id: getAnimeId(item),
        data_id: String(item.id),
        title: item.title,
        japanese_title: item.native || item.alternative || item.title,
        time: `${String((12 + idx) % 24).padStart(2, "0")}:${idx % 2 === 0 ? "00" : "30"}`,
        episode_no: item.next_air_ep || (item.is_sub ? Number(item.is_sub) + 1 : 1),
      }));

      return res.json({
        success: true,
        results: schedule,
      });
    } catch (err) {
      return res.json({ success: true, results: [] });
    }
  });

  // 9. Search, Suggest, Top Search
  app.get("/api/top-search", async (req, res) => {
    const catalog = await fetchAnikotoCatalog();
    const airing = catalog.filter((item) => item.status !== "Not yet aired" && item.is_sub);
    const pool = (airing.length > 0 ? airing : catalog).slice(0, 10);
    return res.json({
      success: true,
      results: pool.map((item) => ({
        title: item.title,
        link: `/search?keyword=${encodeURIComponent(item.title)}`,
      })),
    });
  });

  app.get("/api/search/suggest", async (req, res) => {
    const keyword = String(req.query.keyword || "").toLowerCase().trim();
    if (!keyword) return res.json({ success: true, results: [] });

    const catalog = await fetchAnikotoCatalog();
    const matches = catalog
      .filter(
        (item) =>
          item.title?.toLowerCase().includes(keyword) ||
          item.alternative?.toLowerCase().includes(keyword) ||
          item.native?.toLowerCase().includes(keyword) ||
          item.titles?.toLowerCase().includes(keyword)
      )
      .slice(0, 6)
      .map((item, idx) => mapCardItem(item, idx));

    return res.json({
      success: true,
      results: matches,
    });
  });

  app.get("/api/search", async (req, res) => {
    const keyword = String(req.query.keyword || "").toLowerCase().trim();
    const page = parseInt(req.query.page, 10) || 1;
    const catalog = await fetchAnikotoCatalog();

    const matches = keyword
      ? catalog.filter(
          (item) =>
            item.title?.toLowerCase().includes(keyword) ||
            item.alternative?.toLowerCase().includes(keyword) ||
            item.native?.toLowerCase().includes(keyword) ||
            item.titles?.toLowerCase().includes(keyword) ||
            item.terms_by_type?.genre?.some((g) => g.toLowerCase().includes(keyword))
        )
      : catalog;

    return res.json({
      success: true,
      results: paginateItems(matches, page),
    });
  });

  // 10. Producer, Genre, A-Z List, and Category routes
  app.get("/api/producer/:producer", async (req, res) => {
    const producerQuery = req.params.producer.toLowerCase().replace(/-/g, " ");
    const page = parseInt(req.query.page, 10) || 1;
    const catalog = await fetchAnikotoCatalog();

    const matches = catalog.filter(
      (item) =>
        item.terms_by_type?.producers?.some((p) =>
          p.toLowerCase().includes(producerQuery)
        ) ||
        item.terms_by_type?.studios?.some((s) =>
          s.toLowerCase().includes(producerQuery)
        )
    );

    return res.json({
      success: true,
      results: {
        ...paginateItems(matches.length > 0 ? matches : catalog, page),
        producerName: req.params.producer.replace(/-/g, " "),
      },
    });
  });

  app.get("/api/genre/:genre", async (req, res) => {
    const genreQuery = req.params.genre.toLowerCase().replace(/-/g, " ");
    const page = parseInt(req.query.page, 10) || 1;
    const catalog = await fetchAnikotoCatalog();

    const matches = catalog.filter((item) =>
      item.terms_by_type?.genre?.some(
        (g) => g.toLowerCase().replace(/-/g, " ") === genreQuery || g.toLowerCase().includes(genreQuery)
      )
    );

    return res.json({
      success: true,
      results: paginateItems(matches, page),
    });
  });

  app.get(["/api/az-list", "/api/az-list/:letter"], async (req, res) => {
    const letter = (req.params.letter || "").toLowerCase();
    const page = parseInt(req.query.page, 10) || 1;
    const catalog = await fetchAnikotoCatalog();

    let matches = [...catalog].sort((a, b) =>
      (a.title || "").localeCompare(b.title || "")
    );

    if (letter && letter !== "all") {
      if (letter === "0-9") {
        matches = matches.filter((item) => /^[0-9]/.test(item.title || ""));
      } else if (letter === "other" || letter === "#") {
        matches = matches.filter((item) => /^[^a-zA-Z0-9]/.test(item.title || ""));
      } else {
        matches = matches.filter((item) =>
          (item.title || "").toLowerCase().startsWith(letter)
        );
      }
    }

    return res.json({
      success: true,
      results: paginateItems(matches, page),
    });
  });

  app.get("/api/:category", async (req, res) => {
    const category = req.params.category.toLowerCase();
    const page = parseInt(req.query.page, 10) || 1;
    const catalog = await fetchAnikotoCatalog();

    let filtered = catalog;
    if (category === "top-upcoming") {
      filtered = catalog.filter((item) => item.status === "Not yet aired");
    } else if (category === "recently-updated" || category === "top-airing") {
      filtered = catalog.filter((item) => item.status !== "Not yet aired");
    } else if (category === "dubbed-anime") {
      filtered = catalog.filter((item) => item.is_dub);
    } else if (category === "subbed-anime") {
      filtered = catalog.filter((item) => item.is_sub);
    } else if (category === "movie") {
      filtered = catalog.filter((item) =>
        item.terms_by_type?.type?.some((t) => t.toLowerCase().includes("movie"))
      );
    } else if (category === "tv") {
      filtered = catalog.filter((item) =>
        item.terms_by_type?.type?.some((t) => t.toLowerCase() === "tv")
      );
    } else if (category === "ova" || category === "ona" || category === "special") {
      filtered = catalog.filter((item) =>
        item.terms_by_type?.type?.some((t) => t.toLowerCase().includes(category))
      );
    }

    if (filtered.length === 0) filtered = catalog;

    return res.json({
      success: true,
      results: paginateItems(filtered, page),
    });
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
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`JustAnime server running on http://0.0.0.0:${PORT}`);
    fetchAnikotoCatalog().catch(() => {});
  });
}

startServer();
