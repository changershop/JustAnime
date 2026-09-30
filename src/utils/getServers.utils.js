import axios from "axios";
import getApiUrl from "./getApiUrl";

export default async function getServers(animeId, episodeId) {
  try {
    const api_url = getApiUrl();
    const response = await axios.get(
      `${api_url}/servers/${animeId}?ep=${episodeId}`
    );
    return response.data.results;
  } catch (error) {
    console.error(error);
    return error;
  }
}
