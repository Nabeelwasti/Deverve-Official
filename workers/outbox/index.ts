import {
  processEnquiryEmailQueue,
  processExpiredCodReservations,
  processNotificationOutbox,
  processPosReceiptOutbox,
  type Env,
} from "../../worker/index";

interface ScheduledController {
  scheduledTime: number;
  cron: string;
}
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

export default {
  scheduled(_controller: ScheduledController, env: Env, context: ExecutionContext) {
    const tasks = [
      processExpiredCodReservations(env),
      processEnquiryEmailQueue(env),
      processNotificationOutbox(env),
      processPosReceiptOutbox(env),
    ];
    context.waitUntil(Promise.allSettled(tasks).then((results) => {
      const failed = results.filter((result) => result.status === "rejected").length;
      console.log(JSON.stringify({
        event: "deverve-outbox-drain",
        completed_at: new Date().toISOString(),
        tasks: results.length,
        failed,
      }));
    }));
  },
};
