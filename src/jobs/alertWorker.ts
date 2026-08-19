import cron from "node-cron";
import { prisma } from "../config/db";
import { sendToUser } from "../websocket/app.gateway";

// Checks every 5 minutes: for every enabled ChannelAlertRule, is that
// channel currently ON and has it been ON longer than the configured
// threshold? If so, fire one Notification (guarded by lastAlertedAt so it
// doesn't spam every 5 minutes while the light stays on).
export function startAlertWorker() {
  cron.schedule("*/5 * * * *", async () => {
    const rules = await prisma.channelAlertRule.findMany({
      where: { enabled: true },
      include: { device: { include: { relayChannels: true, room: true } } },
    });

    for (const rule of rules) {
      const channelState = rule.device.relayChannels.find((c: { channel: number }) => c.channel === rule.channel);
      if (!channelState || !channelState.state) continue; // only alert while it's actually ON

      const onSinceMs = Date.now() - channelState.updatedAt.getTime();
      const thresholdMs = rule.thresholdHours * 60 * 60 * 1000;
      if (onSinceMs < thresholdMs) continue;

      // Already alerted for this ON period? (lastAlertedAt is after the
      // moment the channel turned on, so we don't re-fire every 5 minutes.)
      if (rule.lastAlertedAt && rule.lastAlertedAt > channelState.updatedAt) continue;

      const hoursOn = (onSinceMs / (60 * 60 * 1000)).toFixed(1);
      const label = channelState.name || `Channel ${rule.channel}`;

      await prisma.notification.create({
        data: {
          userId: rule.createdBy,
          title: "Device left on",
          body: `${label} in ${rule.device.room.name} has been on for ${hoursOn} hours.`,
          category: "device_status",
        },
      });
      sendToUser(rule.createdBy, { event: "notification.new", category: "device_status" });

      await prisma.channelAlertRule.update({ where: { id: rule.id }, data: { lastAlertedAt: new Date() } });
    }
  });

  console.log("[Job] Alert worker started (checks every 5 minutes)");
}
