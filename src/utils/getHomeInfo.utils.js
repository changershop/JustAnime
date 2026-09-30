import axios from "axios";
import getApiUrl from "./getApiUrl";

const CACHE_KEY = "anikoto_homeInfoCache_v4";
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

export default async function getHomeInfo() {
  const api_url = getApiUrl();

  const currentTime = Date.now();
  const cachedData = JSON.parse(localStorage.getItem(CACHE_KEY));

  if (
    cachedData &&
    cachedData.data?.spotlights?.length > 0 &&
    currentTime - cachedData.timestamp < CACHE_DURATION
  ) {
    return cachedData.data;
  }
  const response = await axios.get(`${api_url}`);
  if (
    !response?.data?.results ||
    Object.keys(response.data.results).length === 0
  ) {
    return null;
  }
  const {
    spotlights,
    trending,
    topTen: topten,
    today: todaySchedule,
    topAiring: top_airing,
    mostPopular: most_popular,
    mostFavorite: most_favorite,
    latestCompleted: latest_completed,
    latestEpisode: latest_episode,
    topUpcoming: top_upcoming,
    recentlyAdded: recently_added,
    genres,
  } = response.data.results;

  const dataToCache = {
    data: {
      spotlights,
      trending,
      topten,
      todaySchedule,
      top_airing,
      most_popular,
      most_favorite,
      latest_completed,
      latest_episode,
      top_upcoming,
      recently_added,
      genres,
    },
    timestamp: currentTime,
  };

  localStorage.setItem(CACHE_KEY, JSON.stringify(dataToCache));

  return dataToCache.data;
}
