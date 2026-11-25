import { handleRequest, type Env } from "../../worker/index";

export async function onRequest(context: { request: Request; env: Env; waitUntil(promise: Promise<unknown>): void }): Promise<Response> {
  return handleRequest(context.request, context.env, context);
}
