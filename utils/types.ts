// Shared TypeScript interfaces for the Keka browser extension

export interface LeaveDetail {
  leaveTypeName: string;
  leaveDayStatus: number;
  startTime?: string;
  endTime?: string;
}

export interface TimeEntry {
  actualTimestamp: string;
  timestamp: string;
  punchStatus: number;
}

export interface AttendanceData {
  attendanceDate: string;
  timeEntries: TimeEntry[];
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
  overtimeNotifiedToday: boolean;
  lastOvertimeNotifiedMinutes: number;
  clockedInTooLongNotifiedToday: boolean;
  monthlyProgressNotifiedThisWeek: boolean;
  leaveTimeApproachingNotifiedToday: boolean;
  weeklySummaryNotified: boolean;
  lunchBreakNotifiedToday: boolean;
  teaBreakNotifiedToday: boolean;
  averageTargetNotifiedToday: boolean;
  tokenExpiredNotifiedToday: boolean;
}

export interface NotificationServiceProps {
  accessToken: string | null;
  metrics: Metrics | null;
  leaveTimeInfo: LeaveTimeInfo | null;
  isClockedIn: boolean;
  isHalfDay: boolean;
  totalWorkedMinutes: number;
  isHalfDayLoaded: boolean;
  attendanceData: AttendanceData[];
  totalWorkingDays: number | null;
  currentWorkingDay: number | null;
  remainingWorkingDays: number | null;
  averageHours: number | null;
  notificationStates: NotificationStates;
  setNotificationStates: React.Dispatch<React.SetStateAction<NotificationStates>>;
}

export interface TimePair {
  startTime: string;
  endTime: string;
  duration: string;
  durationMinutes: number;
}

export interface Break {
  startTime: string;
  endTime: string;
  duration: string;
}

export interface Holiday {
  date: string;
  [key: string]: any;
}

export interface HolidayResponse {
  data: Holiday[];
}

export interface LeaveHistoryEntry {
  date: string;
  change?: {
    duration: number;
  };
}

export interface LeaveResponse {
  data: {
    leaveHistory: LeaveHistoryEntry[];
  };
}

export interface MonthlyStats {
  holidayDates: string[];
  leaveCount: number;
  totalWorkingDaysCount: number;
  currentWorkingDayCount: number;
  remainingWorkingDaysCount: number;
  averageHours: number | null;
  hoursNeededPerDay: number | null;
}
