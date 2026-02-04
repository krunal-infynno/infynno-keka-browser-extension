import { useState, useEffect } from "react";
import { format, isSameWeek, startOfWeek, endOfWeek } from "date-fns";
import {
  fetchAttendanceSummary,
  fetchHolidays,
  fetchLeaveSummary,
  fetchRangeStats,
} from "../../../utils/api";
import { processWeeklyStats } from "../../../utils/calculations";
import type { WeeklyStats } from "../../../utils/types";

export const useWeeklyStats = (
  accessToken: string | null,
  isManualHalfDay: boolean,
  selectedDate: Date
) => {
  const [stats, setStats] = useState<WeeklyStats>({
    holidays: [],
    leaveDaysCount: 0,
    totalWorkingDays: null,
    currentWorkingDay: null,
    remainingWorkingDays: null,
    averageHours: null,
    hoursNeededPerDay: null,
    weeklyTarget: 0,
    totalWorked: 0,
    remaining: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadStats = async () => {
      if (!accessToken) return;

      setLoading(true);
      setError(null);

      try {
        // Use Monday as start of week to match typical business logic
        const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
        const dateStr = format(weekStart, "yyyy-MM-dd");

        const isCurrentWeek = isSameWeek(selectedDate, new Date(), { weekStartsOn: 1 });

        // Fetch same data as monthly: Attendance summary, holidays, leaves
        const [attendanceData, holidaysData] = await Promise.all([
          fetchAttendanceSummary(accessToken, dateStr),
          fetchHolidays(accessToken, dateStr),
        ]);

        let leaveData = null;
        try {
          leaveData = await fetchLeaveSummary(accessToken, dateStr);
        } catch (e) {
          // console.error("Failed to fetch leave data", e);
        }

        if (!attendanceData) throw new Error("Failed to fetch attendance");

        // Process with selectedDate
        const processed = processWeeklyStats(
          attendanceData,
          holidaysData,
          leaveData,
          isManualHalfDay,
          selectedDate
        );

        let finalStats = { ...processed };

        // If past week, fetch range stats to correct totals
        if (!isCurrentWeek) {
          try {
            const fromDate = format(weekStart, "yyyy-MM-dd");
            const toDate = format(endOfWeek(selectedDate, { weekStartsOn: 1 }), "yyyy-MM-dd");

            const rangeStats = await fetchRangeStats(accessToken, fromDate, toDate);

            if (rangeStats?.data?.myStats) {
              const { totalEffectiveHours, workingDays, averageHoursPerDayInHHMM } = rangeStats.data.myStats;

              // Update Total Worked
              finalStats.totalWorked = totalEffectiveHours;

              // Determine Weekly Target based on Working Days (assuming 8.25h/day standard)
              // Or roughly estimate?
              // If we have workingDays (e.g. 5), then target = 5 * 8.25 = 41.25.
              finalStats.weeklyTarget = workingDays * 8.25;

              // Remaining is 0 for past
              finalStats.remaining = 0;

              // Update Average Hours
              let avgHoursDec = 0;
              if (averageHoursPerDayInHHMM) {
                const parts: string[] = averageHoursPerDayInHHMM.split(' ');
                let h = 0, m = 0;
                parts.forEach((p: string) => {
                  if (p.includes('h')) h = parseInt(p);
                  if (p.includes('m')) m = parseInt(p);
                });
                avgHoursDec = h + (m / 60);
              }
              finalStats.averageHours = avgHoursDec;

              finalStats.totalWorkingDays = workingDays;
              finalStats.currentWorkingDay = workingDays;
              finalStats.remainingWorkingDays = 0;
              finalStats.hoursNeededPerDay = null;
            }

          } catch (e) {
            console.error("Failed to fetch range stats for past week", e);
          }
        }

        setStats(finalStats);
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("An unknown error occurred");
        }
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [accessToken, isManualHalfDay, selectedDate]);

  return { ...stats, loading, error };
};
