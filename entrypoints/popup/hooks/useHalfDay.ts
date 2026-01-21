import { useState, useEffect } from "react";
import { browser } from "wxt/browser";

export const useHalfDay = () => {
    const [isHalfDay, setIsHalfDay] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        const loadHalfDayState = async () => {
            try {
                const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
                const key = `halfDay_${today}`;
                const result = await browser.storage.local.get(key);
                if (result[key] !== undefined) {
                    setIsHalfDay(!!result[key]);
                }
                setIsLoaded(true);
            } catch (err) {
                console.error("Error loading half day state:", err);
                setIsLoaded(true);
            }
        };
        loadHalfDayState();
    }, []);

    useEffect(() => {
        if (!isLoaded) return;

        const saveHalfDayState = async () => {
            try {
                const today = new Date().toISOString().split("T")[0];
                const key = `halfDay_${today}`;
                await browser.storage.local.set({ [key]: isHalfDay });
                // Notify background to update calculations if needed
                // browser.runtime.sendMessage({ type: 'FORCE_CHECK' }); 
                // Ideally we should tell background to re-check
            } catch (err) {
                console.error("Error saving half day state:", err);
            }
        };
        saveHalfDayState();
    }, [isHalfDay, isLoaded]);

    return { isHalfDay, setIsHalfDay };
};
