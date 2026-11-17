import { handleRequest, processNotificationOutbox, processPosReceiptOutbox, type Env } from "../../worker/index";

export async function onRequest(context: { request: Request; env: Env; waitUntil(promise: Promise<unknown>): void }): Promise<Response> {
  // Pass the Pages execution context on every API request so queued contact
  // emails can resume after credentials are configured, without delaying replies.
  const response = await handleRequest(context.request, context.env, context);
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    context.waitUntil(processNotificationOutbox(context.env));
  }
  // Drain queued POS receipts on API traffic once their provider is configured.
  context.waitUntil(processPosReceiptOutbox(context.env));
  return response;
}
