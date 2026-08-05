import { atom } from 'jotai';
import { WeeklyCalendarContent, WeeklyCalendarSyncState } from '../features/weekly-calendar/types';

export const weeklyCalendarAtom = atom<WeeklyCalendarContent | undefined>(undefined);

export const weeklyCalendarSyncStateAtom = atom<WeeklyCalendarSyncState>({ status: 'idle' });
