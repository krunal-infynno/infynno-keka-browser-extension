import { useState } from "react";
import "./App.css";
import TodayOverview from "./components/TodayOverview";
import MonthlyOverview from "./components/MonthlyOverview";
import Settings from "./components/Settings";
import Setup from "./components/Setup";
import { browser } from "wxt/browser";

import { useAuth } from "./hooks/useAuth";
import { useCurrentMetrics } from "./hooks/useCurrentMetrics";
import { useHalfDay } from "./hooks/useHalfDay";
import { useMonthlyStats } from "./hooks/useMonthlyStats";
import { useWeeklyStats } from "./hooks/useWeeklyStats";
import WeeklyOverview from "./components/WeeklyOverview";

function App() {
  const { accessToken, loading: authLoading, error: authError } = useAuth();

  // View State: 'main' or 'settings' or 'setup'
  const [activeView, setActiveView] = useState<
    "main" | "settings" | "setup" | "loading"
  >("loading");

  useEffect(() => {
    const checkSetup = async () => {
      const { keka_domain } = await browser.storage.local.get("keka_domain");
      if (keka_domain) {
        setActiveView("main");
      } else {
        setActiveView("setup");
      }
    };
    checkSetup();
  }, []);

  const { isHalfDay, setIsHalfDay } = useHalfDay();

  const {
    metrics,
    isClockedIn,
    leaveTimeInfo,
    timePairs,
    breaks,
    unpairedInEntry,
    loading: metricsLoading,
    error: metricsError,
    totalWorkedMinutes,
  } = useCurrentMetrics(isHalfDay);

  const [activeTab, setActiveTab] = useState<"today" | "weekly" | "monthly">(
    "today",
  );

  const monthlyStats = useMonthlyStats(accessToken);
  const weeklyStats = useWeeklyStats(accessToken, isHalfDay);

  // Combine loading/error states appropriately
  const appLoading = authLoading || (activeTab === "today" && metricsLoading);
  // If we have an auth error, we shouldn't even try to show metrics error yet
  const appError = activeTab === "today" ? metricsError : null;

  if (activeView === "loading") {
    return <div className="loading">Loading configuration...</div>;
  }

  if (activeView === "setup") {
    return <Setup onComplete={() => setActiveView("main")} />;
  }

  return (
    <div className="popup-container">
      {/* Header Area */}
      <header className="header">
        <div className="header-title">
          <img src="/icon/32.png" alt="logo" className="header-logo" />
          <span>{activeView === "settings" ? "Settings" : "Kivo"}</span>
        </div>
        <button
          className="icon-button"
          onClick={() =>
            setActiveView(activeView === "main" ? "settings" : "main")
          }
          title={activeView === "settings" ? "Back to Dashboard" : "Settings"}
        >
          {activeView === "settings" ? "✕" : "⚙️"}
        </button>
      </header>

      {/* Main Dashboard View */}
      {activeView === "main" && (
        <>
          {/* Auth Check Block */}
          {!accessToken && !authLoading ? (
            <div className="auth-error-container">
              <div className="auth-error-icon">🔒</div>
              <div className="auth-error-message">Authentication Required</div>
              <div className="auth-error-subtext">
                {authError || "Please log in to Keka in a new tab to continue."}
              </div>
            </div>
          ) : (
            <>
              {isClockedIn && (
                <div className="alert-banner clocked-in">
                  <span className="alert-icon">⚠️</span>
                  <span className="alert-text">
                    You're currently clocked in
                  </span>
                </div>
              )}

              <div className="tabs-container">
                <button
                  className={`tab-button ${
                    activeTab === "today" ? "active" : ""
                  }`}
                  onClick={(e) => {
                    setActiveTab("today");
                    e.currentTarget.blur();
                  }}
                >
                  Today
                </button>
                <button
                  className={`tab-button ${
                    activeTab === "weekly" ? "active" : ""
                  }`}
                  onClick={(e) => {
                    setActiveTab("weekly");
                    e.currentTarget.blur();
                  }}
                >
                  Weekly
                </button>
                <button
                  className={`tab-button ${
                    activeTab === "monthly" ? "active" : ""
                  }`}
                  onClick={(e) => {
                    setActiveTab("monthly");
                    e.currentTarget.blur();
                  }}
                >
                  Monthly
                </button>
              </div>

              {activeTab === "today" && (
                <TodayOverview
                  loading={appLoading}
                  error={appError}
                  metrics={metrics}
                  isHalfDay={isHalfDay}
                  leaveTimeInfo={leaveTimeInfo}
                  timePairs={timePairs}
                  breaks={breaks}
                  unpairedInEntry={unpairedInEntry}
                  totalWorkedMinutes={totalWorkedMinutes}
                  hoursNeededPerDay={weeklyStats.hoursNeededPerDay}
                />
              )}

              {activeTab === "weekly" && (
                <WeeklyOverview
                  loading={weeklyStats.loading}
                  weeklyTarget={weeklyStats.weeklyTarget}
                  totalWorked={weeklyStats.totalWorked}
                  remaining={weeklyStats.remaining}
                  averageHours={weeklyStats.averageHours}
                  hoursNeededPerDay={weeklyStats.hoursNeededPerDay}
                  holidaysCount={weeklyStats.holidays.length}
                  leaveDaysCount={weeklyStats.leaveDaysCount}
                  totalWorkingDays={weeklyStats.totalWorkingDays}
                  currentWorkingDay={weeklyStats.currentWorkingDay}
                  remainingWorkingDays={weeklyStats.remainingWorkingDays}
                />
              )}

              {activeTab === "monthly" && (
                <MonthlyOverview
                  loading={monthlyStats.loading}
                  totalWorkingDays={monthlyStats.totalWorkingDays}
                  currentWorkingDay={monthlyStats.currentWorkingDay}
                  remainingWorkingDays={monthlyStats.remainingWorkingDays}
                  averageHours={monthlyStats.averageHours}
                  hoursNeededPerDay={monthlyStats.hoursNeededPerDay}
                  holidaysCount={monthlyStats.holidays.length}
                  leaveDaysCount={monthlyStats.leaveDaysCount}
                />
              )}
            </>
          )}
        </>
      )}

      {/* Settings View */}
      {activeView === "settings" && (
        <Settings isHalfDay={isHalfDay} setIsHalfDay={setIsHalfDay} />
      )}
    </div>
  );
}

export default App;
