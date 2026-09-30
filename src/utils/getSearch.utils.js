import axios from "axios";
import getApiUrl from "./getApiUrl";

const getSearch = async (keyword, page) => {
  const api_url = getApiUrl();
  if (!page) page = 1;
  try {
    const response = await axios.get(
      `${api_url}/search?keyword=${keyword}&page=${page}`
    );
    return response.data.results;
  } catch (err) {
    console.error("Error fetching genre info:", err);
    return err;
  }
};

export default getSearch;
