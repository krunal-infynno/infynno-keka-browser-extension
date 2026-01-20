import { useState, useEffect } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isSameMonth,
  parseISO,
} from "date-fns";
import "./App.css";
import type { Metrics, LeaveTimeInfo } from "./types";

function App() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [leaveTimeInfo, setLeaveTimeInfo] = useState<LeaveTimeInfo | null>(
    null
  );
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [totalWorkedMinutes, setTotalWorkedMinutes] = useState(0);
  const [isHalfDayLoaded, setIsHalfDayLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<"today" | "monthly">("today");
  const [holidays, setHolidays] = useState<string[]>([]);
  const [leaveDaysCount, setLeaveDaysCount] = useState<number>(0);
  const [totalWorkingDays, setTotalWorkingDays] = useState<number | null>(null);
  const [currentWorkingDay, setCurrentWorkingDay] = useState<number | null>(
    null
  );
  const [remainingWorkingDays, setRemainingWorkingDays] = useState<
    number | null
  >(null);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [averageHours, setAverageHours] = useState<number | null>(null);
  const [hoursNeededPerDay, setHoursNeededPerDay] = useState<number | null>(
    null
  );

  // Load half day state for current day
  useEffect(() => {
    const loadHalfDayState = async () => {
      try {
        const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
        const key = `halfDay_${today}`;
        const result = await browser.storage.local.get(key);
        if (result[key] !== undefined) {
          setIsHalfDay(!!result[key]);
        }
        setIsHalfDayLoaded(true);
      } catch (err) {
        console.error("Error loading half day state:", err);
        setIsHalfDayLoaded(true);
      }
    };
    loadHalfDayState();
  }, []);

  // Save half day state when it changes (but not on initial load)
  useEffect(() => {
    if (!isHalfDayLoaded) return; // Don't save until we've loaded the initial state

    const saveHalfDayState = async () => {
      try {
        const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
        const key = `halfDay_${today}`;
        await browser.storage.local.set({ [key]: isHalfDay });
      } catch (err) {
        console.error("Error saving half day state:", err);
      }
    };
    saveHalfDayState();
  }, [isHalfDay, isHalfDayLoaded]);

  useEffect(() => {
    const initializePopup = async () => {
      try {
        // Try to get access token from storage (set by background)
        const storedToken = await browser.storage.local.get('access_token');
        if (storedToken.access_token) {
          setAccessToken(storedToken.access_token as string);
        } else {
          // Fallback: try to get token from Keka tab
          const allTabs = await browser.tabs.query({});
          const kekaTabs = allTabs.filter(
            (tab) =>
              tab.url &&
              (tab.url.includes("infynno.keka.com") ||
                tab.url.includes("*.infynno.keka.com"))
          );

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
            // Store token for background service
            await browser.storage.local.set({ access_token: token });
          } else {
            setError("No access token found. Please log in to Keka first.");
            setLoading(false);
            return;
          }
        }

        // Load current metrics from storage (calculated by background)
        await loadCurrentMetrics();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to initialize";
        setError(`Error: ${errorMessage}`);
        console.error("Error initializing popup:", err);
        setLoading(false);
      }
    };

    const loadCurrentMetrics = async () => {
      try {
        const storedData = await browser.storage.local.get([
          'current_metrics',
          'current_total_worked_minutes',
          'current_is_clocked_in',
          'current_leave_time_info',
          'last_updated'
        ]);

        if (storedData.current_metrics) {
          setMetrics(storedData.current_metrics as Metrics);
          setTotalWorkedMinutes((storedData.current_total_worked_minutes as number) || 0);
          setIsClockedIn(!!(storedData.current_is_clocked_in as boolean));
          setLeaveTimeInfo(storedData.current_leave_time_info as LeaveTimeInfo | null);

          // Check if data is recent (within last 5 minutes)
          const lastUpdated = storedData.last_updated as number;
          if (lastUpdated && Date.now() - lastUpdated > 5 * 60 * 1000) {
            // Data is stale, trigger background check
            browser.runtime.sendMessage({ type: 'FORCE_CHECK' }).catch(() => {
              // Ignore errors if background is not available
            });
          }
        }

        setLoading(false);
      } catch (error) {
        console.error("Error loading metrics:", error);
        setLoading(false);
      }
    };

    initializePopup();
  }, []);



  // Fetch holidays and calculate working days for monthly overview
  useEffect(() => {
    const fetchHolidaysAndCalculateWorkingDays = async () => {
      if (!accessToken || activeTab !== "monthly") return;

      setMonthlyLoading(true);
      try {
        // Fetch attendance data for monthly calculations
        const attendanceResponse = await fetch(
          "https://infynno.keka.com/k/attendance/api/mytime/attendance/summary",
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (!attendanceResponse.ok) {
          throw new Error("Failed to fetch attendance data");
        }

        const attendanceDataResponse = await attendanceResponse.json();
        const attendanceData = attendanceDataResponse.data || [];
        // Fetch holidays
        const holidaysResponse = await fetch(
          "https://infynno.keka.com/k/dashboard/api/dashboard/holidays",
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (!holidaysResponse.ok) {
          throw new Error("Failed to fetch holidays");
        }

        const holidaysData = await holidaysResponse.json();
        const holidayDates: string[] = [];
        const now = new Date();
        const monthStart = startOfMonth(now);
        const monthEnd = endOfMonth(now);

        if (holidaysData.data && Array.isArray(holidaysData.data)) {
          holidaysData.data.forEach((holiday: any) => {
            if (holiday.date) {
              const holidayDate = parseISO(holiday.date);
              // Only include holidays that fall within the current month
              if (isSameMonth(holidayDate, now)) {
                holidayDates.push(holiday.date);
              }
            }
          });
        }

        setHolidays(holidayDates);

        // Fetch leave data to subtract taken leaves
        const leaveDates = new Set<string>();
        let leaveCount = 0;
        try {
          // Format current date as YYYY-MM-DD for the API
          const currentDateStr = format(now, "yyyy-MM-dd");
          const leaveResponse = await fetch(
            `https://infynno.keka.com/k/leave/api/me/leave/summary?forDate=${currentDateStr}`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
            }
          );

          if (leaveResponse.ok) {
            const leaveData = await leaveResponse.json();
            if (
              leaveData.data &&
              leaveData.data.leaveHistory &&
              Array.isArray(leaveData.data.leaveHistory)
            ) {
              // Filter for current month and negative durations (taken leaves)
              leaveData.data.leaveHistory.forEach(
                (leaveEntry: any) => {
                  if (
                    leaveEntry.date &&
                    leaveEntry.change &&
                    leaveEntry.change.duration < 0
                  ) {
                    const leaveDate = parseISO(leaveEntry.date);
                    // Only count leaves in current month
                    if (isSameMonth(leaveDate, now)) {
                      // Track the leave date (format: "yyyy-MM-dd")
                      leaveDates.add(leaveEntry.date);
                      // Count the number of days taken (absolute value of negative duration)
                      leaveCount += Math.abs(leaveEntry.change.duration);
                    }
                  }
                }
              );
            }
          }
        } catch (err) {
          console.error("Error fetching leave data:", err);
          // Continue with calculation even if leave fetch fails
        }
        setLeaveDaysCount(leaveCount);

        // Calculate working days for current month
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

        // Filter weekdays (Monday = 1, Friday = 5)
        const weekdays = allDays.filter((day) => {
          const dayOfWeek = getDay(day);
          // getDay returns 0 (Sunday) to 6 (Saturday)
          // We want Monday (1) to Friday (5)
          return dayOfWeek >= 1 && dayOfWeek <= 5;
        });

        // Filter out holidays and leaves
        const allWorkingDays = weekdays.filter((day) => {
          const dayStr = format(day, "yyyy-MM-dd");
          return !holidayDates.includes(dayStr) && !leaveDates.has(dayStr);
        });

        // Total working days (all working days in month minus holidays and leaves)
        const totalWorkingDaysCount = allWorkingDays.length;
        setTotalWorkingDays(totalWorkingDaysCount);

        // Current working day (working days before today, excluding today and leaves)
        const currentWorkingDayCount = allWorkingDays.filter((day) => {
          const dayDate = new Date(day);
          dayDate.setHours(0, 0, 0, 0);
          return dayDate < today;
        }).length;
        setCurrentWorkingDay(currentWorkingDayCount);

        // Remaining working days (total - current)
        const remainingWorkingDaysCount =
          totalWorkingDaysCount - currentWorkingDayCount;
        setRemainingWorkingDays(remainingWorkingDaysCount);

        // Calculate average hours from attendance data
        // Use totalEffectiveHours from API, divide by current working day
        if (
          attendanceData &&
          attendanceData.length > 0 &&
          currentWorkingDayCount > 0
        ) {
          const now = new Date();
          const today = new Date(now);
          today.setHours(0, 0, 0, 0);
          const currentMonth = now.getMonth();
          const currentYear = now.getFullYear();

          // Filter attendance data for current month
          const monthlyAttendance = attendanceData.filter((entry: any) => {
            if (!entry.attendanceDate) return false;
            const entryDate = new Date(entry.attendanceDate);
            entryDate.setHours(0, 0, 0, 0);
            return (
              entryDate.getMonth() === currentMonth &&
              entryDate.getFullYear() === currentYear &&
              entryDate <= today
            );
          });

          // Sum totalEffectiveHours from API
          let totalHours = 0;

          monthlyAttendance.forEach((entry: any) => {
            if (
              entry.totalEffectiveHours !== undefined &&
              entry.totalEffectiveHours !== null
            ) {
              totalHours += entry.totalEffectiveHours;
            }
          });

          // Calculate average: divide by current working day
          const daysToDivideBy = currentWorkingDayCount;
          const avgHours = daysToDivideBy > 0 ? totalHours / daysToDivideBy : 0;
          setAverageHours(avgHours);

          // Calculate hours needed per remaining day to achieve 8h 15m average
          if (
            remainingWorkingDaysCount > 0 &&
            totalWorkingDaysCount > 0 &&
            daysToDivideBy > 0 &&
            avgHours > 0
          ) {
            const TARGET_AVERAGE_HOURS = 8.25; // 8h 15m = 8.25 hours
            const totalHoursNeeded =
              totalWorkingDaysCount * TARGET_AVERAGE_HOURS;
            // Use the average we calculated multiplied by days worked
            // This ensures we use the same calculation method as the displayed average
            const hoursWorkedSoFar = avgHours * daysToDivideBy;
            const hoursRemaining = totalHoursNeeded - hoursWorkedSoFar;
            const hoursPerRemainingDay =
              hoursRemaining / remainingWorkingDaysCount;

            // Debug log for hours calculation
            console.log("Hours needed calc:", {
              avg: `${Math.floor(avgHours)}h ${Math.round(
                (avgHours % 1) * 60
              )}m`,
              daysWorked: daysToDivideBy,
              totalNeeded: totalHoursNeeded.toFixed(2),
              worked: hoursWorkedSoFar.toFixed(2),
              remaining: hoursRemaining.toFixed(2),
              perDay: `${Math.floor(hoursPerRemainingDay)}h ${Math.round(
                (hoursPerRemainingDay % 1) * 60
              )}m`,
            });

            setHoursNeededPerDay(
              hoursPerRemainingDay > 0 ? hoursPerRemainingDay : 0
            );
          } else {
            setHoursNeededPerDay(null);
          }
        } else {
          setAverageHours(null);
          setHoursNeededPerDay(null);
        }
      } catch (err) {
        console.error("Error fetching holidays:", err);
        setTotalWorkingDays(null);
        setCurrentWorkingDay(null);
        setRemainingWorkingDays(null);
        setAverageHours(null);
        setHoursNeededPerDay(null);
      } finally {
        setMonthlyLoading(false);
      }
    };

    fetchHolidaysAndCalculateWorkingDays();
  }, [accessToken, activeTab]);

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
        <>
          {loading ? (
            <p className="loading">Loading attendance data...</p>
          ) : error ? (
            <p className="error">{error}</p>
          ) : metrics ? (
            <>
              <div className="toggle-container">
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    className="toggle-switch"
                    checked={isHalfDay}
                    onChange={(e) => setIsHalfDay(e.target.checked)}
                  />
                  <span className="toggle-text">Half Day</span>
                </label>
              </div>
              <div className="metrics-row">
                <div
                  className={`metric-card total-worked-${metrics.totalWorkedStatus}`}
                >
                  <div className="metric-label">Total Worked</div>
                  <div className="metric-value">{metrics.totalWorked}</div>
                  {metrics.isOvertime && (
                    <div className="overtime-indicator">
                      Overtime: {Math.floor(metrics.overtimeMinutes / 60)}h{" "}
                      {metrics.overtimeMinutes % 60}m
                    </div>
                  )}
                </div>
                <div
                  className={`metric-card ${metrics.isCompleted
                      ? "completed"
                      : metrics.isCloseToCompletion
                        ? "warning"
                        : ""
                    }`}
                >
                  <div className="metric-label">Remaining</div>
                  <div className="metric-value">{metrics.remaining}</div>
                </div>
                <div
                  className={`metric-card ${metrics.isCompleted
                      ? "completed"
                      : metrics.isCloseToCompletion
                        ? "warning"
                        : ""
                    }`}
                >
                  <div className="metric-label">Est. Completion</div>
                  <div className="metric-value">{metrics.estCompletion}</div>
                </div>
              </div>
              {leaveTimeInfo && (
                <div className="leave-info">
                  <div className="leave-cards-row">
                    <div className="leave-card normal-leave">
                      <div className="leave-label">Normal Leave Time</div>
                      <div className="leave-sub-label">
                        ({isHalfDay ? "4h 30m" : "8h 15m"})
                      </div>
                      <div className="leave-time">
                        {leaveTimeInfo.normalLeaveTime}
                      </div>
                    </div>
                    <div className="leave-card">
                      <div className="leave-label">Early Leave Time</div>
                      <div className="leave-sub-label">
                        ({isHalfDay ? "3h 30m" : "7h"})
                      </div>
                      <div className="leave-time">
                        {leaveTimeInfo.earlyLeaveTime}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="no-data">No attendance data found</p>
          )}
        </>
      )}
      {activeTab === "monthly" && (
        <div className="monthly-overview">
          {monthlyLoading ? (
            <p className="loading">Loading monthly data...</p>
          ) : totalWorkingDays !== null ? (
            <div className="monthly-content">
              <div className="monthly-cards-row">
                <div className="monthly-card monthly-card-yellow">
                  <div className="monthly-label">Total Days</div>
                  <div className="monthly-value">{totalWorkingDays}</div>
                </div>
                <div className="monthly-card monthly-card-yellow">
                  <div className="monthly-label">Current Day</div>
                  <div className="monthly-value">
                    {currentWorkingDay !== null ? currentWorkingDay : "—"}
                  </div>
                </div>
                <div className="monthly-card monthly-card-yellow">
                  <div className="monthly-label">Remaining Days</div>
                  <div className="monthly-value">
                    {remainingWorkingDays !== null ? remainingWorkingDays : "—"}
                  </div>
                </div>
              </div>
              <div className="monthly-cards-row">
                <div className="monthly-card monthly-card-green">
                  <div className="monthly-label">Average Hours</div>
                  <div className="monthly-value">
                    {averageHours !== null && averageHours > 0
                      ? (() => {
                        const hours = Math.floor(averageHours);
                        const minutes = Math.round(
                          (averageHours - hours) * 60
                        );
                        return `${hours}h ${minutes}m`;
                      })()
                      : "—"}
                  </div>
                </div>
                <div className="monthly-card">
                  <div className="monthly-label">Hours Needed/Day</div>
                  <div className="monthly-value">
                    {hoursNeededPerDay !== null && hoursNeededPerDay > 0
                      ? (() => {
                        const hours = Math.floor(hoursNeededPerDay);
                        const minutes = Math.round(
                          (hoursNeededPerDay - hours) * 60
                        );
                        return `${hours}h ${minutes}m`;
                      })()
                      : "—"}
                  </div>
                </div>
              </div>
              {holidays.length > 0 && (
                <div className="holidays-info">
                  <div className="holidays-label">
                    {holidays.length} Holiday{holidays.length !== 1 ? "s" : ""}{" "}
                    this month
                  </div>
                </div>
              )}
              {leaveDaysCount > 0 && (
                <div className="holidays-info">
                  <div className="holidays-label">
                    {leaveDaysCount} Leave{leaveDaysCount !== 1 ? "s" : ""} this
                    month
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="no-data">Unable to load monthly data</p>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
