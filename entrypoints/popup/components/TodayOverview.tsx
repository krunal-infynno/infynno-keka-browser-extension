import { Fragment } from "react";
import { format, differenceInMinutes } from "date-fns";
import type { Metrics, LeaveTimeInfo, TimePair, Break, TimeEntry } from "../../../utils/types";

interface TodayOverviewProps {
    loading: boolean;
    error: string | null;
    metrics: Metrics | null;
    isHalfDay: boolean;
    leaveTimeInfo: LeaveTimeInfo | null;
    timePairs: TimePair[];
    breaks: Break[];
    unpairedInEntry: TimeEntry | null;
    totalWorkedMinutes: number;
    hoursNeededPerDay: number | null;
}

export default function TodayOverview({
    loading,
    error,
    metrics,
    isHalfDay,
    leaveTimeInfo,
    timePairs,
    breaks,
    unpairedInEntry,
    totalWorkedMinutes,
    hoursNeededPerDay,
}: TodayOverviewProps) {
    if (loading) {
        return <p className="loading">Loading attendance data...</p>;
    }

    if (error) {
        return <p className="error">{error}</p>;
    }

    if (!metrics) {
        return <p className="no-data">No attendance data found</p>;
    }

    return (
        <>
            <div className="metrics-row">
                <div
                    className={`metric-card total-worked-${metrics.totalWorkedStatus}`}
                >
                    <div className="metric-label">Total Worked</div>
                    <div className="metric-value">{metrics.totalWorked}</div>
                    {metrics.isOvertime && (
                        <div className="overtime-indicator">
                            Overtime: {Math.floor(metrics.overtimeMinutes / 60)}h{" "}
                            {metrics.overtimeMinutes % 60}m
                        </div>
                    )}
                </div>
                <div
                    className={`metric-card ${metrics.isCompleted
                        ? "completed"
                        : metrics.isCloseToCompletion
                            ? "warning"
                            : ""
                        }`}
                >
                    <div className="metric-label">Remaining</div>
                    <div className="metric-value">{metrics.remaining}</div>
                </div>
                <div
                    className={`metric-card ${metrics.isCompleted
                        ? "completed"
                        : metrics.isCloseToCompletion
                            ? "warning"
                            : ""
                        }`}
                >
                    <div className="metric-label">Est. Completion</div>
                    <div className="metric-value">{metrics.estCompletion}</div>
                </div>
            </div>
            {leaveTimeInfo && (
                <div className="leave-info">
                    <div className="leave-cards-row">
                        <div className="leave-card normal-leave">
                            <div className="leave-label">Normal Leave Time</div>
                            <div className="leave-sub-label">
                                ({isHalfDay ? "4h 30m" : "8h 15m"})
                            </div>
                            <div className="leave-time">
                                {leaveTimeInfo.normalLeaveTime}
                            </div>
                        </div>
                        <div className="leave-card">
                            <div className="leave-label">Early Leave Time</div>
                            <div className="leave-sub-label">
                                ({isHalfDay ? "3h 30m" : "7h"})
                            </div>
                            <div className="leave-time">
                                {leaveTimeInfo.earlyLeaveTime}
                            </div>
                        </div>
                        {hoursNeededPerDay && (
                            <div className="leave-card" style={{ borderColor: '#818cf8', backgroundColor: '#e0e7ff' }}>
                                <div className="leave-label" style={{ color: '#3730a3' }}>Monthly Avg Target</div>
                                <div className="leave-sub-label" style={{ color: '#4338ca' }}>
                                    ({(() => {
                                        const h = Math.floor(hoursNeededPerDay);
                                        const m = Math.round((hoursNeededPerDay - h) * 60);
                                        return `${h}h ${m}m`;
                                    })()})
                                </div>
                                <div className="leave-time">
                                    {(() => {
                                        const now = new Date();
                                        const targetMinutes = Math.floor(hoursNeededPerDay * 60);
                                        const remainingMinutes = Math.max(0, targetMinutes - totalWorkedMinutes);
                                        const leaveTime = new Date(now.getTime() + (remainingMinutes * 60 * 1000));
                                        const h = leaveTime.getHours();
                                        const m = leaveTime.getMinutes().toString().padStart(2, '0');
                                        const ampm = h >= 12 ? 'pm' : 'am';
                                        const h12 = h > 12 ? h - 12 : (h === 0 ? 12 : h);
                                        return `${h12}:${m} ${ampm}`;
                                    })()}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {(timePairs.length > 0 || unpairedInEntry) && (
                <div className="attendance-list">
                    <h3 className="list-title">Time Entries</h3>
                    <ul>
                        {timePairs.map((pair, index) => (
                            <Fragment key={`pair-${index}`}>
                                <li className="time-entry">
                                    <span className="time-range">
                                        {format(new Date(pair.startTime), "HH:mm")} -{" "}
                                        {format(new Date(pair.endTime), "HH:mm")}
                                    </span>
                                    <span className="duration">({pair.duration})</span>
                                </li>
                                {breaks[index] && (
                                    <li className="break-entry">
                                        <span className="time-range">
                                            {format(
                                                new Date(breaks[index].startTime),
                                                "h:mm a"
                                            )}{" "}
                                            to{" "}
                                            {format(
                                                new Date(breaks[index].endTime),
                                                "h:mm a"
                                            )}
                                        </span>
                                        <span className="break-duration">
                                            → {breaks[index].duration}
                                        </span>
                                    </li>
                                )}
                            </Fragment>
                        ))}
                        {unpairedInEntry && (
                            <li className="time-entry not-logged-out">
                                <span className="time-range">
                                    {format(
                                        new Date(unpairedInEntry.actualTimestamp),
                                        "HH:mm"
                                    )}{" "}
                                    - not logged out
                                </span>
                                <span className="duration">
                                    (
                                    {(() => {
                                        const startDate = new Date(
                                            unpairedInEntry.actualTimestamp
                                        );
                                        const now = new Date();
                                        const totalMinutes = differenceInMinutes(
                                            now,
                                            startDate
                                        );
                                        const hours = Math.floor(totalMinutes / 60);
                                        const minutes = totalMinutes % 60;
                                        return `${hours}h ${minutes}m`;
                                    })()}
                                    )
                                </span>
                            </li>
                        )}
                    </ul>
                </div>
            )}
        </>
    );
}
