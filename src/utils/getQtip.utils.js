import axios from "axios";
import getApiUrl from "./getApiUrl";

const getQtip = async (id) => {
  try {
    let workerUrls = import.meta.env.VITE_WORKER_URL?.split(",").filter(
      (u) => u && !u.includes("<")
    );
    let baseUrl = workerUrls?.length
      ? workerUrls[Math.floor(Math.random() * workerUrls.length)]
      : getApiUrl();
    const response = await axios.get(`${baseUrl}/qtip/${id.split("-").pop()}`);
    return response.data.results;
  } catch (err) {
    console.error("Error fetching genre info:", err);
    return null; 
  }
};

export default getQtip;
