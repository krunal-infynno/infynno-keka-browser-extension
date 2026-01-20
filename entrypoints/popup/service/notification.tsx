import { useEffect, useCallback, useMemo, useRef } from "react";
import type { Metrics, NotificationStates, NotificationServiceProps } from "../types";

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

  const saveNotificationState = useCallback(async (key: string, value: boolean) => {
    try {
      await browser.storage.local.set({ [key]: value });
    } catch (error) {
      console.error("Error saving notification state:", error);
    }
  }, []);

  // Batch state updates to prevent multiple re-renders
  const updateNotificationStates = useCallback((updates: Partial<NotificationStates>) => {
    setNotificationStates(prev => ({ ...prev, ...updates }));
  }, [setNotificationStates]);

  // Load notification states once on mount
  useEffect(() => {
    const loadNotificationStates = async () => {
      try {
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

        setNotificationStates({
          completionNotifiedToday: Boolean(result[keys[0]]),
          closeToCompletionNotifiedToday: Boolean(result[keys[1]]),
          overtimeNotifiedToday: Boolean(result[keys[2]]),
          clockedInTooLongNotifiedToday: Boolean(result[keys[3]]),
          breakReminderNotifiedToday: Boolean(result[keys[4]]),
          leaveTimeApproachingNotifiedToday: Boolean(result[keys[5]]),
          monthlyProgressNotifiedThisWeek: Boolean(result[keys[6]]),
          weeklySummaryNotified: Boolean(result[keys[7]]),
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

      const notificationsToShow: Array<{ title: string; message: string; stateKey: keyof NotificationStates; storageKey: string }> = [];

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

      // 2. Close to Completion Notification (only if not completed and clocked in)
      if (metrics && !notificationStates.closeToCompletionNotifiedToday && !metrics.isCompleted && isClockedIn) {
        const remainingMinutes = targetMinutes - totalWorkedMinutes;
        const isCloseToCompletion = remainingMinutes <= 30 && remainingMinutes > 0;
        if (isCloseToCompletion) {
          const targetText = isHalfDay ? "4h 30m" : "8h 15m";
          notificationsToShow.push({
            title: "Almost There! ⏰",
            message: `Only ${remainingMinutes} minutes left to reach your ${targetText} target. Keep going! 💪`,
            stateKey: "closeToCompletionNotifiedToday",
            storageKey: `close_completion_notified_${currentDay}`
          });
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

      // 5. Break Reminder Notification
      if (!notificationStates.breakReminderNotifiedToday && isClockedIn) {
        const twoHours = 2 * 60;
        const shouldRemind = totalWorkedMinutes > 0 && totalWorkedMinutes % twoHours === 0;
        if (shouldRemind) {
          const hoursWorked = Math.floor(totalWorkedMinutes / 60);
          notificationsToShow.push({
            title: "Break Time! ☕",
            message: `You've worked ${hoursWorked} hours continuously. Take a 15-20 minute break to recharge!`,
            stateKey: "breakReminderNotifiedToday",
            storageKey: `break_reminder_notified_${currentDay}`
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

      // 7. Monthly Progress Notification (only on Wednesdays)
      if (!notificationStates.monthlyProgressNotifiedThisWeek && accessToken && totalWorkingDays && currentWorkingDay) {
        const dayOfWeek = new Date().getDay();
        if (dayOfWeek === 3) { // Wednesday
          const progressPercent = (currentWorkingDay / totalWorkingDays) * 100;
          const avgHoursText = averageHours && averageHours > 0
            ? `${Math.floor(averageHours)}h ${Math.round((averageHours % 1) * 60)}m`
            : "calculating...";

          notificationsToShow.push({
            title: "Mid-Week Progress Check 📊",
            message: `You've completed ${currentWorkingDay}/${totalWorkingDays} working days this month (${Math.round(progressPercent)}%). Average: ${avgHoursText}`,
            stateKey: "monthlyProgressNotifiedThisWeek",
            storageKey: `monthly_progress_notified_${currentWeek}`
          });
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
