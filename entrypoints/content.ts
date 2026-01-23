export default defineContentScript({
  matches: ["*://*.keka.com/*"],
  main() {
    // Listen for messages from popup requesting access_token
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === "getAccessToken") {
        try {
          const accessToken = localStorage.getItem("access_token");
          sendResponse({ success: true, accessToken });
        } catch (error) {
          sendResponse({ success: false, error: String(error) });
        }
        return true; // Keep the message channel open for async response
      }
    });
  },
});
