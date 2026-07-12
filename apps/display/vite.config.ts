import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Served by the server under /display/ (registerBundleRoutes); asset and
  // sw URLs must resolve under that mount, not the site root.
  base: "/display/",
  // Baked into the bundle so display_join carries the real build version
  // (plan §7 reload-on-mismatch); falls back to "0.0.0-dev" in App.tsx.
  define: {
    __BUILD_VERSION__: JSON.stringify(process.env.BUILD_VERSION ?? "0.0.0-dev"),
  },
  plugins: [react()],
});
