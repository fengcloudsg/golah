import { apiUrl } from "./api";

export type PostalMapStatus = {
  path: string;
  count: number;
  loadedAt: string | null;
  error: string | null;
};

let status: PostalMapStatus | null = null;

export function getPostalMapStatus() {
  return status;
}

/** Load the server postal-code map summary every time the web app starts. */
export async function loadPostalMapOnStartup(): Promise<PostalMapStatus> {
  const res = await fetch(apiUrl("/api/postal-map"));
  if (!res.ok) {
    status = {
      path: "",
      count: 0,
      loadedAt: null,
      error: `Postal map HTTP ${res.status}`,
    };
    return status;
  }
  status = (await res.json()) as PostalMapStatus;
  return status;
}
