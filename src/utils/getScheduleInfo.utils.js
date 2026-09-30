import axios from "axios";
import getApiUrl from "./getApiUrl";

export default async function getSchedInfo(date) {
  try {
    const api_url = getApiUrl();
    const response = await axios.get(`${api_url}/schedule?date=${date}`);
    return response?.data?.results || [];
  } catch (error) {
    console.error(error);
    return error;
  }
}
