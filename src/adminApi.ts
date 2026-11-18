export async function adminRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("accept")) headers.set("accept", "application/json");
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (options.body && !isFormData && !headers.has("content-type")) headers.set("content-type", "application/json");

  const response = await fetch(path, { ...options, credentials: "same-origin", headers });
  const raw = await response.text();
  let payload: unknown = {};
  if (raw.trim()) {
    try {
      payload = JSON.parse(raw) as unknown;
    } catch {
      if (!response.ok) throw new Error("The server could not complete this request (HTTP " + response.status + "). Please retry or contact the administrator.");
      throw new Error("The server returned an unreadable response. Refresh the workspace and try again.");
    }
  }

  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
      ? payload.error
      : "Request failed (HTTP " + response.status + "). Please try again.";
    throw new Error(message);
  }
  return payload as T;
}
