export const WEEKLY_CALENDAR_VERSION = 2;

export type WeeklyCalendarMeeting = {
  id: string;
  sourceEventId: string;
  sourceTimestamp: number;
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  zoomMeetingId: string;
  locationText: string;
  createdAt: number;
  updatedAt: number;
};

export type WeeklyCalendarContent = {
  version: typeof WEEKLY_CALENDAR_VERSION;
  weekStart: string;
  roomId?: string;
  meetings: WeeklyCalendarMeeting[];
  initialScanCompleted: boolean;
  lastProcessedAt?: number;
  lastSyncedAt?: number;
  lastManualSyncedAt?: number;
  updatedAt: number;
};

export type ParsedMeeting = Omit<WeeklyCalendarMeeting, 'id' | 'createdAt' | 'updatedAt'>;

export type WeeklyCalendarSyncState = {
  status: 'idle' | 'syncing' | 'success' | 'error';
  message?: string;
};
