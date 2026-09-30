import axios from "axios";

export default async function getSchedInfo(date) {
  try {
    const api_url = import.meta.env.VITE_API_URL || "/api";
    const response = await axios.get(`${api_url}/schedule?date=${date}`);
    return response?.data?.results || [];
  } catch (error) {
    console.error(error);
    return error;
  }
}
