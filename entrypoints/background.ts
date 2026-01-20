// Background service worker for continuous Keka monitoring and notifications

import { browser } from "wxt/browser";
import type { AttendanceData, Metrics, LeaveTimeInfo, NotificationStates } from "./popup/types";

interface TimeEntry {
  actualTimestamp: string;
  timestamp: string;
  punchStatus: number;
}

// In-memory state tracking (persisted to storage)
let prevMetrics: Metrics | null = null;
let prevTotalWorkedMinutes = 0;
let prevIsClockedIn = false;
let accessToken: string | null = null;
let isHalfDay = false;

// Get current date/week keys
function getCurrentDay(): string {
  return new Date().toISOString().split("T")[0];
}

function getCurrentWeek(): string {
  return `week_${new Date().getFullYear()}-${Math.floor(new Date().getDate() / 7)}`;
}

// Optimized notification helper
async function showNotification(title: string, message: string, requireInteraction = false) {
  try {
    if (!browser || !browser.notifications) {
      console.error("Notifications API not available");
      return;
    }
    await browser.notifications.create({
      type: "basic",
      iconUrl: "icon/128.png",
      title,
      message,
      requireInteraction,
      silent: false,
    });
  } catch (error) {
    console.error("Error showing notification:", error);
  }
}

// Storage helpers
async function getFromStorage<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const result = await browser.storage.local.get(key);
    return (result[key] !== undefined ? result[key] : defaultValue) as T;
  } catch (error) {
    console.error("Error reading from storage:", error);
    return defaultValue;
  }
}

async function setInStorage(key: string, value: any): Promise<void> {
  try {
    await browser.storage.local.set({ [key]: value });
  } catch (error) {
    console.error("Error writing to storage:", error);
  }
}

async function getNotificationStates(): Promise<NotificationStates> {
  const currentDay = getCurrentDay();
  const currentWeek = getCurrentWeek();

  const keys = [
    `completion_notified_${currentDay}`,
    `close_completion_notified_${currentDay}`,
    `overtime_notified_${currentDay}`,
    `clocked_in_too_long_notified_${currentDay}`,
    `break_reminder_notified_${currentDay}`,
    `leave_time_approaching_notified_${currentDay}`,
    `monthly_progress_notified_${currentWeek}`,
    `weekly_summary_notified_${currentWeek}`
  ];

  const result = await browser.storage.local.get(keys);

  return {
    completionNotifiedToday: Boolean(result[keys[0]]),
    closeToCompletionNotifiedToday: Boolean(result[keys[1]]),
    overtimeNotifiedToday: Boolean(result[keys[2]]),
    clockedInTooLongNotifiedToday: Boolean(result[keys[3]]),
    breakReminderNotifiedToday: Boolean(result[keys[4]]),
    leaveTimeApproachingNotifiedToday: Boolean(result[keys[5]]),
    monthlyProgressNotifiedThisWeek: Boolean(result[keys[6]]),
    weeklySummaryNotified: Boolean(result[keys[7]]),
  };
}

async function updateNotificationState(stateKey: keyof NotificationStates, value: boolean): Promise<void> {
  const currentDay = getCurrentDay();
  const currentWeek = getCurrentWeek();

  const keyMap: Record<keyof NotificationStates, string> = {
    completionNotifiedToday: `completion_notified_${currentDay}`,
    closeToCompletionNotifiedToday: `close_completion_notified_${currentDay}`,
    overtimeNotifiedToday: `overtime_notified_${currentDay}`,
    clockedInTooLongNotifiedToday: `clocked_in_too_long_notified_${currentDay}`,
    breakReminderNotifiedToday: `break_reminder_notified_${currentDay}`,
    leaveTimeApproachingNotifiedToday: `leave_time_approaching_notified_${currentDay}`,
    monthlyProgressNotifiedThisWeek: `monthly_progress_notified_${currentWeek}`,
    weeklySummaryNotified: `weekly_summary_notified_${currentWeek}`,
  };

  await setInStorage(keyMap[stateKey], value);
}

// Fetch attendance data from Keka API
async function fetchAttendanceData(token: string): Promise<AttendanceData[] | null> {
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
      console.error("API error response:", response.status);
      return null;
    }

    const responseData = await response.json();
    if (!responseData?.data || !Array.isArray(responseData.data)) {
      console.error("Invalid API response structure");
      return null;
    }

    return responseData.data;
  } catch (error) {
    console.error("Error fetching attendance data:", error);
    return null;
  }
}

// Calculate metrics from attendance data
function calculateMetrics(attendanceData: AttendanceData[], halfDay: boolean): {
  metrics: Metrics;
  totalWorkedMinutes: number;
  isClockedIn: boolean;
  leaveTimeInfo: LeaveTimeInfo | null;
} {
  if (!attendanceData.length) {
    return {
      metrics: {
        totalWorked: "0h 0m",
        remaining: "0h 0m",
        estCompletion: "00:00",
        isCompleted: false,
        isCloseToCompletion: false,
        totalWorkedStatus: "red",
        isOvertime: false,
        overtimeMinutes: 0,
      },
      totalWorkedMinutes: 0,
      isClockedIn: false,
      leaveTimeInfo: null,
    };
  }

  const lastEntry = attendanceData[attendanceData.length - 1];
  let pairs: any[] = [];
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
    const startDate = new Date((unpairedInEntry as any).actualTimestamp);
    const now = new Date();
    const additionalMinutes = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60));
    calculatedTotalWorkedMinutes += additionalMinutes;
  }

  const isClockedIn = !!unpairedInEntry;

  // Determine target
  const targetMinutes = halfDay ? 4 * 60 + 30 : 8 * 60 + 15;
  const remainingMinutes = Math.max(0, targetMinutes - calculatedTotalWorkedMinutes);
  const isOvertime = calculatedTotalWorkedMinutes > targetMinutes;
  const overtimeMinutes = isOvertime ? calculatedTotalWorkedMinutes - targetMinutes : 0;

  // Calculate completion status
  const isCompleted = remainingMinutes === 0;
  const isCloseToCompletion = remainingMinutes <= 30 && remainingMinutes > 0;

  // Determine status color
  let totalWorkedStatus: "yellow" | "green" | "red";
  if (halfDay) {
    const halfDayMax = 4 * 60 + 45;
    if (calculatedTotalWorkedMinutes < targetMinutes) {
      totalWorkedStatus = "yellow";
    } else if (calculatedTotalWorkedMinutes <= halfDayMax) {
      totalWorkedStatus = "green";
    } else {
      totalWorkedStatus = "red";
    }
  } else {
    const maxAcceptable = 8 * 60 + 30;
    if (calculatedTotalWorkedMinutes < targetMinutes) {
      totalWorkedStatus = "yellow";
    } else if (calculatedTotalWorkedMinutes <= maxAcceptable) {
      totalWorkedStatus = "green";
    } else {
      totalWorkedStatus = "red";
    }
  }

  // Format total worked
  const totalHours = Math.floor(calculatedTotalWorkedMinutes / 60);
  const totalMins = calculatedTotalWorkedMinutes % 60;
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
  } else {
    // Show when they will complete
    estCompletionTime = new Date(now.getTime() + (remainingMinutes * 60 * 1000));
  }
  const estCompletion = `${estCompletionTime.getHours().toString().padStart(2, '0')}:${estCompletionTime.getMinutes().toString().padStart(2, '0')}`;

  // Calculate leave times
  const normalTarget = halfDay ? 4 * 60 + 30 : 8 * 60 + 15;
  const normalRemainingMinutes = Math.max(0, normalTarget - calculatedTotalWorkedMinutes);
  const normalLeaveTime = new Date(now.getTime() + (normalRemainingMinutes * 60 * 1000));
  const normalLeaveTimeStr = `${normalLeaveTime.getHours() > 12 ? normalLeaveTime.getHours() - 12 : normalLeaveTime.getHours()}:${normalLeaveTime.getMinutes().toString().padStart(2, '0')} ${normalLeaveTime.getHours() >= 12 ? 'pm' : 'am'}`;

  const earlyTarget = halfDay ? 3 * 60 + 30 : 7 * 60;
  const earlyRemainingMinutes = Math.max(0, earlyTarget - calculatedTotalWorkedMinutes);
  const earlyLeaveTime = new Date(now.getTime() + (earlyRemainingMinutes * 60 * 1000));
  const earlyLeaveTimeStr = `${earlyLeaveTime.getHours() > 12 ? earlyLeaveTime.getHours() - 12 : earlyLeaveTime.getHours()}:${earlyLeaveTime.getMinutes().toString().padStart(2, '0')} ${earlyLeaveTime.getHours() >= 12 ? 'pm' : 'am'}`;

  const leaveTimeInfo: LeaveTimeInfo = {
    normalLeaveTime: normalLeaveTimeStr,
    earlyLeaveTime: earlyLeaveTimeStr,
  };

  const metrics: Metrics = {
    totalWorked,
    remaining,
    estCompletion,
    isCompleted,
    isCloseToCompletion,
    totalWorkedStatus,
    isOvertime,
    overtimeMinutes,
  };

  return {
    metrics,
    totalWorkedMinutes: calculatedTotalWorkedMinutes,
    isClockedIn,
    leaveTimeInfo,
  };
}

// Main notification logic (optimized version from React component)
async function runNotificationLogic() {
  try {
    // Get stored access token
    accessToken = await getFromStorage('access_token', null);
    if (!accessToken) {
      console.log('No access token available');
      return;
    }

    // Get half day setting
    isHalfDay = await getFromStorage(`halfDay_${getCurrentDay()}`, false);

    // Fetch fresh attendance data
    const attendanceData = await fetchAttendanceData(accessToken);
    if (!attendanceData) {
      console.log('Failed to fetch attendance data');
      return;
    }

    // Calculate current metrics
    const { metrics, totalWorkedMinutes, isClockedIn, leaveTimeInfo } = calculateMetrics(attendanceData, isHalfDay);

    // Get notification states
    const notificationStates = await getNotificationStates();

    // Check if values actually changed (performance optimization)
    const hasMetricsChanged = JSON.stringify(prevMetrics) !== JSON.stringify(metrics);
    const hasWorkedMinutesChanged = prevTotalWorkedMinutes !== totalWorkedMinutes;
    const hasClockedInChanged = prevIsClockedIn !== isClockedIn;

    // Update refs
    prevMetrics = metrics;
    prevTotalWorkedMinutes = totalWorkedMinutes;
    prevIsClockedIn = isClockedIn;

    // Only proceed if something relevant changed
    if (!hasMetricsChanged && !hasWorkedMinutesChanged && !hasClockedInChanged) {
      return;
    }

    const targetMinutes = isHalfDay ? 4 * 60 + 30 : 8 * 60 + 15;
    const notificationsToShow: Array<{ title: string; message: string; stateKey: keyof NotificationStates }> = [];

    // 1. Completion Notification
    if (!notificationStates.completionNotifiedToday) {
      const justCompleted = totalWorkedMinutes >= targetMinutes;
      if (justCompleted) {
        const message = isHalfDay
          ? "You've completed your half day target! You can leave now. 🎉"
          : "You've completed your full day target (8h 15m)! You can leave now. 🎉";
        notificationsToShow.push({
          title: "Work Target Completed! 🎯",
          message,
          stateKey: "completionNotifiedToday"
        });
      }
    }

    // 2. Close to Completion Notification
    if (!notificationStates.closeToCompletionNotifiedToday && !metrics.isCompleted && isClockedIn) {
      const remainingMinutes = targetMinutes - totalWorkedMinutes;
      const isCloseToCompletion = remainingMinutes <= 30 && remainingMinutes > 0;
      if (isCloseToCompletion) {
        const targetText = isHalfDay ? "4h 30m" : "8h 15m";
        notificationsToShow.push({
          title: "Almost There! ⏰",
          message: `Only ${remainingMinutes} minutes left to reach your ${targetText} target. Keep going! 💪`,
          stateKey: "closeToCompletionNotifiedToday"
        });
      }
    }

    // 3. Overtime Notification
    if (!notificationStates.overtimeNotifiedToday) {
      const isOvertime = totalWorkedMinutes > targetMinutes;
      const overtimeMinutes = totalWorkedMinutes - targetMinutes;
      const shouldNotify = isOvertime && (overtimeMinutes === 30 || overtimeMinutes % 60 === 0);

      if (shouldNotify && overtimeMinutes > 0) {
        const hours = Math.floor(overtimeMinutes / 60);
        const minutes = overtimeMinutes % 60;
        const timeString = hours > 0
          ? `${hours}h ${minutes > 0 ? `${minutes}m` : ''}`
          : `${minutes}m`;

        notificationsToShow.push({
          title: "Overtime Alert! ⏰",
          message: `You've worked ${timeString} overtime. Consider taking a break or logging out.`,
          stateKey: "overtimeNotifiedToday"
        });
      }
    }

    // 4. Clocked In Too Long Notification
    if (!notificationStates.clockedInTooLongNotifiedToday && isClockedIn) {
      const nineHours = 9 * 60;
      const isTooLong = totalWorkedMinutes >= nineHours;
      if (isTooLong) {
        notificationsToShow.push({
          title: "Long Work Session Alert! ⚠️",
          message: "You've been clocked in for 9+ hours. Remember to take breaks and prioritize your well-being!",
          stateKey: "clockedInTooLongNotifiedToday"
        });
      }
    }

    // 5. Break Reminder Notification
    if (!notificationStates.breakReminderNotifiedToday && isClockedIn) {
      const twoHours = 2 * 60;
      const shouldRemind = totalWorkedMinutes > 0 && totalWorkedMinutes % twoHours === 0;
      if (shouldRemind) {
        const hoursWorked = Math.floor(totalWorkedMinutes / 60);
        notificationsToShow.push({
          title: "Break Time! ☕",
          message: `You've worked ${hoursWorked} hours continuously. Take a 15-20 minute break to recharge!`,
          stateKey: "breakReminderNotifiedToday"
        });
      }
    }

    // 6. Leave Time Approaching Notification
    if (leaveTimeInfo && !notificationStates.leaveTimeApproachingNotifiedToday && isClockedIn) {
      try {
        const now = new Date();
        const timeParts = leaveTimeInfo.normalLeaveTime.split(/[:\s]/);
        let leaveHour = parseInt(timeParts[0]);
        if (leaveTimeInfo.normalLeaveTime.toLowerCase().includes('pm') && leaveHour !== 12) {
          leaveHour += 12;
        }

          const leaveTime = new Date();
          leaveTime.setHours(leaveHour, parseInt(timeParts[1] as string) || 0, 0, 0);

        const timeUntilLeave = (leaveTime.getTime() - now.getTime()) / (1000 * 60);
        if (timeUntilLeave <= 30 && timeUntilLeave > 0) {
          notificationsToShow.push({
            title: "Leave Time Approaching! 🏠",
            message: `Your leave time (${leaveTimeInfo.normalLeaveTime}) is approaching. Start wrapping up your work.`,
            stateKey: "leaveTimeApproachingNotifiedToday"
          });
        }
      } catch (error) {
        console.error("Error calculating leave time:", error);
      }
    }

    // Process notifications in batch
    if (notificationsToShow.length > 0) {
      console.log(`Showing ${notificationsToShow.length} notification(s)`);

      for (const notification of notificationsToShow) {
        await showNotification(notification.title, notification.message);
        await updateNotificationState(notification.stateKey, true);
      }
    }

    // Store current metrics in storage for the popup to read
    await browser.storage.local.set({
      current_metrics: metrics,
      current_total_worked_minutes: totalWorkedMinutes,
      current_is_clocked_in: isClockedIn,
      current_leave_time_info: leaveTimeInfo,
      last_updated: Date.now()
    });

  } catch (error) {
    console.error("Error in notification logic:", error);
  }
}

// Main background initialization
export default defineBackground(() => {
  console.log('Keka Background Service Started! 🎯');

  // Check if browser APIs are available
  if (!browser || !browser.alarms || !browser.runtime) {
    console.error('Browser APIs not available');
    return;
  }

  // Message handling for communication with popup
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'FORCE_CHECK') {
      runNotificationLogic();
      sendResponse({ success: true });
    }
    return true;
  });

  // Create periodic alarm to check metrics every minute
  browser.alarms.create('CHECK_METRICS', {
    periodInMinutes: 1, // Check every minute
    delayInMinutes: 0.1 // Start after 6 seconds
  }).catch((error) => {
    console.error('Error creating alarm:', error);
  });

  // Listen for alarm events
  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'CHECK_METRICS') {
      await runNotificationLogic();
    }
  });

  // Run initial check
  setTimeout(() => {
    runNotificationLogic();
  }, 2000);

  console.log('Background service initialized with 1-minute metric checks');
});
