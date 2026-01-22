import { useState, useEffect } from "react";
import { browser } from "wxt/browser";

// ... (imports remain)
interface SettingsProps {
    isHalfDay: boolean;
    setIsHalfDay: (value: boolean) => void;
}

export default function Settings({ isHalfDay, setIsHalfDay }: SettingsProps) {
    const [notificationsEnabled, setNotificationsEnabled] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const { notifications_enabled } = await browser.storage.local.get("notifications_enabled");
                setNotificationsEnabled(!!notifications_enabled);
            } catch (error) {
                console.error("Error loading settings:", error);
            } finally {
                setLoading(false);
            }
        };
        loadSettings();
    }, []);

    const toggleNotifications = async () => {
        try {
            const newState = !notificationsEnabled;
            setNotificationsEnabled(newState);
            await browser.storage.local.set({ notifications_enabled: newState });
        } catch (error) {
            console.error("Error saving settings:", error);
            // Revert state on error
            setNotificationsEnabled(!notificationsEnabled);
        }
    };

    if (loading) {
        return <div className="loading">Loading settings...</div>;
    }

    return (
        <div className="settings-view popup-container">
            <div className="settings-section">
                <div className="settings-row" style={{ marginBottom: "16px" }}>
                    <div>
                        <div className="settings-label">Enable Notifications</div>
                        <div className="settings-description">
                            Get alerts for targets, breaks, and overtime
                        </div>
                    </div>
                    <div className="toggle-wrapper">
                        <label className="toggle-label">
                            <input
                                type="checkbox"
                                className="toggle-switch"
                                checked={notificationsEnabled}
                                onChange={toggleNotifications}
                            />
                        </label>
                    </div>
                </div>

                <div className="settings-row">
                    <div>
                        <div className="settings-label">
                            Half Day {isHalfDay && <>| <b>Enjoy!!</b></>}
                        </div>
                        <div className="settings-description">
                            Toggle it on if today is your half day.
                        </div>
                    </div>
                    <div className="toggle-wrapper">
                        <label className="toggle-label">
                            <input
                                type="checkbox"
                                className="toggle-switch"
                                checked={isHalfDay}
                                onChange={(e) => setIsHalfDay(e.target.checked)}
                            />
                        </label>
                    </div>
                </div>
            </div>

            {/* Placeholder for future settings */}
            {/* <div className="settings-section">
        <div className="settings-label">About</div>
        <div className="settings-description">Keka Extension v1.0.0</div>
      </div> */}
        </div>
    );
}
