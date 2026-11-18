import { handleRequest, processEnquiryEmailQueue, processNotificationOutbox, processPosReceiptOutbox, type Env } from "../../worker/index";

export async function onRequest(context: { request: Request; env: Env; waitUntil(promise: Promise<unknown>): void }): Promise<Response> {
  const response = await handleRequest(context.request, context.env, context);
  // Resume durable enquiry notifications on API traffic. The processor fails closed
  // when its queue or provider configuration is unavailable, without delaying replies.
  context.waitUntil(processEnquiryEmailQueue(context.env));
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    context.waitUntil(processNotificationOutbox(context.env));
  }
  // Drain queued POS receipts on API traffic once their provider is configured.
  context.waitUntil(processPosReceiptOutbox(context.env));
  return response;
}
