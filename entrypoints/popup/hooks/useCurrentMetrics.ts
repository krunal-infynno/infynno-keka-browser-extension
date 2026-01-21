import { useState, useEffect, useRef } from "react";
import { browser } from "wxt/browser";
import type { Metrics, LeaveTimeInfo, TimePair, Break, TimeEntry, AttendanceData } from "../../../utils/types";
import { generateMetricsFromMinutes, calculateLeaveTimeInfo, calculateTimePairsAndBreaks } from "../../../utils/calculations";

interface UseCurrentMetricsResult {
    metrics: Metrics | null;
    totalWorkedMinutes: number;
    isClockedIn: boolean;
    leaveTimeInfo: LeaveTimeInfo | null;
    timePairs: TimePair[];
    breaks: Break[];
    unpairedInEntry: TimeEntry | null;
    loading: boolean;
    error: string | null;
    refreshMetrics: () => void;
}

export const useCurrentMetrics = (isHalfDay: boolean): UseCurrentMetricsResult => {
    // Stored values (source of truth from background)
    const [storedMetrics, setStoredMetrics] = useState<Metrics | null>(null);
    const [storedAttendanceData, setStoredAttendanceData] = useState<AttendanceData[]>([]);
    const [storedTotalMinutes, setStoredTotalMinutes] = useState(0);
    const [isClockedIn, setIsClockedIn] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Live values (calculated locally)
    const [liveMetrics, setLiveMetrics] = useState<Metrics | null>(null);
    const [liveTotalMinutes, setLiveTotalMinutes] = useState(0);
    const [liveLeaveTimeInfo, setLiveLeaveTimeInfo] = useState<LeaveTimeInfo | null>(null);

    // Timer ref
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    const loadCurrentMetrics = async () => {
        try {
            const storedData = await browser.storage.local.get([
                'current_metrics',
                'current_total_worked_minutes',
                'current_is_clocked_in',
                'current_leave_time_info',
                'attendance_data',
                'last_updated'
            ]);

            if (storedData.current_metrics) {
                setStoredMetrics(storedData.current_metrics as Metrics);
                setStoredAttendanceData((storedData.attendance_data as AttendanceData[]) || []);
                setStoredTotalMinutes((storedData.current_total_worked_minutes as number) || 0);
                setIsClockedIn(!!(storedData.current_is_clocked_in as boolean));
                setLastUpdated((storedData.last_updated as number) || Date.now());

                // Check if data is quite old (stale)
                const lastUpdatedTime = storedData.last_updated as number;
                if (lastUpdatedTime && Date.now() - lastUpdatedTime > 5 * 60 * 1000) {
                    browser.runtime.sendMessage({ type: 'FORCE_CHECK' }).catch(() => { });
                }
            } else {
                // No metrics found, force a check
                browser.runtime.sendMessage({ type: 'FORCE_CHECK' }).catch(() => { });
            }
        } catch (error) {
            console.error("Error loading metrics:", error);
            setError("Failed to load metrics");
        } finally {
            setLoading(false);
        }
    };

    // Initial load and storage subscription
    useEffect(() => {
        loadCurrentMetrics();

        const handleStorageChange = (changes: any) => {
            if (changes.current_metrics || changes.last_updated) {
                loadCurrentMetrics();
            }
        };

        browser.storage.onChanged.addListener(handleStorageChange);
        return () => {
            browser.storage.onChanged.removeListener(handleStorageChange);
        };
    }, []);

    // Live update logic
    useEffect(() => {
        const updateLiveMetrics = () => {
            if (!storedMetrics) return;

            // If clocked in, add elapsed time
            let additionalMinutes = 0;
            if (isClockedIn && lastUpdated) {
                const diffMs = Date.now() - lastUpdated;
                additionalMinutes = Math.floor(diffMs / 1000 / 60);
            }

            const currentMinutes = storedTotalMinutes + additionalMinutes;

            // Only recalculate if minutes changed or half-day changed or we just loaded
            // But for smoother UI (if we show seconds later), we might want to run this often.
            // For now, minutes resolution is fine.

            const newMetrics = generateMetricsFromMinutes(currentMinutes, isHalfDay, isClockedIn);
            const newLeaveInfo = calculateLeaveTimeInfo(currentMinutes, isHalfDay);

            setLiveMetrics(newMetrics);
            setLiveTotalMinutes(currentMinutes);
            setLiveLeaveTimeInfo(newLeaveInfo);
        };

        // Run immediately
        updateLiveMetrics();

        // different interval based on status
        // If clocked in, check every 10s to update the minute counter as needed
        // If not clocked in, just run when dependencies change (no timer needed really, but we keep it simple)
        if (isClockedIn) {
            timerRef.current = setInterval(updateLiveMetrics, 10000); // 10 seconds
        }

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [storedMetrics, storedTotalMinutes, isClockedIn, lastUpdated, isHalfDay]);

    // Calculate pairs and breaks from stored attendance data
    const { timePairs, breaks, unpairedInEntry } = calculateTimePairsAndBreaks(storedAttendanceData);

    return {
        metrics: liveMetrics,
        totalWorkedMinutes: liveTotalMinutes,
        isClockedIn,
        leaveTimeInfo: liveLeaveTimeInfo,
        timePairs,
        breaks,
        unpairedInEntry,
        loading,
        error,
        refreshMetrics: loadCurrentMetrics
    };
};
