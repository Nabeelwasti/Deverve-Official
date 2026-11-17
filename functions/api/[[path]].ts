import { handleRequest, processEnquiryEmailQueue, processNotificationOutbox, processPosReceiptOutbox, type Env } from "../../worker/index";

export async function onRequest(context: { request: Request; env: Env; waitUntil(promise: Promise<unknown>): void }): Promise<Response> {
  const isMutation = context.request.method !== "GET" && context.request.method !== "HEAD";
  // Enquiry emails are queued by public writes; pass the Pages execution context
  // so delivery runs after the response without delaying the customer.
  const response = await handleRequest(context.request, context.env, isMutation ? context : undefined);
  if (isMutation) {
    context.waitUntil(processNotificationOutbox(context.env));
  }
  // Receipt delivery may have been queued earlier while provider credentials were
  // absent. Drain due receipts on API traffic once the owner configures providers.
  context.waitUntil(processPosReceiptOutbox(context.env));
  return response;
}
