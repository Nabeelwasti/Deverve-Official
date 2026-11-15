import { handleRequest, processNotificationOutbox, type Env } from "../../worker/index";

export async function onRequest(context: { request: Request; env: Env; waitUntil(promise: Promise<unknown>): void }): Promise<Response> {
  const response = await handleRequest(context.request, context.env);
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    context.waitUntil(processNotificationOutbox(context.env));
  }
  return response;
}
