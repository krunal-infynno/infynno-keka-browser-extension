import { useState } from "react";
import "./App.css";
import TodayOverview from "./components/TodayOverview";
import MonthlyOverview from "./components/MonthlyOverview";

import { useAuth } from "./hooks/useAuth";
import { useCurrentMetrics } from "./hooks/useCurrentMetrics";
import { useHalfDay } from "./hooks/useHalfDay";
import { useMonthlyStats } from "./hooks/useMonthlyStats";

function App() {
  const { accessToken, loading: authLoading, error: authError } = useAuth();

  const { isHalfDay, setIsHalfDay } = useHalfDay();

  const {
    metrics,
    isClockedIn,
    leaveTimeInfo,
    timePairs,
    breaks,
    unpairedInEntry,
    loading: metricsLoading,
    error: metricsError
  } = useCurrentMetrics(isHalfDay);
  const [activeTab, setActiveTab] = useState<"today" | "monthly">("today");

  const monthlyStats = useMonthlyStats(accessToken, activeTab);

  // Combine loading/error states appropriately
  const appLoading = authLoading || (activeTab === "today" && metricsLoading);
  const appError = authError || (activeTab === "today" ? metricsError : null);

  return (
    <div className="popup-container">
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
          setIsHalfDay={setIsHalfDay}
          leaveTimeInfo={leaveTimeInfo}
          timePairs={timePairs}
          breaks={breaks}
          unpairedInEntry={unpairedInEntry}
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
    </div>
  );
}

export default App;
