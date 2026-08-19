import cron from "node-cron";
import { prisma } from "../config/db";
import { pushRelayCommand } from "../websocket/device.gateway";
import { broadcastToHomeSubscribers } from "../websocket/app.gateway";

const DAY_CODES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

// Runs every minute; checks enabled schedules whose time + repeat day matches "now".
export function startScheduleWorker() {
  cron.schedule("* * * * *", async () => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const currentTime = `${hh}:${mm}`;
    const todayCode = DAY_CODES[now.getDay()];

    const due = await prisma.schedule.findMany({
      where: {
        enabled: true,
        time: currentTime,
      },
      include: { device: { include: { room: true } } },
    });

    for (const schedule of due) {
      const matchesDay = schedule.isOneTime || schedule.repeatDays.length === 0 || schedule.repeatDays.includes(todayCode);
      if (!matchesDay) continue;

      const isOn = schedule.action === "ON" || schedule.action === "OPEN";

      if (schedule.device.connectionMode === "GLOBAL" && schedule.device.status === "ONLINE") {
        pushRelayCommand(schedule.deviceId, schedule.channel, isOn, `sched-${schedule.id}-${Date.now()}`);
      }

      const channelState = await prisma.relayChannelState.upsert({
        where: { deviceId_channel: { deviceId: schedule.deviceId, channel: schedule.channel } },
        update: { state: isOn },
        create: { deviceId: schedule.deviceId, channel: schedule.channel, state: isOn },
      });

      broadcastToHomeSubscribers(schedule.device.room.homeId, {
        event: "schedule.executed",
        scheduleId: schedule.id,
        deviceId: schedule.deviceId,
        channel: schedule.channel,
        state: channelState.state,
      });

      if (schedule.isOneTime) {
        await prisma.schedule.update({ where: { id: schedule.id }, data: { enabled: false } });
      }

      if (schedule.notifyOnRun) {
        await prisma.notification.create({
          data: {
            userId: schedule.createdBy,
            title: "Schedule ran",
            body: `${schedule.device.name} turned ${schedule.action}`,
            category: "schedule_run",
          },
        });
      }
    }
  });

  console.log("[Job] Schedule worker started (checks every minute)");
}
