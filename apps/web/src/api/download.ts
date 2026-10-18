import { apiUrl, getAccessToken, refreshAccessToken } from "./client.ts";

/**
 * Downloads a file from an authenticated endpoint (CSV exports): adds the access token,
 * refreshes once on 401, and saves the response under `filename`. Resolves false on failure.
 */
export async function downloadFile(path: string, filename: string): Promise<boolean> {
  const get = (token: string | null) => fetch(apiUrl(path), { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: "include" });
  let res = await get(getAccessToken());
  if (res.status === 401) res = await get(await refreshAccessToken());
  if (!res.ok) return false;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}
