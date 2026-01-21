// Background service worker for continuous Keka monitoring and notifications
import { browser } from "wxt/browser";
import type { NotificationStates } from "../utils/types";
import { fetchAttendanceSummary, fetchHolidays, fetchLeaveSummary } from "../utils/api";
import { calculateMetrics, processMonthlyStats } from "../utils/calculations";
import { format } from "date-fns";

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

  /* 
   * Storage Keys Mapping:
   * Old keys are reused where possible, but new logic uses them differently or uses new keys.
   * To prevent issues with legacy data, we interpret them safely.
   */
  const keys = [
    `completion_notified_${currentDay}`,
    `overtime_notified_${currentDay}`,
    `clocked_in_too_long_notified_${currentDay}`,
    `leave_time_approaching_notified_${currentDay}`,
    `monthly_progress_notified_${currentWeek}`,
    `weekly_summary_notified_${currentWeek}`,
    `last_overtime_minutes_${currentDay}`,
    `lunch_break_notified_${currentDay}`,
    `tea_break_notified_${currentDay}`,
    `average_target_notified_${currentDay}`
  ];

  const result = await browser.storage.local.get(keys);

  return {
    completionNotifiedToday: Boolean(result[keys[0]]),
    overtimeNotifiedToday: Boolean(result[keys[1]]),
    clockedInTooLongNotifiedToday: Boolean(result[keys[2]]),
    leaveTimeApproachingNotifiedToday: Boolean(result[keys[3]]),
    monthlyProgressNotifiedThisWeek: Boolean(result[keys[4]]),
    weeklySummaryNotified: Boolean(result[keys[5]]),
    lastOvertimeNotifiedMinutes: typeof result[keys[6]] === 'number' ? (result[keys[6]] as number) : 0,
    lunchBreakNotifiedToday: Boolean(result[keys[7]]),
    teaBreakNotifiedToday: Boolean(result[keys[8]]),
    averageTargetNotifiedToday: Boolean(result[keys[9]]),
  };
}

async function updateNotificationState(stateKey: keyof NotificationStates, value: any): Promise<void> {
  const currentDay = getCurrentDay();
  const currentWeek = getCurrentWeek();

  const keyMap: Record<keyof NotificationStates, string> = {
    completionNotifiedToday: `completion_notified_${currentDay}`,
    overtimeNotifiedToday: `overtime_notified_${currentDay}`,
    clockedInTooLongNotifiedToday: `clocked_in_too_long_notified_${currentDay}`,
    leaveTimeApproachingNotifiedToday: `leave_time_approaching_notified_${currentDay}`,
    monthlyProgressNotifiedThisWeek: `monthly_progress_notified_${currentWeek}`,
    weeklySummaryNotified: `weekly_summary_notified_${currentWeek}`,
    lastOvertimeNotifiedMinutes: `last_overtime_minutes_${currentDay}`,
    lunchBreakNotifiedToday: `lunch_break_notified_${currentDay}`,
    teaBreakNotifiedToday: `tea_break_notified_${currentDay}`,
    averageTargetNotifiedToday: `average_target_notified_${currentDay}`,
  };

  await setInStorage(keyMap[stateKey], value);
}

// Main notification logic (optimized)
async function runNotificationLogic() {
  try {
    const currentDay = getCurrentDay();
    const storageKeys = ['access_token', `halfDay_${currentDay}`, 'attendance_data'];
    const storageData = await browser.storage.local.get(storageKeys);

    const accessToken = storageData.access_token as string;
    if (!accessToken) {
      // console.log('No access token available');
      return;
    }

    const isHalfDay = !!storageData[`halfDay_${currentDay}`];
    const storedAttendanceData = storageData.attendance_data;

    // Fetch fresh data
    // optimization: maybe we don't need holidays and leave EVERY minute, but for correctness of average calcs we fetch them.
    // In a real app we might cache these for the day.
    const [attendanceData, holidaysData] = await Promise.all([
      fetchAttendanceSummary(accessToken),
      fetchHolidays(accessToken)
    ]);

    // Fetch leave summary for today to check if on leave (needed for monthly stats mostly)
    let leaveData = null;
    try {
      const now = new Date();
      const currentDateStr = format(now, "yyyy-MM-dd");
      leaveData = await fetchLeaveSummary(accessToken, currentDateStr);
    } catch (e) {
      console.error("Failed to fetch leave data", e);
    }

    if (!attendanceData) {
      console.log('Failed to fetch attendance data');
      return;
    }

    // Calculate current metrics
    const { metrics, totalWorkedMinutes, isClockedIn, leaveTimeInfo } = calculateMetrics(attendanceData, isHalfDay);

    // Calculate monthly stats for "Average Target"
    const monthlyStats = processMonthlyStats(attendanceData, holidaysData, leaveData);
    const hoursNeededPerDay = monthlyStats.hoursNeededPerDay;

    // Get notification states
    const notificationStates = await getNotificationStates();

    const targetMinutes = isHalfDay ? 4 * 60 + 30 : 8 * 60 + 15;
    const notificationsToShow: Array<{ title: string; message: string; stateKey: keyof NotificationStates; newValue: any }> = [];
    const nowLocal = new Date();
    const currentHour = nowLocal.getHours();
    const currentMinute = nowLocal.getMinutes();

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
          stateKey: "completionNotifiedToday",
          newValue: true
        });
      }
    }

    // 2. Average Target Met (Happy Sense)
    // Only if hoursNeededPerDay is available and LESS than the standard 8h 15m (8.25)
    // and user has reached that target.
    if (!notificationStates.averageTargetNotifiedToday && hoursNeededPerDay !== null) {
      const standardTargetHours = 8.25; // 8h 15m
      // If needed is less than standard, it's a "happy" early leave day potentially
      if (hoursNeededPerDay < standardTargetHours) {
        const neededMinutes = Math.ceil(hoursNeededPerDay * 60);
        if (totalWorkedMinutes >= neededMinutes) {
          notificationsToShow.push({
            title: "Daily Average Met! 🌟",
            message: "You can leave now yeahh!!! No worries, your monthly 8h 15m average will still be completed! 🥳",
            stateKey: "averageTargetNotifiedToday",
            newValue: true
          });
        }
      }
    }

    // 3. Overtime
    if (totalWorkedMinutes > targetMinutes) {
      const overtimeMinutes = totalWorkedMinutes - targetMinutes;

      // Notify every 30 minutes of overtime
      // Use logic: current chunk > last notified chunk
      const currentOvertimeBase = Math.floor(overtimeMinutes / 30) * 30; // 0, 30, 60, 90...

      if (currentOvertimeBase > 0 && currentOvertimeBase > notificationStates.lastOvertimeNotifiedMinutes) {
        const hours = Math.floor(overtimeMinutes / 60);
        const minutes = overtimeMinutes % 60;
        const timeString = hours > 0
          ? `${hours}h ${minutes > 0 ? `${minutes}m` : ''}`
          : `${minutes}m`;

        notificationsToShow.push({
          title: "Overtime Alert! ⏰",
          message: `You've worked ${timeString} overtime. Consider taking a break or logging out.`,
          stateKey: "lastOvertimeNotifiedMinutes",
          newValue: currentOvertimeBase
        });

        // Also set the boolean flag for backward compatibility or general status
        if (!notificationStates.overtimeNotifiedToday) {
          notificationsToShow.push({
            title: "", // Hidden/Internal update
            message: "",
            stateKey: "overtimeNotifiedToday",
            newValue: true
          });
        }
      }
    }

    // 4. Clocked In Too Long
    if (!notificationStates.clockedInTooLongNotifiedToday && isClockedIn) {
      const nineHours = 9 * 60;
      const isTooLong = totalWorkedMinutes >= nineHours;
      if (isTooLong) {
        notificationsToShow.push({
          title: "Long Work Session Alert! ⚠️",
          message: "You've been clocked in for 9+ hours. Remember to take breaks and prioritize your well-being!",
          stateKey: "clockedInTooLongNotifiedToday",
          newValue: true
        });
      }
    }

    // 5. Lunch Break (12:30 PM)
    if (!notificationStates.lunchBreakNotifiedToday && isClockedIn) {
      // Trigger at 12:30 PM (handle a simpler window to ensure we catch it if timer slightly off)
      // Check if time is >= 12:30 and < 13:00 (broad window, but flag prevents repeat)
      // Or strictly 12:30-12:35
      if (currentHour === 12 && currentMinute >= 30) {
        notificationsToShow.push({
          title: "Lunch Break! 🥗",
          message: "It's 12:30 PM. Time to grab some lunch and recharge! 🍱",
          stateKey: "lunchBreakNotifiedToday",
          newValue: true
        });
      }
      // If user started AFTER 12:30, they might get this immediately? Yes, if isClockedIn. That seems acceptable.
    }

    // 6. Tea Break (4:00 PM)
    if (!notificationStates.teaBreakNotifiedToday && isClockedIn) {
      // Trigger at 4:00 PM (16:00)
      if (currentHour >= 16) {
        notificationsToShow.push({
          title: "Tea Break! ☕",
          message: "It's 4:00 PM. Take a short break for tea/coffee! 🫖",
          stateKey: "teaBreakNotifiedToday",
          newValue: true
        });
      }
    }

    // 7. Leave Time Approaching
    if (leaveTimeInfo && !notificationStates.leaveTimeApproachingNotifiedToday && isClockedIn) {
      try {
        const now = new Date();
        const timeParts = leaveTimeInfo.normalLeaveTime.split(/[:\s]/);
        if (timeParts.length >= 2) {
          let leaveHour = parseInt(timeParts[0]);
          // Check for PM and adjust if not 12
          if (leaveTimeInfo.normalLeaveTime.toLowerCase().includes('pm') && leaveHour !== 12) {
            leaveHour += 12;
          }
          // If AM and 12, it is midnight (0)
          if (leaveTimeInfo.normalLeaveTime.toLowerCase().includes('am') && leaveHour === 12) {
            leaveHour = 0;
          }

          const leaveTime = new Date();
          leaveTime.setHours(leaveHour, parseInt(timeParts[1] as string) || 0, 0, 0);

          const timeUntilLeave = (leaveTime.getTime() - now.getTime()) / (1000 * 60);
          if (timeUntilLeave <= 30 && timeUntilLeave > 0) {
            notificationsToShow.push({
              title: "Leave Time Approaching! 🏠",
              message: `Your leave time (${leaveTimeInfo.normalLeaveTime}) is approaching. Start wrapping up your work.`,
              stateKey: "leaveTimeApproachingNotifiedToday",
              newValue: true
            });
          }
        }
      } catch (error) {
        console.error("Error calculating leave time:", error);
      }
    }

    // Process notifications in batch
    if (notificationsToShow.length > 0) {
      console.log(`Showing ${notificationsToShow.length} notification(s)`);

      for (const notification of notificationsToShow) {
        // Show notification only if it has a title/message (might be internal update)
        if (notification.title && notification.message) {
          await showNotification(notification.title, notification.message);
        }
        await updateNotificationState(notification.stateKey, notification.newValue);
      }
    }

    // Check if data actually changed to avoid unnecessary storage writes and UI jitter
    const hasDataChanged = JSON.stringify(attendanceData) !== JSON.stringify(storedAttendanceData);

    if (hasDataChanged) {
      // Store current metrics in storage for the popup to read
      await browser.storage.local.set({
        current_metrics: metrics,
        current_total_worked_minutes: totalWorkedMinutes,
        current_is_clocked_in: isClockedIn,
        current_leave_time_info: leaveTimeInfo,
        attendance_data: attendanceData,
        last_updated: Date.now()
      });
    }

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
