import { useState, useEffect } from "react";
import { browser } from "wxt/browser";

interface UseAuthResult {
    accessToken: string | null;
    loading: boolean;
    error: string | null;
}

export const useAuth = (): UseAuthResult => {
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const initializeAuth = async () => {
            try {
                const storedToken = await browser.storage.local.get("access_token");
                if (storedToken.access_token) {
                    setAccessToken(storedToken.access_token as string);
                    setLoading(false);
                    return;
                }

                const kekaTabs = await browser.tabs.query({
                    url: [
                        "*://infynno.keka.com/*",
                        "*://*.infynno.keka.com/*"
                    ]
                });

                if (kekaTabs.length === 0) {
                    setError("Please open infynno.keka.com in a tab and log in");
                    setLoading(false);
                    return;
                }

                const activeTab = kekaTabs.find((tab) => tab.active) || kekaTabs[0];
                const tabId = activeTab.id;

                if (!tabId) {
                    setError("Could not get tab ID");
                    setLoading(false);
                    return;
                }

                const results = await browser.scripting.executeScript({
                    target: { tabId },
                    func: () => localStorage.getItem("access_token"),
                });

                if (results && results[0]?.result) {
                    const token = results[0].result;
                    setAccessToken(token);
                    await browser.storage.local.set({ access_token: token });
                    // Trigger immediate check now that we have a token
                    browser.runtime.sendMessage({ type: "FORCE_CHECK" }).catch(() => { });
                } else {
                    setError("No access token found. Please log in to Keka first.");
                }
            } catch (err) {
                const errorMessage =
                    err instanceof Error ? err.message : "Failed to initialize auth";
                setError(`Error: ${errorMessage}`);
                console.error("Error initializing auth:", err);
            } finally {
                setLoading(false);
            }
        };

        initializeAuth();
    }, []);

    return { accessToken, loading, error };
};
