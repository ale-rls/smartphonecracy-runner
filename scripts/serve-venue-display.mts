import { buildVenuePlayer } from "../apps/server/src/venue-player.js";
import { resolve } from "node:path";

const mediaDir = resolve(process.env.MEDIA_DIR ?? "venue-media");

const app = await buildVenuePlayer({
  serverUrl: process.env.VENUE_SERVER_URL ?? "https://smartphonocracy-venue-server.enabler.space",
  mediaDir,
});
const port = Number(process.env.PORT ?? 3000);
await app.listen({ host: "127.0.0.1", port });
console.log(`Venue display: http://localhost:${port}/display/`);
console.log(`Local media: ${mediaDir}`);
console.log("Participation and show timing use the live server; media plays from this computer.");
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => void app.close());
