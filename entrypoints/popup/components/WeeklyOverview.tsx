import pluralize from "pluralize";
import {
  format,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  isSameWeek,
} from "date-fns";

interface WeeklyOverviewProps {
  loading: boolean;
  weeklyTarget: number;
  totalWorked: number;
  remaining: number;
  averageHours: number | null;
  hoursNeededPerDay: number | null;
  holidaysCount: number;
  leaveDaysCount: number;
  totalWorkingDays: number | null;
  currentWorkingDay: number | null;
  remainingWorkingDays: number | null;
  selectedDate: Date;
  onDateChange: (date: Date) => void;
}

export default function WeeklyOverview({
  loading,
  weeklyTarget,
  totalWorked,
  remaining,
  averageHours,
  hoursNeededPerDay,
  holidaysCount,
  leaveDaysCount,
  totalWorkingDays,
  currentWorkingDay,
  remainingWorkingDays,
  selectedDate,
  onDateChange,
}: WeeklyOverviewProps) {
  // Format hours helper
  const formatHours = (val: number) => {
    const h = Math.floor(val);
    const m = Math.round((val - h) * 60);
    return `${h}h ${m}m`;
  };

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
  const isCurrentWeek = isSameWeek(selectedDate, new Date(), {
    weekStartsOn: 1,
  });

  const handlePrevWeek = () => {
    onDateChange(subWeeks(selectedDate, 1));
  };

  const handleNextWeek = () => {
    if (!isCurrentWeek) {
      onDateChange(addWeeks(selectedDate, 1));
    }
  };

  return (
    <div className="monthly-overview">
      <div className="monthly-header">
        <div
          className="week-selector-container"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#fff",
            borderRadius: "6px",
            border: "1px solid #e5e7eb",
            padding: "4px",
          }}
        >
          <button
            onClick={handlePrevWeek}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              padding: "4px 8px",
              color: "#6b7280",
            }}
          >
            ←
          </button>
          <span style={{ fontSize: "12px", fontWeight: 500, color: "#374151" }}>
            {format(weekStart, "dd MMM")} - {format(weekEnd, "dd MMM yyyy")}
          </span>
          <button
            onClick={handleNextWeek}
            disabled={isCurrentWeek}
            style={{
              border: "none",
              background: "transparent",
              cursor: isCurrentWeek ? "not-allowed" : "pointer",
              padding: "4px 8px",
              color: isCurrentWeek ? "#d1d5db" : "#6b7280",
            }}
          >
            →
          </button>
        </div>
      </div>

      {loading ? (
        <p className="loading">Loading weekly data...</p>
      ) : (
        <div className="monthly-content">
          <div className="monthly-cards-row">
            <div className="monthly-card monthly-card-yellow">
              <div className="monthly-label">Weekly Target</div>
              <div className="monthly-value">{formatHours(weeklyTarget)}</div>
            </div>
            <div
              className={`monthly-card ${
                totalWorked >= weeklyTarget
                  ? "monthly-card-green"
                  : "monthly-card-yellow"
              }`}
            >
              <div className="monthly-label">Total Worked</div>
              <div className="monthly-value">{formatHours(totalWorked)}</div>
            </div>
          </div>

          <div className="monthly-cards-row">
            <div className="monthly-card monthly-card-yellow">
              <div className="monthly-label">Remaining</div>
              <div className="monthly-value">
                {remaining > 0 ? formatHours(remaining) : "Completed"}
              </div>
            </div>
            <div className="monthly-card monthly-card-green">
              <div className="monthly-label">Avg Hours/Day</div>
              <div className="monthly-value">
                {averageHours !== null && averageHours > 0
                  ? formatHours(averageHours)
                  : "—"}
              </div>
            </div>
          </div>

          <div className="monthly-cards-row">
            <div className="monthly-card">
              <div className="monthly-label">Needed/Day</div>
              <div className="monthly-value">
                {hoursNeededPerDay !== null && hoursNeededPerDay > 0
                  ? formatHours(hoursNeededPerDay)
                  : "—"}
              </div>
            </div>
            <div className="monthly-card monthly-card-yellow">
              <div className="monthly-label">Worked Days</div>
              <div className="monthly-value">
                {currentWorkingDay !== null ? currentWorkingDay : "0"} /{" "}
                {totalWorkingDays !== null ? totalWorkingDays : "0"}
              </div>
            </div>
          </div>

          {remainingWorkingDays !== null && remainingWorkingDays > 0 && (
            <div className="holidays-info">
              <div className="holidays-label">
                {pluralize("day", remainingWorkingDays, true)} remaining this
                week
              </div>
            </div>
          )}

          {holidaysCount > 0 && (
            <div className="holidays-info">
              <div className="holidays-label">
                {pluralize("Holiday", holidaysCount, true)} this week
              </div>
            </div>
          )}
          {leaveDaysCount > 0 && (
            <div className="holidays-info">
              <div className="holidays-label">
                {pluralize("Leave day", leaveDaysCount, true)} this week
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
