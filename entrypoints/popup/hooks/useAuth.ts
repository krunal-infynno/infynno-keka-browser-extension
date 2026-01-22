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
                }

                // But ALWAYS try to get a fresh one from the tab, because Keka tokens expire daily
                const kekaTabs = await browser.tabs.query({
                    url: [
                        "*://infynno.keka.com/*",
                        "*://*.infynno.keka.com/*"
                    ]
                });

                if (kekaTabs.length > 0) {
                    const activeTab = kekaTabs.find((tab) => tab.active) || kekaTabs[0];
                    const tabId = activeTab.id;

                    if (tabId) {
                        try {
                            const results = await browser.scripting.executeScript({
                                target: { tabId },
                                func: () => localStorage.getItem("access_token"),
                            });

                            if (results && results[0]?.result) {
                                const token = results[0].result;
                                // If we found a token, and it's different (or we didn't have one), update it
                                if (token !== storedToken.access_token) {
                                    setAccessToken(token);
                                    await browser.storage.local.set({ access_token: token });
                                    // Trigger immediate check now that we have a fresh token
                                    browser.runtime.sendMessage({ type: "FORCE_CHECK" }).catch(() => { });
                                } else if (!storedToken.access_token) {
                                    // Case where we didn't have stored, but found one and they are same? No, stored was null.
                                    // Should be covered by above if (token !== storedToken.access_token)
                                }
                            }
                        } catch (scriptError) {
                            console.warn("Failed to extract token from tab", scriptError);
                        }
                    }
                }

                // If after all this we still don't have a token (and didn't set it from storage)
                if (!accessToken && !storedToken.access_token && kekaTabs.length === 0) {
                    setError("Please open infynno.keka.com in a tab and log in");
                } else if (!accessToken && !storedToken.access_token) {
                    // We had tabs but couldn't get token?
                    // Or maybe we haven't set accessToken yet in this render cycle?
                    // We can't easily check 'accessToken' state here closure-wise, so rely on 'storedToken' var
                    // logic is a bit tricky with react state.
                    // But we setAccessToken above.
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

        // Listen for token updates from background script
        const handleStorageChange = (changes: Record<string, any>, areaName: string) => {
            if (areaName === "local" && changes.access_token?.newValue) {
                setAccessToken(changes.access_token.newValue);
            }
        };
        browser.storage.onChanged.addListener(handleStorageChange);
        return () => browser.storage.onChanged.removeListener(handleStorageChange);
    }, []);

    return { accessToken, loading, error };
};
