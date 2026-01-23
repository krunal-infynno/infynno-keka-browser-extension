import { useState, useEffect } from "react";
import { browser } from "wxt/browser";

// ... (imports remain)
interface SettingsProps {
    isHalfDay: boolean;
    setIsHalfDay: (value: boolean) => void;
}

export default function Settings({ isHalfDay, setIsHalfDay }: SettingsProps) {
    const [notificationsEnabled, setNotificationsEnabled] = useState(false);
    const [domain, setDomain] = useState("infynno.keka.com");
    const [loading, setLoading] = useState(true);
    const [saveStatus, setSaveStatus] = useState<string>("");

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const { notifications_enabled, keka_domain } = await browser.storage.local.get(["notifications_enabled", "keka_domain"]);
                setNotificationsEnabled(!!notifications_enabled);
                if (keka_domain) {
                    setDomain(keka_domain as string);
                }
            } catch (error) {
                console.error("Error loading settings:", error);
            } finally {
                setLoading(false);
            }
        };
        loadSettings();
    }, []);

    const handleSaveDomain = async () => {
        try {
            await browser.storage.local.set({ keka_domain: domain });
            setSaveStatus("Saved!");
            setTimeout(() => setSaveStatus(""), 2000);
        } catch (error) {
            console.error("Error saving domain:", error);
            setSaveStatus("Error saving");
        }
    };

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
                <div className="settings-row" style={{ marginBottom: "16px", display: "block" }}>
                    <div className="settings-label">Keka Domain</div>
                    <div className="settings-description" style={{ marginBottom: "8px" }}>
                        Your organization's Keka URL
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                        <input
                            type="text"
                            value={domain}
                            onChange={(e) => setDomain(e.target.value)}
                            placeholder="yourcompany.keka.com"
                            style={{
                                flex: 1,
                                padding: "8px",
                                borderRadius: "6px",
                                border: "1px solid #e2e8f0",
                                fontSize: "14px",
                                backgroundColor: "#f8fafc",
                                outline: "none"
                            }}
                        />
                        <button
                            onClick={handleSaveDomain}
                            style={{
                                padding: "8px 16px",
                                borderRadius: "6px",
                                border: "none",
                                backgroundColor: "#3b82f6",
                                color: "white",
                                cursor: "pointer",
                                fontSize: "14px",
                                fontWeight: 500
                            }}
                        >
                            {saveStatus || "Save"}
                        </button>
                    </div>
                </div>

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
