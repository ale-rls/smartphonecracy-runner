import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Served by the server under /display/ (registerBundleRoutes); asset and
  // sw URLs must resolve under that mount, not the site root.
  base: "/display/",
  plugins: [react()],
});
