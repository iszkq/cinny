import { useAtomValue, useSetAtom } from 'jotai';
import {
  MatrixEvent,
  MatrixEventEvent,
  RoomEvent,
  RoomEventHandlerMap,
  SyncState,
} from 'matrix-js-sdk';
import { useCallback, useEffect, useRef } from 'react';
import { useAccountData } from '../../hooks/useAccountData';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useSyncState } from '../../hooks/useSyncState';
import { weeklyCalendarAtom, weeklyCalendarSyncStateAtom } from '../../state/weeklyCalendar';
import { AccountDataEvent } from '../../../types/matrix/accountData';
import {
  applyLiveMeetingEvents,
  getCalendarWeekStartKey,
  getWeeklyCalendarContent,
  normalizeWeeklyCalendarContent,
  resetWeeklyCalendarWeek,
  synchronizeWeeklyCalendar,
} from './calendar';

const LIVE_EVENT_BATCH_DELAY_MS = 800;

const isHealthySyncState = (state: SyncState | null): boolean =>
  state === SyncState.Prepared || state === SyncState.Syncing || state === SyncState.Catchup;

const getNextWeekDelay = (): number => {
  const now = new Date();
  const nextWeek = new Date(now);
  const day = now.getDay();
  nextWeek.setDate(now.getDate() + (day === 0 ? 1 : 8 - day));
  nextWeek.setHours(0, 0, 0, 50);
  return Math.max(1000, nextWeek.getTime() - now.getTime());
};

export function WeeklyCalendarMonitor() {
  const mx = useMatrixClient();
  const accountEvent = useAccountData(AccountDataEvent.CinnyWeeklyCalendar);
  const calendar = useAtomValue(weeklyCalendarAtom);
  const setCalendar = useSetAtom(weeklyCalendarAtom);
  const setSyncState = useSetAtom(weeklyCalendarSyncStateAtom);
  const bootstrappedRef = useRef<string>();
  const pendingEventsRef = useRef<Map<string, MatrixEvent>>(new Map());
  const flushTimerRef = useRef<number>();

  const publishSync = useCallback(
    async (manual = false) => {
      setSyncState({ status: 'syncing', message: manual ? '正在手动同步…' : '正在同步日程…' });
      try {
        const content = await synchronizeWeeklyCalendar(mx, manual);
        setCalendar(content);
        setSyncState({ status: 'success', message: '同步完成' });
        return content;
      } catch (error) {
        setSyncState({
          status: 'error',
          message: error instanceof Error ? error.message : '日程同步失败',
        });
        throw error;
      }
    },
    [mx, setCalendar, setSyncState]
  );

  useEffect(() => {
    const raw = accountEvent?.getContent();
    const normalized = normalizeWeeklyCalendarContent(raw);
    const active = getWeeklyCalendarContent(mx);
    setCalendar(active);

    if (normalized.weekStart !== getCalendarWeekStartKey()) {
      resetWeeklyCalendarWeek(mx)
        .then(setCalendar)
        .catch(() => undefined);
    }
  }, [accountEvent, mx, setCalendar]);

  useEffect(() => {
    if (!calendar?.roomId) return;
    const key = `${calendar.weekStart}:${calendar.roomId}`;
    if (bootstrappedRef.current === key) return;
    bootstrappedRef.current = key;
    publishSync().catch(() => undefined);
  }, [calendar?.roomId, calendar?.weekStart, publishSync]);

  const flushPendingEvents = useCallback(() => {
    flushTimerRef.current = undefined;
    const active = getWeeklyCalendarContent(mx);
    if (!active.roomId || pendingEventsRef.current.size === 0) return;

    const events = Array.from(pendingEventsRef.current.values());
    pendingEventsRef.current.clear();
    applyLiveMeetingEvents(mx, active.roomId, events)
      .then(setCalendar)
      .catch(() => undefined);
  }, [mx, setCalendar]);

  const queueEvent = useCallback(
    (event: MatrixEvent, roomId?: string) => {
      const active = getWeeklyCalendarContent(mx);
      if (!active.roomId || roomId !== active.roomId) return;
      const eventId = event.getId();
      if (!eventId) return;
      pendingEventsRef.current.set(eventId, event);
      if (flushTimerRef.current === undefined) {
        flushTimerRef.current = window.setTimeout(flushPendingEvents, LIVE_EVENT_BATCH_DELAY_MS);
      }
    },
    [flushPendingEvents, mx]
  );

  useEffect(() => {
    const pendingEvents = pendingEventsRef.current;
    const handleTimeline: RoomEventHandlerMap[RoomEvent.Timeline] = (
      event,
      room,
      _toStartOfTimeline,
      _removed,
      data
    ) => {
      if (!data.liveEvent || !room) return;
      queueEvent(event, room.roomId);
    };
    const handleDecrypted = (event: MatrixEvent) => {
      queueEvent(event, event.getRoomId() ?? undefined);
    };

    mx.on(RoomEvent.Timeline, handleTimeline);
    mx.on(MatrixEventEvent.Decrypted, handleDecrypted);
    return () => {
      mx.removeListener(RoomEvent.Timeline, handleTimeline);
      mx.off(MatrixEventEvent.Decrypted, handleDecrypted);
      if (flushTimerRef.current !== undefined) window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = undefined;
      pendingEvents.clear();
    };
  }, [mx, queueEvent]);

  useSyncState(
    mx,
    useCallback(
      (current, previous) => {
        if (
          isHealthySyncState(current) &&
          previous !== null &&
          previous !== undefined &&
          !isHealthySyncState(previous) &&
          getWeeklyCalendarContent(mx).roomId
        ) {
          publishSync().catch(() => undefined);
        }
      },
      [mx, publishSync]
    )
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      resetWeeklyCalendarWeek(mx)
        .then((content) => {
          bootstrappedRef.current = undefined;
          setCalendar(content);
        })
        .catch(() => undefined);
    }, getNextWeekDelay());
    return () => window.clearTimeout(timer);
  }, [calendar?.weekStart, mx, setCalendar]);

  return null;
}
