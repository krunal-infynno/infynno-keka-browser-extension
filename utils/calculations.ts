import {
  differenceInMinutes,
  parseISO,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isSameMonth,
  format,
  startOfWeek,
  endOfWeek,
  isSameWeek,
  isSameDay,
} from "date-fns";
import type {
  AttendanceData,
  LeaveTimeInfo,
  Metrics,
  TimeEntry,
  TimePair,
  Break,
  HolidayResponse,
  LeaveResponse,
  MonthlyStats,
  WeeklyStats,
} from "./types";

// Helper to calculate total minutes from attendance data
export const calculateMinutesFromAttendance = (
  attendanceData: AttendanceData[],
): {
  totalWorkedMinutes: number;
  isClockedIn: boolean;
} => {
  if (!attendanceData.length) {
    return { totalWorkedMinutes: 0, isClockedIn: false };
  }

  const lastEntry = attendanceData[attendanceData.length - 1];
  let pairs: { startTime: string; endTime: string; durationMinutes: number }[] =
    [];
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
        const totalMinutes = Math.floor(
          (endDate.getTime() - startDate.getTime()) / (1000 * 60),
        );

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
  let calculatedTotalWorkedMinutes = pairs.reduce(
    (sum, pair) => sum + pair.durationMinutes,
    0,
  );

  // Add time from unpaired entry
  if (unpairedInEntry) {
    const entry = unpairedInEntry as TimeEntry;
    const startDate = new Date(entry.actualTimestamp);
    const now = new Date();
    const additionalMinutes = Math.floor(
      (now.getTime() - startDate.getTime()) / (1000 * 60),
    );
    calculatedTotalWorkedMinutes += additionalMinutes;
  }

  const isClockedIn = !!unpairedInEntry;

  return { totalWorkedMinutes: calculatedTotalWorkedMinutes, isClockedIn };
};

export const calculateTimePairsAndBreaks = (
  attendanceData: AttendanceData[],
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
  isClockedIn: boolean = false,
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
    estCompletionTime = new Date(now.getTime() - overtimeMinutes * 60 * 1000);
  } else if (isClockedIn) {
    // Show when they will complete
    estCompletionTime = new Date(now.getTime() + remainingMinutes * 60 * 1000);
  } else {
    // If not clocked in, we can't really estimate exactly, but preserving old behavior:
    // logic assumes "if I worked continuously from now"
    estCompletionTime = new Date(now.getTime() + remainingMinutes * 60 * 1000);
  }

  const estCompletion = `${estCompletionTime.getHours().toString().padStart(2, "0")}:${estCompletionTime.getMinutes().toString().padStart(2, "0")}`;

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

export const calculateLeaveTimeInfo = (
  totalWorkedMinutes: number,
  halfDay: boolean,
): LeaveTimeInfo => {
  const now = new Date();
  const normalTarget = halfDay ? 4 * 60 + 30 : 8 * 60 + 15;

  let normalLeaveTimeStr: string;
  if (totalWorkedMinutes >= normalTarget) {
    normalLeaveTimeStr = "-";
  } else {
    const normalRemainingMinutes = Math.max(
      0,
      normalTarget - totalWorkedMinutes,
    );
    const normalLeaveTime = new Date(
      now.getTime() + normalRemainingMinutes * 60 * 1000,
    );
    normalLeaveTimeStr = `${normalLeaveTime.getHours() > 12 ? normalLeaveTime.getHours() - 12 : normalLeaveTime.getHours()}:${normalLeaveTime.getMinutes().toString().padStart(2, "0")} ${normalLeaveTime.getHours() >= 12 ? "pm" : "am"}`;
  }

  const earlyTarget = halfDay ? 3 * 60 + 30 : 7 * 60;

  let earlyLeaveTimeStr: string;
  if (totalWorkedMinutes >= earlyTarget) {
    earlyLeaveTimeStr = "-";
  } else {
    const earlyRemainingMinutes = Math.max(0, earlyTarget - totalWorkedMinutes);
    const earlyLeaveTime = new Date(
      now.getTime() + earlyRemainingMinutes * 60 * 1000,
    );
    earlyLeaveTimeStr = `${earlyLeaveTime.getHours() > 12 ? earlyLeaveTime.getHours() - 12 : earlyLeaveTime.getHours()}:${earlyLeaveTime.getMinutes().toString().padStart(2, "0")} ${earlyLeaveTime.getHours() >= 12 ? "pm" : "am"}`;
  }

  return {
    normalLeaveTime: normalLeaveTimeStr,
    earlyLeaveTime: earlyLeaveTimeStr,
  };
};

export const calculateMetrics = (
  attendanceData: AttendanceData[],
  halfDay: boolean,
): {
  metrics: Metrics;
  totalWorkedMinutes: number;
  isClockedIn: boolean;
  leaveTimeInfo: LeaveTimeInfo | null;
} => {
  const { totalWorkedMinutes, isClockedIn } =
    calculateMinutesFromAttendance(attendanceData);

  if (!attendanceData.length) {
    // Default empty
    return {
      metrics: generateMetricsFromMinutes(0, halfDay, false),
      totalWorkedMinutes: 0,
      isClockedIn: false,
      leaveTimeInfo: null,
    };
  }

  const metrics = generateMetricsFromMinutes(
    totalWorkedMinutes,
    halfDay,
    isClockedIn,
  );
  const leaveTimeInfo = calculateLeaveTimeInfo(totalWorkedMinutes, halfDay);

  return {
    metrics,
    totalWorkedMinutes,
    isClockedIn,
    leaveTimeInfo,
  };
};

export const processMonthlyStats = (
  attendanceData: AttendanceData[],
  holidaysData: HolidayResponse | null,
  leaveData: LeaveResponse | null,
  selectedDate: Date = new Date(),
): MonthlyStats => {
  const now = selectedDate;
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
  const leaveDurations = new Map<string, number>();
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
          const duration = Math.abs(leaveEntry.change.duration);
          leaveCount += duration;
          const existing = leaveDurations.get(leaveEntry.date) || 0;
          leaveDurations.set(leaveEntry.date, existing + duration);
        }
      }
    });
  }

  // Calculate Working Days
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  let totalWorkingDaysCount = 0;
  let currentWorkingDayCount = 0;

  allDays.forEach((day) => {
    const dayOfWeek = getDay(day);
    // Skip weekends (0 is Sunday, 6 is Saturday)
    if (dayOfWeek === 0 || dayOfWeek === 6) return;

    const dayStr = format(day, "yyyy-MM-dd");

    // Skip holidays
    if (holidayDates.includes(dayStr)) return;

    // Check for leave duration on this day
    const leaveDuration = leaveDurations.get(dayStr) || 0;

    // Calculate effective working day value (1 for full day, 0.5 for half day, etc.)
    // Ensure strictly non-negative
    const workingValue = Math.max(0, 1 - leaveDuration);

    totalWorkingDaysCount += workingValue;

    const dayDate = new Date(day);
    dayDate.setHours(0, 0, 0, 0);
    if (dayDate < today) {
      currentWorkingDayCount += workingValue;
    }
  });

  const remainingWorkingDaysCount =
    totalWorkingDaysCount - currentWorkingDayCount;

  // Process Average Hours
  let averageHours = 0;
  let hoursNeededPerDay = 0;

  if (
    attendanceData &&
    attendanceData.length > 0 &&
    currentWorkingDayCount > 0
  ) {
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
      if (
        entry.totalEffectiveHours !== undefined &&
        entry.totalEffectiveHours !== null
      ) {
        totalHours += entry.totalEffectiveHours;
      }
    });

    const daysToDivideBy = currentWorkingDayCount;
    averageHours = daysToDivideBy > 0 ? totalHours / daysToDivideBy : 0;

    // If it's the first working day (daysToDivideBy === 0), show today's hours as average
    if (daysToDivideBy === 0) {
      const todayEntry = attendanceData.find((entry) => {
        if (!entry.attendanceDate) return false;
        const entryDate = new Date(entry.attendanceDate);
        return isSameDay(entryDate, now);
      });

      if (todayEntry) {
        // Calculate real-time minutes if possible, similar to weeklystats, or rely on totalEffectiveHours?
        // monthly usually relies on totalEffectiveHours.
        // But for "Today", totalEffectiveHours might be stale if not re-calculated.
        // However, let's use what we have in the entry to be consistent with input.
        // Actually, let's calculate fresh from timeEntries if possible for accuracy.
        const { totalWorkedMinutes } = calculateMinutesFromAttendance([todayEntry]);
        if (totalWorkedMinutes > 0) {
          averageHours = totalWorkedMinutes / 60;
        }
      }
    }
  }

  // Calculate Needed/Day independently of past attendance check
  if (remainingWorkingDaysCount > 0 && totalWorkingDaysCount > 0) {
    const TARGET_AVERAGE_HOURS = 8.25;
    const totalHoursNeeded = totalWorkingDaysCount * TARGET_AVERAGE_HOURS;
    const hoursWorkedSoFar = averageHours * currentWorkingDayCount;

    // Ensure we don't have negative remaining due to floating point or over-work
    const hoursRemaining = Math.max(0, totalHoursNeeded - hoursWorkedSoFar);

    hoursNeededPerDay = hoursRemaining / remainingWorkingDaysCount;

    if (hoursNeededPerDay < 0) hoursNeededPerDay = 0;
  }

  return {
    holidayDates,
    leaveCount,
    totalWorkingDaysCount,
    currentWorkingDayCount,
    remainingWorkingDaysCount,
    averageHours: averageHours || null,
    hoursNeededPerDay: hoursNeededPerDay > 0 ? hoursNeededPerDay : null,
  };
};

export const processWeeklyStats = (
  attendanceData: AttendanceData[],
  holidaysData: HolidayResponse | null,
  leaveData: LeaveResponse | null,
  isManualHalfDay: boolean,
  selectedDate: Date = new Date(),
): WeeklyStats => {
  const now = selectedDate;
  // Use ISO week (Monday start)
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  // Process Holidays
  const holidayDates: string[] = [];
  if (holidaysData && holidaysData.data && Array.isArray(holidaysData.data)) {
    holidaysData.data.forEach((holiday) => {
      if (holiday.date) {
        const holidayDate = parseISO(holiday.date);
        if (isSameWeek(holidayDate, now, { weekStartsOn: 1 })) {
          holidayDates.push(holiday.date);
        }
      }
    });
  }

  // Process Leaves
  const leaveDurations = new Map<string, number>();
  let leaveCount = 0;
  if (
    leaveData &&
    leaveData.data &&
    leaveData.data.leaveHistory &&
    Array.isArray(leaveData.data.leaveHistory)
  ) {
    leaveData.data.leaveHistory.forEach((leaveEntry) => {
      if (
        leaveEntry.date &&
        leaveEntry.change &&
        leaveEntry.change.duration < 0
      ) {
        const leaveDate = parseISO(leaveEntry.date);
        if (isSameWeek(leaveDate, now, { weekStartsOn: 1 })) {
          const duration = Math.abs(leaveEntry.change.duration);
          leaveCount += duration;
          const existing = leaveDurations.get(leaveEntry.date) || 0;
          leaveDurations.set(leaveEntry.date, existing + duration);
        }
      }
    });
  }

  // Calculate Working Days & Targets
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const allDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  let totalWorkingDaysCount = 0;
  let currentWorkingDayCount = 0;
  let weeklyTargetHours = 0;

  allDays.forEach((day) => {
    const dayOfWeek = getDay(day);
    const dayStr = format(day, "yyyy-MM-dd");

    // Skip weekends
    if (dayOfWeek === 0 || dayOfWeek === 6) return;

    let dayTarget = 8.25; // 8h 15m default

    if (holidayDates.includes(dayStr)) {
      dayTarget = 0;
    } else {
      // Deduct leave
      const leaveDuration = leaveDurations.get(dayStr) || 0;
      dayTarget -= leaveDuration * 8.25;

      // Manual Half Day check (Today Only)
      if (isManualHalfDay && isSameDay(day, now)) {
        // If manual half day, target is 4.5h max
        if (dayTarget > 4.5) {
          dayTarget = 4.5;
        }
      }
    }

    dayTarget = Math.max(0, dayTarget);
    weeklyTargetHours += dayTarget;

    let workingValue = Math.max(0, 1 - (leaveDurations.get(dayStr) || 0));
    if (holidayDates.includes(dayStr)) workingValue = 0;

    totalWorkingDaysCount += workingValue;

    const dayDate = new Date(day);
    dayDate.setHours(0, 0, 0, 0);
    if (dayDate < today) {
      currentWorkingDayCount += workingValue;
    }
  });

  const remainingWorkingDaysCount =
    totalWorkingDaysCount - currentWorkingDayCount;

  // Calculate Total Worked (including today's real-time)
  let totalWorkedHours = 0;

  // Find today's entry for real-time calculation
  const todayEntry = attendanceData.find((entry) => {
    const entryDate = new Date(entry.attendanceDate);
    return isSameDay(entryDate, now);
  });

  let todayRealTimeHours = 0;
  if (todayEntry) {
    const { totalWorkedMinutes } = calculateMinutesFromAttendance([todayEntry]);
    todayRealTimeHours = totalWorkedMinutes / 60;
  }

  if (attendanceData && attendanceData.length > 0) {
    const weeklyAttendance = attendanceData.filter((entry) => {
      if (!entry.attendanceDate) return false;
      const entryDate = new Date(entry.attendanceDate);
      return isSameWeek(entryDate, now, { weekStartsOn: 1 });
    });

    weeklyAttendance.forEach((entry) => {
      const entryDate = new Date(entry.attendanceDate);
      if (isSameDay(entryDate, now)) {
        totalWorkedHours += todayRealTimeHours;
      } else {
        if (entry.totalEffectiveHours) {
          totalWorkedHours += entry.totalEffectiveHours;
        }
      }
    });

    // Ensure today is counted if not in array (e.g. if summary is stale/empty for today)
    // But if todayEntry is undefined, then todayRealTimeHours is 0.
    // If todayEntry IS defined but somehow not in weeklyAttendance (impossible if filtered correctly),
    // we're covered.
    // Edge case: if attendanceData does not have today's entry yet, we might want to Add it?
    // But we can only calculate it if we have the entry. So we are safe.
  }

  const remainingHours = Math.max(0, weeklyTargetHours - totalWorkedHours);

  // Average Hours (Past days only)
  let averageHours = 0;
  let pastDaysWorkedHours = 0;

  if (attendanceData) {
    const pastAttendance = attendanceData.filter((entry) => {
      if (!entry.attendanceDate) return false;
      const entryDate = new Date(entry.attendanceDate);
      // consistent with currentWorkingDayCount: days < today
      return (
        isSameWeek(entryDate, now, { weekStartsOn: 1 }) && entryDate < today
      );
    });
    pastAttendance.forEach(
      (entry) => (pastDaysWorkedHours += entry.totalEffectiveHours || 0),
    );
  }

  if (currentWorkingDayCount > 0) {
    averageHours = pastDaysWorkedHours / currentWorkingDayCount;
  } else if (currentWorkingDayCount === 0 && totalWorkedHours > 0 && !holidayDates.includes(format(now, "yyyy-MM-dd"))) {
    // If it's the first working day of the week (and not a holiday), show today's total work as average
    averageHours = totalWorkedHours;
  }

  let hoursNeededPerDay = 0;
  if (remainingWorkingDaysCount > 0) {
    const remainingForPeriod = Math.max(
      0,
      weeklyTargetHours - pastDaysWorkedHours,
    );
    hoursNeededPerDay = remainingForPeriod / remainingWorkingDaysCount;
  }

  return {
    holidays: holidayDates,
    leaveDaysCount: leaveCount,
    totalWorkingDays: totalWorkingDaysCount,
    currentWorkingDay: currentWorkingDayCount,
    remainingWorkingDays: remainingWorkingDaysCount,
    averageHours: averageHours || null,
    hoursNeededPerDay: hoursNeededPerDay || null,
    weeklyTarget: weeklyTargetHours,
    totalWorked: totalWorkedHours,
    remaining: remainingHours,
  };
};
