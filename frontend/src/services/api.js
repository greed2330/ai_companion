export function getApiBaseUrl() {
  if (typeof window !== "undefined" && window.__VITE_API_BASE_URL__) {
    return window.__VITE_API_BASE_URL__;
  }

  if (typeof process !== "undefined" && process.env.VITE_API_BASE_URL) {
    return process.env.VITE_API_BASE_URL;
  }

  return "";
}

export function buildApiUrl(pathname) {
  return `${getApiBaseUrl()}${pathname}`;
}
