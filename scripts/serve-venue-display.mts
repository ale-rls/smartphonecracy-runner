import { buildVenuePlayer } from "../apps/server/src/venue-player.js";

const app = await buildVenuePlayer({
  serverUrl: process.env.VENUE_SERVER_URL ?? "https://smartphonocracy-server.enabler.space",
  mediaDir: process.env.MEDIA_DIR ?? "/Volumes/SANDISK SSD/Smartphonocracy/Masters/runner-fullHD",
});
const port = Number(process.env.PORT ?? 3000);
await app.listen({ host: "127.0.0.1", port });
console.log(`Venue display: http://localhost:${port}/display/`);
console.log("Participation and show timing use the live server; media plays from the SSD.");
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => void app.close());
