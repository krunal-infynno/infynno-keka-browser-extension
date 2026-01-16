import { useState, useEffect, Fragment } from "react";
import {
  format,
  differenceInMinutes,
  addMinutes,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isSameMonth,
  parseISO,
} from "date-fns";
import "./App.css";

interface TimeEntry {
  actualTimestamp: string;
  timestamp: string;
  punchStatus: number;
}

interface LeaveDetail {
  leaveTypeName: string;
  leaveDayStatus: number;
  startTime?: string;
  endTime?: string;
}

interface AttendanceData {
  attendanceDate: string;
  timeEntries: TimeEntry[];
  leaveDayStatuses: number[];
  leaveDetails: LeaveDetail[];
  totalEffectiveHours?: number;
}

interface TimePair {
  startTime: string;
  endTime: string;
  duration: string;
  durationMinutes: number;
}

interface Break {
  startTime: string;
  endTime: string;
  duration: string;
}

interface Metrics {
  totalWorked: string;
  remaining: string;
  estCompletion: string;
  isCompleted: boolean;
  isCloseToCompletion: boolean;
  totalWorkedStatus: "yellow" | "green" | "red";
  isOvertime: boolean;
  overtimeMinutes: number;
}

interface LeaveTimeInfo {
  normalLeaveTime: string;
  earlyLeaveTime: string;
}

function App() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attendanceData, setAttendanceData] = useState<AttendanceData[]>([]);
  const [timePairs, setTimePairs] = useState<TimePair[]>([]);
  const [breaks, setBreaks] = useState<Break[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [leaveTimeInfo, setLeaveTimeInfo] = useState<LeaveTimeInfo | null>(
    null
  );
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [totalWorkedMinutes, setTotalWorkedMinutes] = useState(0);
  const [isHalfDayLoaded, setIsHalfDayLoaded] = useState(false);
  const [workStartTime, setWorkStartTime] = useState<string | null>(null);
  const [unpairedInEntry, setUnpairedInEntry] = useState<TimeEntry | null>(
    null
  );
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
          setIsHalfDay(result[key]);
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
    const fetchAccessToken = async () => {
      try {
        // Query all tabs and filter for infynno.keka.com
        const allTabs = await browser.tabs.query({});
        const kekaTabs = allTabs.filter(
          (tab) =>
            tab.url &&
            (tab.url.includes("infynno.keka.com") ||
              tab.url.includes("*.infynno.keka.com"))
        );

        if (kekaTabs.length === 0) {
          setError("Please open infynno.keka.com in a tab");
          setLoading(false);
          return;
        }

        // Use the first matching tab (prefer active tab if available)
        const activeTab = kekaTabs.find((tab) => tab.active) || kekaTabs[0];
        const tabId = activeTab.id;

        if (!tabId) {
          setError("Could not get tab ID");
          setLoading(false);
          return;
        }

        // Execute script directly in the page context to read localStorage
        const results = await browser.scripting.executeScript({
          target: { tabId },
          func: () => {
            return localStorage.getItem("access_token");
          },
        });

        if (results && results[0]?.result) {
          const token = results[0].result;
          setAccessToken(token);
          // Fetch attendance data
          fetchAttendanceData(token);
        } else {
          setError("No access token found in localStorage");
          setLoading(false);
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to fetch access token";
        // Show the actual error for debugging
        setError(`Error: ${errorMessage}`);
        console.error("Error fetching access token:", err);
        setLoading(false);
      }
    };

    const fetchAttendanceData = async (token: string) => {
      try {
        const response = await fetch(
          "https://infynno.keka.com/k/attendance/api/mytime/attendance/summary",
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error("API error response:", errorText);
          throw new Error(
            `API request failed: ${response.status} - ${errorText}`
          );
        }

        const responseData = await response.json();

        // Check if response has a data property
        if (!responseData || !responseData.data) {
          console.error("Expected response.data but got:", responseData);
          throw new Error(
            `API response does not have a data property. Got: ${typeof responseData}`
          );
        }

        const data = responseData.data;

        // Check if data is an array
        if (!Array.isArray(data)) {
          console.error("Expected array but got:", typeof data, data);
          throw new Error(
            `API response.data is not an array. Got: ${typeof data}`
          );
        }

        setAttendanceData(data);

        // Get the last entry (most recent attendance record)
        if (data.length === 0) {
          console.log("No attendance records found");
          setTimePairs([]);
          setLoading(false);
          return;
        }

        const lastEntry = data[data.length - 1];

        // Pair up start and end times from timeEntries of the last entry
        const pairs: TimePair[] = [];
        let currentStart: TimeEntry | null = null;
        let unpairedInEntry: TimeEntry | null = null;
        let firstWorkStartTime: string | null = null;

        if (lastEntry.timeEntries && Array.isArray(lastEntry.timeEntries)) {
          lastEntry.timeEntries.forEach((entry: TimeEntry) => {
            if (!entry.actualTimestamp) return;

            // punchStatus 0 = In (start), 1 = Out (end)
            if (entry.punchStatus === 0) {
              // Start time
              currentStart = entry;
              // Track the first work start time
              if (!firstWorkStartTime) {
                firstWorkStartTime = entry.actualTimestamp;
              }
            } else if (entry.punchStatus === 1 && currentStart) {
              // End time - create a pair
              const startDate = new Date(currentStart.actualTimestamp);
              const endDate = new Date(entry.actualTimestamp);
              const totalMinutes = differenceInMinutes(endDate, startDate);
              const hours = Math.floor(totalMinutes / 60);
              const minutes = totalMinutes % 60;
              const duration = `${hours}h ${minutes}m`;

              pairs.push({
                startTime: currentStart.actualTimestamp,
                endTime: entry.actualTimestamp,
                duration,
                durationMinutes: totalMinutes,
              });

              currentStart = null; // Reset for next pair
            }
          });

          // Check if there's an unpaired "In" entry (no out record)
          if (currentStart) {
            unpairedInEntry = currentStart;
          }
        } else {
          console.warn(
            "No timeEntries found in last entry or it's not an array"
          );
        }

        setTimePairs(pairs);

        // Set clocked in status
        setIsClockedIn(!!unpairedInEntry);
        setUnpairedInEntry(unpairedInEntry);

        // Store the work start time
        if (firstWorkStartTime) {
          setWorkStartTime(firstWorkStartTime);
        }

        // Calculate breaks between consecutive time pairs
        const breakList: Break[] = [];
        for (let i = 0; i < pairs.length - 1; i++) {
          const currentPair = pairs[i];
          const nextPair = pairs[i + 1];

          // Break is from end of current pair to start of next pair
          const breakStart = new Date(currentPair.endTime);
          const breakEnd = new Date(nextPair.startTime);
          const breakMinutes = differenceInMinutes(breakEnd, breakStart);

          if (breakMinutes > 0) {
            const breakHours = Math.floor(breakMinutes / 60);
            const breakMins = breakMinutes % 60;
            let breakDuration: string;

            if (breakHours > 0 && breakMins > 0) {
              breakDuration = `${breakHours} hr ${breakMins} min`;
            } else if (breakHours > 0) {
              breakDuration = `${breakHours} hr`;
            } else {
              breakDuration = `${breakMins} min`;
            }

            breakList.push({
              startTime: currentPair.endTime,
              endTime: nextPair.startTime,
              duration: breakDuration,
            });
          }
        }

        // Check for break after the last pair if there's an unpaired "In" entry
        if (pairs.length > 0 && unpairedInEntry) {
          const lastPair = pairs[pairs.length - 1];
          const breakStart = new Date(lastPair.endTime);
          const breakEnd = new Date(unpairedInEntry.actualTimestamp);
          const breakMinutes = differenceInMinutes(breakEnd, breakStart);

          if (breakMinutes > 0) {
            const breakHours = Math.floor(breakMinutes / 60);
            const breakMins = breakMinutes % 60;
            let breakDuration: string;

            if (breakHours > 0 && breakMins > 0) {
              breakDuration = `${breakHours} hr ${breakMins} min`;
            } else if (breakHours > 0) {
              breakDuration = `${breakHours} hr`;
            } else {
              breakDuration = `${breakMins} min`;
            }

            breakList.push({
              startTime: lastPair.endTime,
              endTime: unpairedInEntry.actualTimestamp,
              duration: breakDuration,
            });
          }
        }

        setBreaks(breakList);

        // Determine target based on leave status
        // Check if it's an early leave day (has leave with early/half day status)
        const hasLeave =
          lastEntry.leaveDayStatuses && lastEntry.leaveDayStatuses.length > 0;
        let DAILY_TARGET_MINUTES = 8 * 60 + 15; // Default: 8h 15m = 495 minutes
        let targetType = "Normal (8h 15m)";

        if (
          hasLeave &&
          lastEntry.leaveDetails &&
          lastEntry.leaveDetails.length > 0
        ) {
          const leaveDetail = lastEntry.leaveDetails[0];
          const leaveTypeName = leaveDetail.leaveTypeName || "";

          // Check if it's Early Leave (minimum 7h) or Normal Leave (8h 15m)
          const isEarlyLeave =
            leaveTypeName.toLowerCase().includes("early") ||
            leaveTypeName.toLowerCase().includes("half");

          if (isEarlyLeave) {
            // Early Leave = 7 hours minimum
            DAILY_TARGET_MINUTES = 7 * 60; // 420 minutes
            targetType = "Early Leave (7h)";
          } else {
            // Normal Leave = 8h 15m
            DAILY_TARGET_MINUTES = 8 * 60 + 15; // 495 minutes
            targetType = "Normal (8h 15m)";
          }
        }

        // Calculate metrics using the appropriate target

        // Calculate total worked minutes
        let calculatedTotalWorkedMinutes = pairs.reduce(
          (sum, pair) => sum + pair.durationMinutes,
          0
        );

        // If there's an unpaired "In" entry, add time from that entry to current time
        if (unpairedInEntry) {
          const startDate = new Date(unpairedInEntry.actualTimestamp);
          const now = new Date();
          const additionalMinutes = differenceInMinutes(now, startDate);
          calculatedTotalWorkedMinutes += additionalMinutes;
        }

        setTotalWorkedMinutes(calculatedTotalWorkedMinutes);
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : "Failed to fetch attendance data";
        console.error("Error fetching attendance data:", err);
        setError(`Error fetching attendance: ${errorMessage}`);
      } finally {
        setLoading(false);
      }
    };

    fetchAccessToken();
  }, []);

  // Recalculate metrics when half day toggle changes or when data is loaded
  useEffect(() => {
    if (!isHalfDayLoaded) return; // Wait for half day state to load
    if (totalWorkedMinutes === 0 && timePairs.length === 0 && !isClockedIn)
      return;

    const HALF_DAY_TARGET = 4 * 60 + 30; // 4h 30m = 270 minutes
    const NORMAL_TARGET = 8 * 60 + 15; // 8h 15m = 495 minutes
    const MAX_ACCEPTABLE = 8 * 60 + 30; // 8h 30m = 510 minutes

    const targetMinutes = isHalfDay ? HALF_DAY_TARGET : NORMAL_TARGET;
    const remainingMinutes = Math.max(0, targetMinutes - totalWorkedMinutes);

    // Check if overtime
    const isOvertime = totalWorkedMinutes > targetMinutes;
    const overtimeMinutes = isOvertime ? totalWorkedMinutes - targetMinutes : 0;

    // Format total worked
    const totalHours = Math.floor(totalWorkedMinutes / 60);
    const totalMins = totalWorkedMinutes % 60;
    const totalWorked = `${totalHours}h ${totalMins}m`;

    // Format remaining
    const remainingHours = Math.floor(remainingMinutes / 60);
    const remainingMins = remainingMinutes % 60;
    const remaining = `${remainingHours}h ${remainingMins}m`;

    // Calculate estimated completion time
    const now = new Date();
    let estCompletionTime: Date;
    if (isOvertime && workStartTime) {
      // If in overtime, show when they should have completed (start time + target)
      const startDate = new Date(workStartTime);
      estCompletionTime = addMinutes(startDate, targetMinutes);
    } else {
      // If not in overtime, show current time + remaining time
      estCompletionTime = addMinutes(now, remainingMinutes);
    }
    const estCompletion = format(estCompletionTime, "HH:mm");

    // Determine status colors
    const isCompleted = remainingMinutes === 0;
    const isCloseToCompletion = remainingMinutes <= 30;

    // Determine Total Worked status
    let totalWorkedStatus: "yellow" | "green" | "red";
    if (isHalfDay) {
      // For half day: Yellow if < 4:30, Green if 4:30-4:45, Red if > 4:45
      const HALF_DAY_MAX = 4 * 60 + 45; // 285 minutes
      if (totalWorkedMinutes < HALF_DAY_TARGET) {
        totalWorkedStatus = "yellow";
      } else if (totalWorkedMinutes <= HALF_DAY_MAX) {
        totalWorkedStatus = "green";
      } else {
        totalWorkedStatus = "red";
      }
    } else {
      // For full day: Yellow if < 8:15, Green if 8:15-8:30, Red if > 8:30
      if (totalWorkedMinutes < NORMAL_TARGET) {
        totalWorkedStatus = "yellow";
      } else if (totalWorkedMinutes <= MAX_ACCEPTABLE) {
        totalWorkedStatus = "green";
      } else {
        totalWorkedStatus = "red";
      }
    }

    setMetrics({
      totalWorked,
      remaining,
      estCompletion,
      isCompleted,
      isCloseToCompletion,
      totalWorkedStatus,
      isOvertime,
      overtimeMinutes,
    });

    // Calculate both leave times (when they can leave the office)
    // Normal Leave Time: based on 8h 15m target (or 4h 30m if half day)
    const normalTarget = isHalfDay ? HALF_DAY_TARGET : NORMAL_TARGET;
    const normalRemainingMinutes = Math.max(
      0,
      normalTarget - totalWorkedMinutes
    );
    const normalLeaveTime = format(
      addMinutes(now, normalRemainingMinutes),
      "h:mm a"
    );

    // Early Leave Time: based on 7h target (or 3h 30m if half day)
    const earlyTarget = isHalfDay ? 3 * 60 + 30 : 7 * 60; // 3h 30m for half day, 7h for full day
    const earlyRemainingMinutes = Math.max(0, earlyTarget - totalWorkedMinutes);
    const earlyLeaveTime = format(
      addMinutes(now, earlyRemainingMinutes),
      "h:mm a"
    );

    setLeaveTimeInfo({
      normalLeaveTime,
      earlyLeaveTime,
    });
  }, [
    isHalfDay,
    totalWorkedMinutes,
    timePairs.length,
    isClockedIn,
    isHalfDayLoaded,
    workStartTime,
  ]);

  // Fetch holidays and calculate working days for monthly overview
  useEffect(() => {
    const fetchHolidaysAndCalculateWorkingDays = async () => {
      if (!accessToken || activeTab !== "monthly") return;

      setMonthlyLoading(true);
      try {
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
          holidaysData.data.forEach((holiday: { date: string }) => {
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
                (leaveEntry: {
                  date: string;
                  change: { duration: number; unit: number };
                }) => {
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
          const monthlyAttendance = attendanceData.filter((entry) => {
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

          monthlyAttendance.forEach((entry) => {
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
  }, [accessToken, activeTab, attendanceData]);

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
                  className={`metric-card ${
                    metrics.isCompleted
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
                  className={`metric-card ${
                    metrics.isCompleted
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
              {(timePairs.length > 0 || unpairedInEntry) && (
                <div className="attendance-list">
                  <h3 className="list-title">Time Entries</h3>
                  <ul>
                    {timePairs.map((pair, index) => (
                      <Fragment key={`pair-${index}`}>
                        <li className="time-entry">
                          <span className="time-range">
                            {format(new Date(pair.startTime), "HH:mm")} -{" "}
                            {format(new Date(pair.endTime), "HH:mm")}
                          </span>
                          <span className="duration">({pair.duration})</span>
                        </li>
                        {breaks[index] && (
                          <li className="break-entry">
                            <span className="time-range">
                              {format(
                                new Date(breaks[index].startTime),
                                "h:mm a"
                              )}{" "}
                              to{" "}
                              {format(
                                new Date(breaks[index].endTime),
                                "h:mm a"
                              )}
                            </span>
                            <span className="break-duration">
                              → {breaks[index].duration}
                            </span>
                          </li>
                        )}
                      </Fragment>
                    ))}
                    {unpairedInEntry && (
                      <li className="time-entry not-logged-out">
                        <span className="time-range">
                          {format(
                            new Date(unpairedInEntry.actualTimestamp),
                            "HH:mm"
                          )}{" "}
                          - not logged out
                        </span>
                        <span className="duration">
                          (
                          {(() => {
                            const startDate = new Date(
                              unpairedInEntry.actualTimestamp
                            );
                            const now = new Date();
                            const totalMinutes = differenceInMinutes(
                              now,
                              startDate
                            );
                            const hours = Math.floor(totalMinutes / 60);
                            const minutes = totalMinutes % 60;
                            return `${hours}h ${minutes}m`;
                          })()}
                          )
                        </span>
                      </li>
                    )}
                  </ul>
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
