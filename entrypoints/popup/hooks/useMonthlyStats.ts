import { useState, useEffect } from "react";
import { format } from "date-fns";
import { fetchAttendanceSummary, fetchHolidays, fetchLeaveSummary } from "../../../utils/api";
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

export const useMonthlyStats = (accessToken: string | null) => {
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
                const [attendanceData, holidaysData] = await Promise.all([
                    fetchAttendanceSummary(accessToken),
                    fetchHolidays(accessToken)
                ]);

                const now = new Date();
                const currentDateStr = format(now, "yyyy-MM-dd");
                let leaveData = null;
                try {
                    leaveData = await fetchLeaveSummary(accessToken, currentDateStr);
                } catch (e) {
                    // console.error("Failed to fetch leave data", e);
                }

                if (!attendanceData) throw new Error("Failed to fetch attendance");

                const processed = processMonthlyStats(attendanceData, holidaysData, leaveData);

                setStats({
                    holidays: processed.holidayDates,
                    leaveDaysCount: processed.leaveCount,
                    totalWorkingDays: processed.totalWorkingDaysCount,
                    currentWorkingDay: processed.currentWorkingDayCount,
                    remainingWorkingDays: processed.remainingWorkingDaysCount,
                    averageHours: processed.averageHours,
                    hoursNeededPerDay: processed.hoursNeededPerDay,
                    loading: false,
                });

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
    }, [accessToken]);

    return stats;
};
