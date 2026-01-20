// Shared TypeScript interfaces for the Keka browser extension

export interface LeaveDetail {
  leaveTypeName: string;
  leaveDayStatus: number;
  startTime?: string;
  endTime?: string;
}

export interface AttendanceData {
  attendanceDate: string;
  timeEntries: any[];
  leaveDayStatuses: number[];
  leaveDetails: LeaveDetail[];
  totalEffectiveHours?: number;
}

export interface Metrics {
  totalWorked: string;
  remaining: string;
  estCompletion: string;
  isCompleted: boolean;
  isCloseToCompletion: boolean;
  totalWorkedStatus: "yellow" | "green" | "red";
  isOvertime: boolean;
  overtimeMinutes: number;
}

export interface LeaveTimeInfo {
  normalLeaveTime: string;
  earlyLeaveTime: string;
}

export interface NotificationStates {
  completionNotifiedToday: boolean;
  closeToCompletionNotifiedToday: boolean;
  overtimeNotifiedToday: boolean;
  clockedInTooLongNotifiedToday: boolean;
  breakReminderNotifiedToday: boolean;
  monthlyProgressNotifiedThisWeek: boolean;
  leaveTimeApproachingNotifiedToday: boolean;
  weeklySummaryNotified: boolean;
}

export interface NotificationServiceProps {
  accessToken: string | null;
  metrics: Metrics | null;
  leaveTimeInfo: LeaveTimeInfo | null;
  isClockedIn: boolean;
  isHalfDay: boolean;
  totalWorkedMinutes: number;
  isHalfDayLoaded: boolean;
  attendanceData: any[];
  totalWorkingDays: number | null;
  currentWorkingDay: number | null;
  remainingWorkingDays: number | null;
  averageHours: number | null;
  notificationStates: NotificationStates;
  setNotificationStates: React.Dispatch<React.SetStateAction<NotificationStates>>;
}
