import dotenv from "dotenv";
import dns from "dns";
import { connectDB, closeDB } from "./utils/db.js";
import { queueDueReminders } from "./services/reminders.js";
import { sendQueuedEmails } from "./services/mail.js";
import { appUrl } from "./utils/appUrl.js";
import { syncDueResults } from "./services/resultSync.js";

dotenv.config();
const configuredDns = process.env.DNS_SERVERS?.split(",").map((server) => server.trim()).filter(Boolean);
if (configuredDns?.length) dns.setServers(configuredDns);
else if (dns.getServers().every((server) => server === "127.0.0.1" || server === "::1")) dns.setServers(["1.1.1.1", "8.8.8.8"]);
async function run() {
  appUrl();
  await connectDB();
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      try {
        await queueDueReminders();
        await sendQueuedEmails();
      } catch (error) {
        console.error("Notification worker tick failed:", error);
      }
      try {
        await syncDueResults();
      } catch (error) {
        console.error("Result worker tick failed:", error);
      }
    } finally {
      running = false;
    }
  };
  await tick();
  if (process.argv.includes("--once")) {
    await closeDB();
    return;
  }
  const timer = setInterval(tick, 60_000);
  const stop = async () => { clearInterval(timer); await closeDB(); process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
run().catch((error) => { console.error("Worker startup failed:", error); process.exit(1); });
