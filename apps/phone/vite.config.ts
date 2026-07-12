import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Served by the server under /phone/ (registerBundleRoutes).
  base: "/phone/",
  plugins: [react()],
});
