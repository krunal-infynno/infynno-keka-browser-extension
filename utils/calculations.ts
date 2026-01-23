import { differenceInMinutes, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameMonth, format } from "date-fns";
import type { AttendanceData, LeaveTimeInfo, Metrics, TimeEntry, TimePair, Break, HolidayResponse, LeaveResponse, MonthlyStats } from "./types";


// Helper to calculate total minutes from attendance data
export const calculateMinutesFromAttendance = (attendanceData: AttendanceData[]): {
    totalWorkedMinutes: number;
    isClockedIn: boolean;
} => {
    if (!attendanceData.length) {
        return { totalWorkedMinutes: 0, isClockedIn: false };
    }

    const lastEntry = attendanceData[attendanceData.length - 1];
    let pairs: { startTime: string; endTime: string; durationMinutes: number }[] = [];
    let currentStart: TimeEntry | null = null;
    let unpairedInEntry: TimeEntry | null = null;

    // Process time entries
    if (lastEntry.timeEntries && Array.isArray(lastEntry.timeEntries)) {
        lastEntry.timeEntries.forEach((entry: TimeEntry) => {
            if (!entry.actualTimestamp) return;

            if (entry.punchStatus === 0) {
                currentStart = entry;
            } else if (entry.punchStatus === 1 && currentStart) {
                const startDate = new Date(currentStart.actualTimestamp);
                const endDate = new Date(entry.actualTimestamp);
                const totalMinutes = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60));

                pairs.push({
                    startTime: currentStart.actualTimestamp,
                    endTime: entry.actualTimestamp,
                    durationMinutes: totalMinutes,
                });

                currentStart = null;
            }
        });

        if (currentStart) {
            unpairedInEntry = currentStart;
        }
    }

    // Calculate total worked minutes
    let calculatedTotalWorkedMinutes = pairs.reduce((sum, pair) => sum + pair.durationMinutes, 0);

    // Add time from unpaired entry
    if (unpairedInEntry) {
        const entry = unpairedInEntry as TimeEntry;
        const startDate = new Date(entry.actualTimestamp);
        const now = new Date();
        const additionalMinutes = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60));
        calculatedTotalWorkedMinutes += additionalMinutes;
    }

    const isClockedIn = !!unpairedInEntry;

    return { totalWorkedMinutes: calculatedTotalWorkedMinutes, isClockedIn };
};

export const calculateTimePairsAndBreaks = (
    attendanceData: AttendanceData[]
): {
    timePairs: TimePair[];
    breaks: Break[];
    unpairedInEntry: TimeEntry | null;
} => {
    if (!attendanceData.length) {
        return { timePairs: [], breaks: [], unpairedInEntry: null };
    }

    const lastEntry = attendanceData[attendanceData.length - 1];
    const pairs: TimePair[] = [];
    const breakList: Break[] = [];
    let currentStart: TimeEntry | null = null;
    let unpairedInEntry: TimeEntry | null = null;

    if (lastEntry.timeEntries && Array.isArray(lastEntry.timeEntries)) {
        lastEntry.timeEntries.forEach((entry: TimeEntry) => {
            if (!entry.actualTimestamp) return;

            // punchStatus 0 = In (start), 1 = Out (end)
            if (entry.punchStatus === 0) {
                // Start time
                currentStart = entry;
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
    }

    // Calculate breaks between consecutive time pairs
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
        const entry = unpairedInEntry as TimeEntry;
        const lastPair = pairs[pairs.length - 1];
        const breakStart = new Date(lastPair.endTime);
        const breakEnd = new Date(entry.actualTimestamp);
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
                endTime: entry.actualTimestamp,
                duration: breakDuration,
            });
        }
    }

    return {
        timePairs: pairs,
        breaks: breakList,
        unpairedInEntry,
    };
};

// Helper to generate metrics object from minutes
export const generateMetricsFromMinutes = (
    totalWorkedMinutes: number,
    isHalfDay: boolean,
    isClockedIn: boolean = false
): Metrics => {
    // Determine target
    const targetMinutes = isHalfDay ? 4 * 60 + 30 : 8 * 60 + 15;
    const remainingMinutes = Math.max(0, targetMinutes - totalWorkedMinutes);
    const isOvertime = totalWorkedMinutes > targetMinutes;
    const overtimeMinutes = isOvertime ? totalWorkedMinutes - targetMinutes : 0;

    // Calculate completion status
    const isCompleted = remainingMinutes === 0;
    const isCloseToCompletion = remainingMinutes <= 30 && remainingMinutes > 0;

    // Determine status color
    let totalWorkedStatus: "yellow" | "green" | "red";
    if (isHalfDay) {
        const halfDayMax = 4 * 60 + 45;
        if (totalWorkedMinutes < targetMinutes) {
            totalWorkedStatus = "yellow";
        } else if (totalWorkedMinutes <= halfDayMax) {
            totalWorkedStatus = "green";
        } else {
            totalWorkedStatus = "red";
        }
    } else {
        const maxAcceptable = 8 * 60 + 30;
        if (totalWorkedMinutes < targetMinutes) {
            totalWorkedStatus = "yellow";
        } else if (totalWorkedMinutes <= maxAcceptable) {
            totalWorkedStatus = "green";
        } else {
            totalWorkedStatus = "red";
        }
    }

    // Format total worked
    const totalHours = Math.floor(totalWorkedMinutes / 60);
    const totalMins = totalWorkedMinutes % 60;
    const totalWorked = `${totalHours}h ${totalMins}m`;

    // Format remaining
    const remainingHours = Math.floor(remainingMinutes / 60);
    const remainingMins = remainingMinutes % 60;
    const remaining = `${remainingHours}h ${remainingMins}m`;

    // Calculate estimated completion
    const now = new Date();
    let estCompletionTime: Date;
    if (isOvertime) {
        // Show when they should have completed
        estCompletionTime = new Date(now.getTime() - (overtimeMinutes * 60 * 1000));
    } else if (isClockedIn) {
        // Show when they will complete
        estCompletionTime = new Date(now.getTime() + (remainingMinutes * 60 * 1000));
    } else {
        // If not clocked in, we can't really estimate exactly, but preserving old behavior:
        // logic assumes "if I worked continuously from now"
        estCompletionTime = new Date(now.getTime() + (remainingMinutes * 60 * 1000));
    }

    const estCompletion = `${estCompletionTime.getHours().toString().padStart(2, '0')}:${estCompletionTime.getMinutes().toString().padStart(2, '0')}`;

    return {
        totalWorked,
        remaining,
        estCompletion,
        isCompleted,
        isCloseToCompletion,
        totalWorkedStatus,
        isOvertime,
        overtimeMinutes,
    };
};

export const calculateLeaveTimeInfo = (totalWorkedMinutes: number, halfDay: boolean): LeaveTimeInfo => {
    const now = new Date();
    const normalTarget = halfDay ? 4 * 60 + 30 : 8 * 60 + 15;

    let normalLeaveTimeStr: string;
    if (totalWorkedMinutes >= normalTarget) {
        normalLeaveTimeStr = "You can leave";
    } else {
        const normalRemainingMinutes = Math.max(0, normalTarget - totalWorkedMinutes);
        const normalLeaveTime = new Date(now.getTime() + (normalRemainingMinutes * 60 * 1000));
        normalLeaveTimeStr = `${normalLeaveTime.getHours() > 12 ? normalLeaveTime.getHours() - 12 : normalLeaveTime.getHours()}:${normalLeaveTime.getMinutes().toString().padStart(2, '0')} ${normalLeaveTime.getHours() >= 12 ? 'pm' : 'am'}`;
    }

    const earlyTarget = halfDay ? 3 * 60 + 30 : 7 * 60;

    let earlyLeaveTimeStr: string;
    if (totalWorkedMinutes >= earlyTarget) {
        earlyLeaveTimeStr = "You can leave";
    } else {
        const earlyRemainingMinutes = Math.max(0, earlyTarget - totalWorkedMinutes);
        const earlyLeaveTime = new Date(now.getTime() + (earlyRemainingMinutes * 60 * 1000));
        earlyLeaveTimeStr = `${earlyLeaveTime.getHours() > 12 ? earlyLeaveTime.getHours() - 12 : earlyLeaveTime.getHours()}:${earlyLeaveTime.getMinutes().toString().padStart(2, '0')} ${earlyLeaveTime.getHours() >= 12 ? 'pm' : 'am'}`;
    }

    return {
        normalLeaveTime: normalLeaveTimeStr,
        earlyLeaveTime: earlyLeaveTimeStr,
    };
};

export const calculateMetrics = (attendanceData: AttendanceData[], halfDay: boolean): {
    metrics: Metrics;
    totalWorkedMinutes: number;
    isClockedIn: boolean;
    leaveTimeInfo: LeaveTimeInfo | null;
} => {
    const { totalWorkedMinutes, isClockedIn } = calculateMinutesFromAttendance(attendanceData);

    if (!attendanceData.length) {
        // Default empty
        return {
            metrics: generateMetricsFromMinutes(0, halfDay, false),
            totalWorkedMinutes: 0,
            isClockedIn: false,
            leaveTimeInfo: null,
        };
    }

    const metrics = generateMetricsFromMinutes(totalWorkedMinutes, halfDay, isClockedIn);
    const leaveTimeInfo = calculateLeaveTimeInfo(totalWorkedMinutes, halfDay);

    return {
        metrics,
        totalWorkedMinutes,
        isClockedIn,
        leaveTimeInfo,
    };
}

export const processMonthlyStats = (
    attendanceData: AttendanceData[],
    holidaysData: HolidayResponse | null,
    leaveData: LeaveResponse | null
): MonthlyStats => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    // Process Holidays
    const holidayDates: string[] = [];
    if (holidaysData?.data && Array.isArray(holidaysData.data)) {
        holidaysData.data.forEach((holiday) => {
            if (holiday.date) {
                const holidayDate = parseISO(holiday.date);
                if (isSameMonth(holidayDate, now)) {
                    holidayDates.push(holiday.date);
                }
            }
        });
    }

    // Process Leaves
    const leaveDates = new Set<string>();
    let leaveCount = 0;
    if (
        leaveData?.data?.leaveHistory &&
        Array.isArray(leaveData.data.leaveHistory)
    ) {
        leaveData.data.leaveHistory.forEach((leaveEntry) => {
            if (
                leaveEntry.date &&
                leaveEntry.change &&
                leaveEntry.change.duration < 0
            ) {
                const leaveDate = parseISO(leaveEntry.date);
                if (isSameMonth(leaveDate, now)) {
                    leaveDates.add(leaveEntry.date);
                    leaveCount += Math.abs(leaveEntry.change.duration);
                }
            }
        });
    }

    // Calculate Working Days
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

    const weekdays = allDays.filter((day) => {
        const dayOfWeek = getDay(day);
        return dayOfWeek >= 1 && dayOfWeek <= 5;
    });

    const allWorkingDays = weekdays.filter((day) => {
        const dayStr = format(day, "yyyy-MM-dd");
        return !holidayDates.includes(dayStr) && !leaveDates.has(dayStr);
    });

    const totalWorkingDaysCount = allWorkingDays.length;

    const currentWorkingDayCount = allWorkingDays.filter((day) => {
        const dayDate = new Date(day);
        dayDate.setHours(0, 0, 0, 0);
        return dayDate < today;
    }).length;

    const remainingWorkingDaysCount = totalWorkingDaysCount - currentWorkingDayCount;

    // Process Average Hours
    let averageHours = 0;
    let hoursNeededPerDay = 0;

    if (attendanceData && attendanceData.length > 0 && currentWorkingDayCount > 0) {
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const monthlyAttendance = attendanceData.filter((entry) => {
            if (!entry.attendanceDate) return false;
            const entryDate = new Date(entry.attendanceDate);
            entryDate.setHours(0, 0, 0, 0);
            return (
                entryDate.getMonth() === currentMonth &&
                entryDate.getFullYear() === currentYear &&
                entryDate < today
            );
        });

        let totalHours = 0;
        monthlyAttendance.forEach((entry) => {
            if (entry.totalEffectiveHours !== undefined && entry.totalEffectiveHours !== null) {
                totalHours += entry.totalEffectiveHours;
            }
        });

        const daysToDivideBy = currentWorkingDayCount;
        averageHours = daysToDivideBy > 0 ? totalHours / daysToDivideBy : 0;

        if (
            remainingWorkingDaysCount > 0 &&
            totalWorkingDaysCount > 0 &&
            daysToDivideBy > 0 &&
            averageHours > 0
        ) {
            const TARGET_AVERAGE_HOURS = 8.25;
            const totalHoursNeeded = totalWorkingDaysCount * TARGET_AVERAGE_HOURS;
            const hoursWorkedSoFar = averageHours * daysToDivideBy;
            const hoursRemaining = totalHoursNeeded - hoursWorkedSoFar;
            hoursNeededPerDay = hoursRemaining / remainingWorkingDaysCount;

            if (hoursNeededPerDay < 0) hoursNeededPerDay = 0;
        }
    }

    return {
        holidayDates,
        leaveCount,
        totalWorkingDaysCount,
        currentWorkingDayCount,
        remainingWorkingDaysCount,
        averageHours: averageHours || null,
        hoursNeededPerDay: hoursNeededPerDay > 0 ? hoursNeededPerDay : null, // keep null if 0/undefined implies N/A
    };
};
