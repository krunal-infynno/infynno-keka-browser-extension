import { useState } from "react";
import "./App.css";
import TodayOverview from "./components/TodayOverview";
import MonthlyOverview from "./components/MonthlyOverview";
import Settings from "./components/Settings";

import { useAuth } from "./hooks/useAuth";
import { useCurrentMetrics } from "./hooks/useCurrentMetrics";
import { useHalfDay } from "./hooks/useHalfDay";
import { useMonthlyStats } from "./hooks/useMonthlyStats";

function App() {
  const { accessToken, loading: authLoading, error: authError } = useAuth();

  // View State: 'main' or 'settings'
  const [activeView, setActiveView] = useState<"main" | "settings">("main");

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

  const [activeTab, setActiveTab] = useState<"today" | "monthly">("today");

  const monthlyStats = useMonthlyStats(accessToken);

  // Combine loading/error states appropriately
  const appLoading = authLoading || (activeTab === "today" && metricsLoading);
  const appError = authError || (activeTab === "today" ? metricsError : null);

  return (
    <div className="popup-container">
      {/* Header Area */}
      <header className="header">
        <div className="header-title">
          <span className="header-logo">🚀</span>
          <span>{activeView === "settings" ? "Settings" : "Keka Pro"}</span>
        </div>
        <button
          className="icon-button"
          onClick={() => setActiveView(activeView === "main" ? "settings" : "main")}
          title={activeView === "settings" ? "Back to Dashboard" : "Settings"}
        >
          {activeView === "settings" ? "✕" : "⚙️"}
        </button>
      </header>

      {/* Main Dashboard View */}
      {activeView === "main" && (
        <>
          {isClockedIn && (
            <div className="alert-banner clocked-in">
              <span className="alert-icon">⚠️</span>
              <span className="alert-text">You're currently clocked in</span>
            </div>
          )}

          <div className="tabs-container">
            <button
              className={`tab-button ${activeTab === "today" ? "active" : ""}`}
              onClick={(e) => {
                setActiveTab("today");
                e.currentTarget.blur();
              }}
            >
              Today's Overview
            </button>
            <button
              className={`tab-button ${activeTab === "monthly" ? "active" : ""}`}
              onClick={(e) => {
                setActiveTab("monthly");
                e.currentTarget.blur();
              }}
            >
              Monthly Overview
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
              hoursNeededPerDay={monthlyStats.hoursNeededPerDay}
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

      {/* Settings View */}
      {activeView === "settings" && (
        <Settings isHalfDay={isHalfDay} setIsHalfDay={setIsHalfDay} />
      )}
    </div>
  );
}

export default App;
