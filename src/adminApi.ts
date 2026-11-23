export class AdminRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "AdminRequestError";
  }
}

export async function adminRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("accept")) headers.set("accept", "application/json");
  // Mark every same-origin admin request, including GETs, so the Worker can validate forwarded Origin headers. Explicit cross-site Fetch Metadata is still rejected server-side.
  headers.set("x-deverve-admin-request", "same-origin");
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
    const code = payload && typeof payload === "object" && "code" in payload && typeof payload.code === "string" ? payload.code : undefined;
    throw new AdminRequestError(message, response.status, code);
  }
  return payload as T;
}
