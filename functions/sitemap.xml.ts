import { sitemapResponse, type Env } from "../worker/index";

export async function onRequest(context: { env: Env }): Promise<Response> {
  return sitemapResponse(context.env);
}
