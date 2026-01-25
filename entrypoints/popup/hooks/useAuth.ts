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

                const { keka_domain } = await browser.storage.local.get("keka_domain");
                const domain = (keka_domain as string) || "infynno.keka.com";
                const hostname = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');

                const kekaTabs = await browser.tabs.query({
                    url: [
                        `*://${hostname}/*`,
                        `*://*.${hostname}/*`
                    ]
                });

                let currentAccessToken = storedToken.access_token;

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
                                // If we found a token, update our local tracker
                                currentAccessToken = token;

                                // If it's different (or we didn't have one), update storage/state
                                if (token !== storedToken.access_token) {
                                    setAccessToken(token);
                                    await browser.storage.local.set({ access_token: token });
                                    // Trigger immediate check now that we have a fresh token
                                    browser.runtime.sendMessage({ type: "FORCE_CHECK" }).catch(() => { });
                                }
                            }
                        } catch (scriptError) {
                            console.warn("Failed to extract token from tab", scriptError);
                        }
                    }
                }

                // If after all this we still don't have a token
                if (!currentAccessToken && kekaTabs.length === 0) {
                    setError(`Please open ${domain} in a tab and log in`);
                } else if (!currentAccessToken) {
                    // We had tabs but couldn't get token
                    if (kekaTabs.length === 0) {
                        // This block was technically dead code in the original structure if strictly logical, 
                        // but we'll keep the error setting intent just in case.
                        // However, if we are here, kekaTabs.length > 0.
                    }
                    setError(`Please open Keka in a tab and log in`);
                    setLoading(false);
                    return;
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
