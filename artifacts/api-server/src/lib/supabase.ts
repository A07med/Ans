import { ReplitConnectors } from "@replit/connectors-sdk";

export type SupabaseJson = Record<string, unknown> | unknown[] | null;

export class SupabaseApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload: unknown,
  ) {
    super(message);
    this.name = "SupabaseApiError";
  }
}

export function isSupabaseMode() {
  return process.env["APP_MODE"] === "supabase";
}

export async function supabaseRequest(
  path: string,
  init: RequestInit = {},
): Promise<SupabaseJson> {
  const connectors = new ReplitConnectors();
  const response = await connectors.proxy("supabase", path, init);
  const text = await response.text();
  let payload: SupabaseJson = null;
  if (text) {
    try {
      payload = JSON.parse(text) as SupabaseJson;
    } catch {
      payload = { raw: text };
    }
  }
  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload &&
      "message" in payload &&
      typeof payload.message === "string"
        ? payload.message
        : `Supabase request failed with ${response.status}`;
    throw new SupabaseApiError(message, response.status, payload);
  }
  return payload;
}

export async function supabaseRpc<T extends SupabaseJson>(
  name: string,
  params: Record<string, unknown>,
): Promise<T> {
  return (await supabaseRequest(`/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })) as T;
}

export function supabaseErrorResponse(error: unknown) {
  if (error instanceof SupabaseApiError) {
    return {
      status: error.status >= 400 && error.status < 600 ? error.status : 502,
      body: { error: "supabase_error", message: error.message },
    };
  }
  return {
    status: 503,
    body: {
      error: "supabase_unavailable",
      message: "Supabase backend is not configured or reachable.",
    },
  };
}