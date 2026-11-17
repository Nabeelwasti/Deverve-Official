import { handleRequest, processEnquiryEmailQueue, processNotificationOutbox, type Env } from "../../worker/index";

export async function onRequest(context: { request: Request; env: Env; waitUntil(promise: Promise<unknown>): void }): Promise<Response> {
  const isMutation = context.request.method !== "GET" && context.request.method !== "HEAD";
  // Pass the Pages execution context only for writes. The Worker uses it to
  // enqueue the enquiry-email dispatcher without delaying the customer response.
  const response = await handleRequest(context.request, context.env, isMutation ? context : undefined);
  if (isMutation) {
    context.waitUntil(processNotificationOutbox(context.env));
  }
  return response;
}
