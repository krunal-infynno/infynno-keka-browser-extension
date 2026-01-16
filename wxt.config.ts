import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    permissions: ["scripting", "tabs", "storage"],
    host_permissions: [
      "https://*.infynno.keka.com/*",
      "https://infynno.keka.com/*",
      "http://*.infynno.keka.com/*",
      "http://infynno.keka.com/*",
    ],
  },
});
