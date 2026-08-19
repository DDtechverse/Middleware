import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const deviceTypes = [
  { name: "Smart Switch", category: "switch", capabilities: { onOff: true, gangs: [1, 2, 4, 8] } },
  { name: "Smart Plug", category: "plug", capabilities: { onOff: true, powerMonitoring: true } },
  { name: "Smart Bulb", category: "bulb", capabilities: { onOff: true, brightness: true, color: true } },
  { name: "Smart Fan", category: "fan", capabilities: { onOff: true, speedLevels: 5 } },
  { name: "Smart AC Controller", category: "ac", capabilities: { onOff: true, temperature: true, mode: ["Cool", "Auto", "Swing"] } },
  { name: "Curtain Controller", category: "curtain", capabilities: { openClose: true } },
  { name: "Scene Panel", category: "panel", capabilities: { triggersScenes: true } },
  { name: "Sensor", category: "sensor", capabilities: { motion: true, doorWindow: true, temperature: true } },
  { name: "IP Camera", category: "camera", capabilities: { liveView: true } },
  { name: "Other Device", category: "other", capabilities: {} },
];

async function main() {
  for (const dt of deviceTypes) {
    await prisma.deviceType.upsert({
      where: { name: dt.name },
      update: {},
      create: dt,
    });
  }
  console.log(`Seeded ${deviceTypes.length} device types.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
