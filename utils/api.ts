import { browser } from 'wxt/browser';
import type { AttendanceData } from './types';

const DEFAULT_DOMAIN = 'infynno.keka.com';

const getBaseUrl = async () => {
    const { keka_domain } = await browser.storage.local.get('keka_domain');
    let domain = (keka_domain as string) || DEFAULT_DOMAIN;
    if (!domain.startsWith('http')) {
        domain = `https://${domain}`;
    }
    return domain.replace(/\/$/, '');
};

interface RequestOptions {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
}

const apiRequest = async (endpoint: string, token: string, options: RequestOptions = {}) => {
    const baseUrl = await getBaseUrl();
    const url = `${baseUrl}${endpoint}`;
    const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
    };

    const response = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (response.status === 401 || response.status === 403) {
        throw new Error('Unauthorized');
    }

    if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
};

export const fetchAttendanceSummary = async (token: string): Promise<AttendanceData[] | null> => {
    try {
        const data = await apiRequest('/k/attendance/api/mytime/attendance/summary', token);
        if (data && data.data && Array.isArray(data.data)) {
            return data.data;
        }
        return null;
    } catch (error) {
        // Silently fail to avoid "Errors" tab clutter. The caller will handle missing data.
        return null;
    }
};

export const fetchHolidays = async (token: string) => {
    try {
        return await apiRequest('/k/dashboard/api/dashboard/holidays', token);
    } catch (error) {
        // Re-throw so caller knows it failed, but do not log console.error here
        throw error;
    }
}

export const fetchLeaveSummary = async (token: string, forDate: string) => {
    try {
        return await apiRequest(`/k/leave/api/me/leave/summary?forDate=${forDate}`, token);
    } catch (error) {
        // Re-throw so caller knows it failed, but do not log console.error here
        throw error;
    }
}
