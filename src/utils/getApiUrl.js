export default function getApiUrl() {
  const envUrl = import.meta.env.VITE_API_URL;
  if (
    !envUrl ||
    typeof envUrl !== "string" ||
    envUrl.includes("<") ||
    envUrl.includes(">") ||
    envUrl.includes("your_hosted_api") ||
    envUrl.trim() === ""
  ) {
    return "/api";
  }
  return envUrl.trim().replace(/\/+$/, "");
}
