import axios from "axios";
import getApiUrl from "./getApiUrl";

const getCategoryInfo = async (path,page) => {
  const api_url = getApiUrl();
  try {
    const response = await axios.get(`${api_url}/${path}?page=${page}`);
    return response.data.results;
  } catch (err) {
    console.error("Error fetching genre info:", err);
    return err;
  }
};

export default getCategoryInfo;
