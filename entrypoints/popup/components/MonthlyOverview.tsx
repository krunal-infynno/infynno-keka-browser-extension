import { format, subMonths, startOfMonth } from "date-fns";
import pluralize from "pluralize";

interface MonthlyOverviewProps {
  loading: boolean;
  totalWorkingDays: number | null;
  currentWorkingDay: number | null;
  remainingWorkingDays: number | null;
  averageHours: number | null;
  hoursNeededPerDay: number | null;
  holidaysCount: number;
  leaveDaysCount: number;
  selectedMonth: Date;
  onMonthChange: (date: Date) => void;
}

export default function MonthlyOverview({
  loading,
  totalWorkingDays,
  currentWorkingDay,
  remainingWorkingDays,
  averageHours,
  hoursNeededPerDay,
  holidaysCount,
  leaveDaysCount,
  selectedMonth,
  onMonthChange,
}: MonthlyOverviewProps) {
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = subMonths(new Date(), i);
    return startOfMonth(d);
  });

  if (loading) {
    return (
      <div className="monthly-overview">
        <div className="monthly-header">
          <div className="month-selector-container">
            <select
              className="month-select"
              value={startOfMonth(selectedMonth).toISOString()}
              disabled={true}
            >
              <option>{format(selectedMonth, "MMMM yyyy")}</option>
            </select>
          </div>
        </div>
        <p className="loading">Loading monthly data...</p>
      </div>
    );
  }

  return (
    <div className="monthly-overview">
      <div className="monthly-header">
        <div className="month-selector-container">
          <select
            className="month-select"
            value={startOfMonth(selectedMonth).toISOString()}
            onChange={(e) => onMonthChange(new Date(e.target.value))}
          >
            {months.map((month) => (
              <option key={month.toISOString()} value={month.toISOString()}>
                {format(month, "MMMM yyyy")}
              </option>
            ))}
          </select>
        </div>
      </div>

      {totalWorkingDays === null && !loading ? (
        <p className="no-data">Unable to load monthly data</p>
      ) : (
        <div className="monthly-content">
          <div className="monthly-cards-row">
            <div className="monthly-card monthly-card-yellow">
              <div className="monthly-label">Total Days</div>
              <div className="monthly-value">{totalWorkingDays}</div>
            </div>
            <div className="monthly-card monthly-card-yellow">
              <div className="monthly-label">Worked Days</div>
              <div className="monthly-value">
                {currentWorkingDay !== null ? currentWorkingDay : "—"}
              </div>
            </div>
            <div className="monthly-card monthly-card-yellow">
              <div className="monthly-label">Remaining Days</div>
              <div className="monthly-value">
                {remainingWorkingDays !== null ? remainingWorkingDays : "—"}
              </div>
            </div>
          </div>
          <div className="monthly-cards-row">
            <div className="monthly-card monthly-card-green">
              <div className="monthly-label">Average Hours</div>
              <div className="monthly-value">
                {averageHours !== null && averageHours > 0
                  ? (() => {
                      const hours = Math.floor(averageHours);
                      const minutes = Math.round((averageHours - hours) * 60);
                      return `${hours}h ${minutes}m`;
                    })()
                  : "—"}
              </div>
            </div>
            <div className="monthly-card">
              <div className="monthly-label">Hours Needed/Day</div>
              <div className="monthly-value">
                {hoursNeededPerDay !== null && hoursNeededPerDay > 0
                  ? (() => {
                      const hours = Math.floor(hoursNeededPerDay);
                      const minutes = Math.round(
                        (hoursNeededPerDay - hours) * 60
                      );
                      return `${hours}h ${minutes}m`;
                    })()
                  : "—"}
              </div>
            </div>
          </div>
          {holidaysCount > 0 && (
            <div className="holidays-info">
              <div className="holidays-label">
                {pluralize("Holiday", holidaysCount, true)} this month
              </div>
            </div>
          )}
          {leaveDaysCount > 0 && (
            <div className="holidays-info">
              <div className="holidays-label">
                {pluralize("Leave", leaveDaysCount, true)} this month
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
