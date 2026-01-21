
interface MonthlyOverviewProps {
    loading: boolean;
    totalWorkingDays: number | null;
    currentWorkingDay: number | null;
    remainingWorkingDays: number | null;
    averageHours: number | null;
    hoursNeededPerDay: number | null;
    holidaysCount: number;
    leaveDaysCount: number;
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
}: MonthlyOverviewProps) {
    if (loading) {
        return <p className="loading">Loading monthly data...</p>;
    }

    if (totalWorkingDays === null) {
        return <p className="no-data">Unable to load monthly data</p>;
    }

    return (
        <div className="monthly-overview">
            <div className="monthly-content">
                <div className="monthly-cards-row">
                    <div className="monthly-card monthly-card-yellow">
                        <div className="monthly-label">Total Days</div>
                        <div className="monthly-value">{totalWorkingDays}</div>
                    </div>
                    <div className="monthly-card monthly-card-yellow">
                        <div className="monthly-label">Current Day</div>
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
                            {holidaysCount} Holiday{holidaysCount !== 1 ? "s" : ""} this month
                        </div>
                    </div>
                )}
                {leaveDaysCount > 0 && (
                    <div className="holidays-info">
                        <div className="holidays-label">
                            {leaveDaysCount} Leave{leaveDaysCount !== 1 ? "s" : ""} this month
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
