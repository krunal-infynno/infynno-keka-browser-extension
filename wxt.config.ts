import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Kivo Time Tracker",
    version: "1.0.0",
    description: "Track daily work hours, manage breaks, and calculate monthly averages with real-time insights for Keka.",
    permissions: ["scripting", "tabs", "storage", "notifications", "alarms"],
    host_permissions: [
      "https://*.keka.com/*",
      "http://*.keka.com/*",
    ],
  },
});
