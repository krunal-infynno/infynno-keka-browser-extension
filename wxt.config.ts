import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Infynno Keka Time Tracker",
    version: "1.0.0",
    description: "A simple browser extension to track your work hours and breaks, Along with some useful features!",
    permissions: ["scripting", "tabs", "storage", "notifications", "alarms"],
    host_permissions: [
      "https://*.infynno.keka.com/*",
      "https://infynno.keka.com/*",
      "http://*.infynno.keka.com/*",
      "http://infynno.keka.com/*",
    ],
  },
});
