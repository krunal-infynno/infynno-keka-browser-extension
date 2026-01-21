import { useEffect, useCallback, useMemo, useRef } from "react";
import type { Metrics, NotificationStates, NotificationServiceProps } from "../../../utils/types";
import { browser } from "wxt/browser";

export function NotificationService({
  accessToken,
  metrics,
  leaveTimeInfo,
  isClockedIn,
  isHalfDay,
  totalWorkedMinutes,
  isHalfDayLoaded,
  attendanceData,
  totalWorkingDays,
  currentWorkingDay,
  remainingWorkingDays,
  averageHours,
  notificationStates,
  setNotificationStates,
}: NotificationServiceProps) {
  // Refs to track previous values and prevent unnecessary operations
  const prevMetricsRef = useRef<Metrics | null>(null);
  const prevTotalWorkedMinutesRef = useRef<number>(0);
  const prevIsClockedInRef = useRef<boolean>(false);
  const prevDayRef = useRef<string>("");
  const prevWeekRef = useRef<string>("");
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Memoized calculations to prevent recalculation on every render
  const targetMinutes = useMemo(() => isHalfDay ? 4 * 60 + 30 : 8 * 60 + 15, [isHalfDay]);
  const currentDay = useMemo(() => new Date().toISOString().split("T")[0], []);
  const currentWeek = useMemo(() => `week_${new Date().getFullYear()}-${Math.floor(new Date().getDate() / 7)}`, []);

  // Optimized notification helper functions
  const showNotification = useCallback(async (title: string, message: string, requireInteraction = false) => {
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
  }, []);

  const saveNotificationState = useCallback(async (key: string, value: boolean | number) => {
    try {
      await browser.storage.local.set({ [key]: value });
    } catch (error) {
      console.error("Error saving notification state:", error);
    }
  }, []);

  // Batch state updates to prevent multiple re-renders
  const updateNotificationStates = useCallback((updates: Partial<NotificationStates>) => {
    setNotificationStates((prev: NotificationStates) => ({ ...prev, ...updates }));
  }, [setNotificationStates]);

  // Load notification states once on mount
  useEffect(() => {
    const loadNotificationStates = async () => {
      try {
        const keys = [
          `completion_notified_${currentDay}`,
          `overtime_notified_${currentDay}`,
          `clocked_in_too_long_notified_${currentDay}`,
          `leave_time_approaching_notified_${currentDay}`,
          `monthly_progress_notified_${currentWeek}`,
          `weekly_summary_notified_${currentWeek}`,
          `lunch_break_notified_${currentDay}`,
          `tea_break_notified_${currentDay}`,
          `average_target_notified_${currentDay}`
        ];

        const result = await browser.storage.local.get(keys);

        setNotificationStates({
          completionNotifiedToday: Boolean(result[keys[0]]),
          overtimeNotifiedToday: Boolean(result[keys[1]]),
          clockedInTooLongNotifiedToday: Boolean(result[keys[2]]),
          leaveTimeApproachingNotifiedToday: Boolean(result[keys[3]]),
          monthlyProgressNotifiedThisWeek: Boolean(result[keys[4]]),
          weeklySummaryNotified: Boolean(result[keys[5]]),
          lastOvertimeNotifiedMinutes: 0, // Default to 0 as we don't persist check exactly same way here or need separate load for number
          lunchBreakNotifiedToday: Boolean(result[keys[6]]),
          teaBreakNotifiedToday: Boolean(result[keys[7]]),
          averageTargetNotifiedToday: Boolean(result[keys[8]]),
        });
      } catch (err) {
        console.error("Error loading notification states:", err);
      }
    };

    loadNotificationStates();
  }, [currentDay, currentWeek, setNotificationStates]);

  // Consolidated notification logic with debouncing and memoization
  useEffect(() => {
    // Skip if basic conditions not met
    if (!isHalfDayLoaded) return;

    // Debounce rapid changes to prevent excessive notifications
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(async () => {
      // Check if any relevant values actually changed to avoid unnecessary work
      const hasMetricsChanged = JSON.stringify(prevMetricsRef.current) !== JSON.stringify(metrics);
      const hasWorkedMinutesChanged = prevTotalWorkedMinutesRef.current !== totalWorkedMinutes;
      const hasClockedInChanged = prevIsClockedInRef.current !== isClockedIn;
      const hasDayChanged = prevDayRef.current !== currentDay;
      const hasWeekChanged = prevWeekRef.current !== currentWeek;

      // Update refs
      prevMetricsRef.current = metrics;
      prevTotalWorkedMinutesRef.current = totalWorkedMinutes;
      prevIsClockedInRef.current = isClockedIn;
      prevDayRef.current = currentDay;
      prevWeekRef.current = currentWeek;

      // Only proceed if something relevant changed
      if (!hasMetricsChanged && !hasWorkedMinutesChanged && !hasClockedInChanged && !hasDayChanged && !hasWeekChanged) {
        return;
      }

      const notificationsToShow: Array<{ title: string; message: string; stateKey: Exclude<keyof NotificationStates, "lastOvertimeNotifiedMinutes">; storageKey: string }> = [];
      const nowLocal = new Date();
      const currentHour = nowLocal.getHours();
      const currentMinute = nowLocal.getMinutes();

      // 1. Completion Notification
      if (metrics && !notificationStates.completionNotifiedToday) {
        const justCompleted = totalWorkedMinutes >= targetMinutes;
        if (justCompleted) {
          const message = isHalfDay
            ? "You've completed your half day target! You can leave now. 🎉"
            : "You've completed your full day target (8h 15m)! You can leave now. 🎉";
          notificationsToShow.push({
            title: "Work Target Completed! 🎯",
            message,
            stateKey: "completionNotifiedToday",
            storageKey: `completion_notified_${currentDay}`
          });
        }
      }

      // 2. Average Target Met (Happy Sense)
      if (metrics && !notificationStates.averageTargetNotifiedToday) {
        if (averageHours !== null && totalWorkingDays && remainingWorkingDays) {
          if (totalWorkingDays > 0 && currentWorkingDay !== null && remainingWorkingDays && remainingWorkingDays > 0 && averageHours !== null) {
            const TARGET_AVERAGE_HOURS = 8.25;
            const totalHoursNeeded = totalWorkingDays * TARGET_AVERAGE_HOURS;
            const hoursWorkedSoFar = averageHours * currentWorkingDay;
            const hoursRemaining = totalHoursNeeded - hoursWorkedSoFar;
            const hoursNeededPerDay = hoursRemaining / remainingWorkingDays;

            if (hoursNeededPerDay < 8.25) {
              const neededMinutes = Math.ceil(hoursNeededPerDay * 60);
              if (totalWorkedMinutes >= neededMinutes) {
                notificationsToShow.push({
                  title: "Daily Average Met! 🌟",
                  message: "You can leave now yeahh!!! No worries, your monthly 8h 15m average will still be completed! 🥳",
                  stateKey: "averageTargetNotifiedToday",
                  storageKey: `average_target_notified_${currentDay}`
                });
              }
            }
          }
        }
      }

      // 3. Overtime Notification
      if (metrics && !notificationStates.overtimeNotifiedToday) {
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
            stateKey: "overtimeNotifiedToday",
            storageKey: `overtime_notified_${currentDay}`
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
            stateKey: "clockedInTooLongNotifiedToday",
            storageKey: `clocked_in_too_long_notified_${currentDay}`
          });
        }
      }

      // 5. Lunch Break (12:30 PM)
      if (!notificationStates.lunchBreakNotifiedToday && isClockedIn) {
        if (currentHour === 12 && currentMinute >= 30) {
          notificationsToShow.push({
            title: "Lunch Break! 🥗",
            message: "It's 12:30 PM. Time to grab some lunch and recharge! 🍱",
            stateKey: "lunchBreakNotifiedToday",
            storageKey: `lunch_break_notified_${currentDay}`
          });
        }
      }

      // 6. Tea Break (4:00 PM)
      if (!notificationStates.teaBreakNotifiedToday && isClockedIn) {
        if (currentHour >= 16) {
          notificationsToShow.push({
            title: "Tea Break! ☕",
            message: "It's 4:00 PM. Take a short break for tea/coffee! 🫖",
            stateKey: "teaBreakNotifiedToday",
            storageKey: `tea_break_notified_${currentDay}`
          });
        }
      }

      // 7. Leave Time Approaching Notification
      if (leaveTimeInfo && !notificationStates.leaveTimeApproachingNotifiedToday && isClockedIn) {
        try {
          const now = new Date();
          const timeParts = leaveTimeInfo.normalLeaveTime.split(/[:\s]/);
          let leaveHour = parseInt(timeParts[0]);
          if (leaveTimeInfo.normalLeaveTime.toLowerCase().includes('pm') && leaveHour !== 12) {
            leaveHour += 12;
          }
          if (leaveTimeInfo.normalLeaveTime.toLowerCase().includes('am') && leaveHour === 12) {
            leaveHour = 0;
          }

          const leaveTime = new Date();
          leaveTime.setHours(leaveHour, parseInt(timeParts[1]) || 0, 0, 0);

          const timeUntilLeave = (leaveTime.getTime() - now.getTime()) / (1000 * 60);
          if (timeUntilLeave <= 30 && timeUntilLeave > 0) {
            notificationsToShow.push({
              title: "Leave Time Approaching! 🏠",
              message: `Your leave time (${leaveTimeInfo.normalLeaveTime}) is approaching. Start wrapping up your work.`,
              stateKey: "leaveTimeApproachingNotifiedToday",
              storageKey: `leave_time_approaching_notified_${currentDay}`
            });
          }
        } catch (error) {
          console.error("Error calculating leave time:", error);
        }
      }

      // 8. Weekly Summary Notification (only on Fridays)
      if (!notificationStates.weeklySummaryNotified && accessToken) {
        const dayOfWeek = new Date().getDay();
        if (dayOfWeek === 5) { // Friday
          const message = averageHours && averageHours > 0
            ? `This week's total: ${Math.floor(averageHours * 5)}h ${Math.round((averageHours * 5 % 1) * 60)}m. Great job! Have a relaxing weekend. 🎉`
            : "Another productive week completed! Have a relaxing weekend. 🎉";

          notificationsToShow.push({
            title: "End of Week Summary 📈",
            message,
            stateKey: "weeklySummaryNotified",
            storageKey: `weekly_summary_notified_${currentWeek}`
          });
        }
      }

      // Process all notifications in batch
      if (notificationsToShow.length > 0) {
        const stateUpdates: Partial<NotificationStates> = {};
        const storagePromises: Promise<void>[] = [];

        for (const notification of notificationsToShow) {
          // Show notification
          await showNotification(notification.title, notification.message);

          // Prepare state update
          stateUpdates[notification.stateKey] = true;

          // Prepare storage update
          storagePromises.push(saveNotificationState(notification.storageKey, true));
        }

        // Batch state update
        updateNotificationStates(stateUpdates);

        // Batch storage updates
        await Promise.all(storagePromises);
      }

    }, 1000); // 1 second debounce

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [
    // Only depend on essential values to prevent excessive re-renders
    metrics,
    totalWorkedMinutes,
    isClockedIn,
    isHalfDayLoaded,
    leaveTimeInfo,
    accessToken,
    totalWorkingDays,
    currentWorkingDay,
    remainingWorkingDays,
    averageHours,
    notificationStates,
    targetMinutes,
    currentDay,
    currentWeek,
    showNotification,
    saveNotificationState,
    updateNotificationStates,
  ]);

  // This component doesn't render anything visible
  return null;
}
