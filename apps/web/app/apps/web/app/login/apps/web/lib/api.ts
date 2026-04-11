export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

export type ApiMethod = "GET" | "POST";

export async function apiFetch<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = await response.text();
    try {
      const parsed = JSON.parse(payload);
      throw new Error(parsed.detail || `Request failed: ${response.status}`);
    } catch {
      throw new Error(payload || `Request failed: ${response.status}`);
    }
  }

  return response.json() as Promise<T>;
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem("hiresight-token");
}

export function setStoredToken(token: string): void {
  window.localStorage.setItem("hiresight-token", token);
}

export function clearStoredToken(): void {
  window.localStorage.removeItem("hiresight-token");
}
