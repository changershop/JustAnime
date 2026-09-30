import axios from "axios";
import getApiUrl from "./getApiUrl";

const getNextEpisodeSchedule = async (id) => {
  const api_url = getApiUrl();
  try {
    const response = await axios.get(`${api_url}/schedule/${id}`);
    return response.data.results;
  } catch (err) {
    console.error("Error fetching next episode schedule:", err);
    return err;
  }
};

export default getNextEpisodeSchedule;
