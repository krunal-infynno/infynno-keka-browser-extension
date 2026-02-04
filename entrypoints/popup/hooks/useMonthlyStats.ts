import { useState, useEffect } from "react";
import { format, isSameMonth, startOfMonth, endOfMonth } from "date-fns";
import { fetchAttendanceSummary, fetchHolidays, fetchLeaveSummary, fetchRangeStats } from "../../../utils/api";
import { processMonthlyStats } from "../../../utils/calculations";

interface MonthlyStats {
    holidays: string[];
    leaveDaysCount: number;
    totalWorkingDays: number | null;
    currentWorkingDay: number | null;
    remainingWorkingDays: number | null;
    averageHours: number | null;
    hoursNeededPerDay: number | null;
    loading: boolean;
}

export const useMonthlyStats = (accessToken: string | null, selectedDate: Date) => {
    const [stats, setStats] = useState<MonthlyStats>({
        holidays: [],
        leaveDaysCount: 0,
        totalWorkingDays: null,
        currentWorkingDay: null,
        remainingWorkingDays: null,
        averageHours: null,
        hoursNeededPerDay: null,
        loading: false,
    });

    useEffect(() => {
        const loadStats = async () => {
            if (!accessToken) return;

            setStats((prev) => ({ ...prev, loading: true }));

            try {
                const dateStr = format(selectedDate, "yyyy-MM-dd");
                const isCurrentMonth = isSameMonth(selectedDate, new Date());

                // Always fetch holidays and leaves for context
                const [attendanceData, holidaysData] = await Promise.all([
                    fetchAttendanceSummary(accessToken, dateStr),
                    fetchHolidays(accessToken, dateStr)
                ]);

                let leaveData = null;
                try {
                    leaveData = await fetchLeaveSummary(accessToken, dateStr);
                } catch (e) {
                    // console.error("Failed to fetch leave data", e);
                }

                if (!attendanceData) throw new Error("Failed to fetch attendance");

                // Basic processing using existing logic
                const processed = processMonthlyStats(attendanceData, holidaysData, leaveData, selectedDate);

                let finalStats: MonthlyStats = {
                    holidays: processed.holidayDates,
                    leaveDaysCount: processed.leaveCount,
                    totalWorkingDays: processed.totalWorkingDaysCount,
                    currentWorkingDay: processed.currentWorkingDayCount,
                    remainingWorkingDays: processed.remainingWorkingDaysCount,
                    averageHours: processed.averageHours,
                    hoursNeededPerDay: processed.hoursNeededPerDay,
                    loading: false,
                };

                // If past month, fetch correct average and worked days from RangeStats API
                if (!isCurrentMonth) {
                    try {
                        const fromDate = format(startOfMonth(selectedDate), "yyyy-MM-dd");
                        const toDate = format(endOfMonth(selectedDate), "yyyy-MM-dd");

                        const rangeStats = await fetchRangeStats(accessToken, fromDate, toDate);

                        if (rangeStats?.data?.myStats) {
                            const { averageHoursPerDayInHHMM, workingDays } = rangeStats.data.myStats;

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
                            finalStats.currentWorkingDay = workingDays;
                            finalStats.remainingWorkingDays = 0;
                            finalStats.hoursNeededPerDay = null;
                        }
                    } catch (e) {
                        console.error("Failed to fetch range stats for past month", e);
                    }
                }

                setStats(finalStats);

            } catch (err) {
                // Suppress error logging
                /*
                if (err instanceof Error && err.message !== 'Unauthorized') {
                    console.error("Error loading monthly stats:", err);
                }
                */
                setStats((prev) => ({ ...prev, loading: false }));
            }
        };

        loadStats();
    }, [accessToken, selectedDate]);

    return stats;
};
