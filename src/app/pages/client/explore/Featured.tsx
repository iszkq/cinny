import classNames from 'classnames';
import FocusTrap from 'focus-trap-react';
import { useAtomValue, useSetAtom } from 'jotai';
import { SyncState } from 'matrix-js-sdk';
import React, { ChangeEventHandler, useCallback, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Line,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Scroll,
  Spinner,
  Text,
  config,
} from 'folds';
import { BackRouteHandler } from '../../../components/BackRouteHandler';
import { Page, PageContent, PageHeader, PageHero, PageHeroSection } from '../../../components/page';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useSyncState } from '../../../hooks/useSyncState';
import { isDesktopLikeScreenSize, useScreenSizeContext } from '../../../hooks/useScreenSize';
import { allRoomsAtom } from '../../../state/room-list/roomList';
import { weeklyCalendarAtom, weeklyCalendarSyncStateAtom } from '../../../state/weeklyCalendar';
import {
  formatLocalDate,
  getWeekDates,
  getWeeklyCalendarContent,
  selectWeeklyCalendarRoom,
  synchronizeWeeklyCalendar,
} from '../../../features/weekly-calendar/calendar';
import { WeeklyCalendarMeeting } from '../../../features/weekly-calendar/types';
import * as css from './WeeklyCalendar.css';

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

const formatMeetingTime = (meeting: WeeklyCalendarMeeting): string => {
  if (!meeting.startTime) return '全天';
  if (!meeting.endTime) return meeting.startTime;
  return `${meeting.startTime}–${meeting.endTime}`;
};

const formatDetailTime = (meeting: WeeklyCalendarMeeting): string => {
  const date = new Date(`${meeting.date}T00:00:00`);
  return `${date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })} ${formatMeetingTime(meeting)}`;
};

export function FeaturedRooms() {
  const mx = useMatrixClient();
  const allRooms = useAtomValue(allRoomsAtom);
  const storedCalendar = useAtomValue(weeklyCalendarAtom);
  const syncState = useAtomValue(weeklyCalendarSyncStateAtom);
  const setCalendar = useSetAtom(weeklyCalendarAtom);
  const setCalendarSyncState = useSetAtom(weeklyCalendarSyncStateAtom);
  const [connectionState, setConnectionState] = useState(mx.getSyncState());
  const [selectedMeeting, setSelectedMeeting] = useState<WeeklyCalendarMeeting>();
  const screenSize = useScreenSizeContext();
  const showBackButton = !isDesktopLikeScreenSize(screenSize);
  const calendar = storedCalendar ?? getWeeklyCalendarContent(mx);
  const todayKey = formatLocalDate(new Date());
  const weekDates = useMemo(
    () => getWeekDates(new Date(`${calendar.weekStart}T00:00:00`).getTime()),
    [calendar.weekStart]
  );

  const rooms = useMemo(
    () =>
      allRooms
        .map((roomId) => mx.getRoom(roomId))
        .filter((room): room is NonNullable<typeof room> => !!room && !room.isSpaceRoom())
        .sort((a, b) => (a.name ?? a.roomId).localeCompare(b.name ?? b.roomId)),
    [allRooms, mx]
  );

  useSyncState(
    mx,
    useCallback((current) => setConnectionState(current), [])
  );

  const handleRoomChange: ChangeEventHandler<HTMLSelectElement> = async (event) => {
    const roomId = event.currentTarget.value;
    if (!roomId || roomId === calendar.roomId) return;
    setCalendarSyncState({ status: 'syncing', message: '正在扫描本周消息…' });
    try {
      const selected = await selectWeeklyCalendarRoom(mx, roomId);
      setCalendar(selected);
      const synced = await synchronizeWeeklyCalendar(mx, true);
      setCalendar(synced);
      setCalendarSyncState({ status: 'success', message: '同步完成' });
    } catch (error) {
      setCalendarSyncState({
        status: 'error',
        message: error instanceof Error ? error.message : '房间同步失败',
      });
    }
  };

  const handleManualSync = async () => {
    if (!calendar.roomId || syncState.status === 'syncing') return;
    setCalendarSyncState({ status: 'syncing', message: '正在手动同步…' });
    try {
      const synced = await synchronizeWeeklyCalendar(mx, true);
      setCalendar(synced);
      setCalendarSyncState({ status: 'success', message: '同步完成' });
    } catch (error) {
      setCalendarSyncState({
        status: 'error',
        message: error instanceof Error ? error.message : '同步失败，请稍后重试',
      });
    }
  };

  const online =
    connectionState === SyncState.Syncing ||
    connectionState === SyncState.Prepared ||
    connectionState === SyncState.Catchup;
  const weekEnd = weekDates[6];
  const weekRange = `${weekDates[0].toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
  })}—${weekEnd.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}`;

  return (
    <Page>
      <PageHeader>
        <Box grow="Yes" alignItems="Center" gap="200">
          {showBackButton && (
            <BackRouteHandler>
              {(onBack) => (
                <IconButton onClick={onBack} aria-label="返回">
                  <Icon src={Icons.ArrowLeft} />
                </IconButton>
              )}
            </BackRouteHandler>
          )}
          <Box grow="Yes" direction="Column">
            <Text size="H4">本周日程</Text>
            <Text size="T200" priority="300">
              {weekRange}
            </Text>
          </Box>
          <Button
            size="300"
            variant="Secondary"
            onClick={handleManualSync}
            disabled={!calendar.roomId || syncState.status === 'syncing'}
            before={
              syncState.status === 'syncing' ? (
                <Spinner size="100" />
              ) : (
                <Icon src={Icons.RecentClock} size="100" />
              )
            }
          >
            <Text size="B300">{syncState.status === 'syncing' ? '同步中…' : '同步'}</Text>
          </Button>
        </Box>
      </PageHeader>

      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box className={css.PageContent} direction="Column" gap="400">
              <PageHeroSection style={{ paddingBottom: 0 }}>
                <PageHero
                  icon={<Icon size="600" src={Icons.RecentClock} />}
                  title="日程日历"
                  subTitle="选择一个房间，自动整理当前周的 Zoom 会议信息。"
                />
              </PageHeroSection>

              <Box className={css.Toolbar}>
                <select
                  className={css.RoomSelect}
                  aria-label="选择监测房间"
                  value={calendar.roomId ?? ''}
                  onChange={handleRoomChange}
                  disabled={syncState.status === 'syncing'}
                >
                  <option value="">选择一个房间</option>
                  {rooms.map((room) => (
                    <option key={room.roomId} value={room.roomId}>
                      {room.name ?? room.roomId}
                    </option>
                  ))}
                </select>
                <Box grow="Yes" className={css.Status}>
                  <Text size="T300" priority="300">
                    {calendar.roomId
                      ? `${online ? '在线监测' : '当前离线'} · ${
                          mx.getRoom(calendar.roomId)?.name ?? calendar.roomId
                        }`
                      : '选择房间后开始生成本周日程'}
                  </Text>
                  <Text size="T200" priority={syncState.status === 'error' ? '500' : '300'}>
                    {syncState.message ??
                      (calendar.lastSyncedAt
                        ? `最后同步：${new Date(calendar.lastSyncedAt).toLocaleString('zh-CN')}`
                        : '尚未同步')}
                  </Text>
                </Box>
              </Box>

              {!calendar.roomId ? (
                <Box
                  className={css.EmptyCalendar}
                  direction="Column"
                  alignItems="Center"
                  justifyContent="Center"
                  gap="200"
                >
                  <Icon src={Icons.RecentClock} size="500" />
                  <Text size="H4">还没有日程来源</Text>
                  <Text priority="300" align="Center">
                    请先选择一个房间。首次同步只扫描本周消息，不会影响聊天使用。
                  </Text>
                </Box>
              ) : (
                <div className={css.WeekScroller}>
                  <div className={css.WeekGrid}>
                    {weekDates.map((date, dayIndex) => {
                      const dateKey = formatLocalDate(date);
                      const meetings = calendar.meetings
                        .filter((meeting) => meeting.date === dateKey)
                        .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
                      const today = dateKey === todayKey;
                      const past = dateKey < todayKey;

                      return (
                        <Box
                          key={dateKey}
                          direction="Column"
                          className={classNames(
                            css.DayColumn,
                            today && css.TodayColumn,
                            past && css.PastColumn
                          )}
                        >
                          <Box className={css.DayHeader} alignItems="Center" gap="200">
                            <Box className={classNames(css.DayNumber, today && css.TodayNumber)}>
                              <Text size="B300">{date.getDate()}</Text>
                            </Box>
                            <Box direction="Column">
                              <Text size="B300">{WEEKDAY_LABELS[dayIndex]}</Text>
                              <Text size="T200" priority="300">
                                {today ? '今天' : past ? '已结束' : `${date.getMonth() + 1}月`}
                              </Text>
                            </Box>
                          </Box>
                          <div className={css.MeetingList}>
                            {meetings.length === 0 && <div className={css.EmptyDay}>暂无日程</div>}
                            {meetings.map((meeting) => (
                              <button
                                key={meeting.id}
                                type="button"
                                className={css.MeetingCard}
                                onClick={() => setSelectedMeeting(meeting)}
                              >
                                <Box direction="Column" gap="100">
                                  <Text size="L400" priority="300">
                                    {formatMeetingTime(meeting)}
                                  </Text>
                                  <Text size="B300" truncate>
                                    {meeting.title}
                                  </Text>
                                  <Text size="T200" priority="300" truncate>
                                    Zoom · {meeting.zoomMeetingId}
                                  </Text>
                                </Box>
                              </button>
                            ))}
                          </div>
                        </Box>
                      );
                    })}
                  </div>
                </div>
              )}
            </Box>
          </PageContent>
        </Scroll>
      </Box>

      <Overlay open={!!selectedMeeting} backdrop={<OverlayBackdrop />}>
        <OverlayCenter>
          <FocusTrap
            active={!!selectedMeeting}
            focusTrapOptions={{
              initialFocus: false,
              clickOutsideDeactivates: true,
              onDeactivate: () => setSelectedMeeting(undefined),
            }}
          >
            <Dialog className={css.Dialog} variant="Surface">
              {selectedMeeting && (
                <Box direction="Column">
                  <Header style={{ padding: `0 ${config.space.S200} 0 ${config.space.S400}` }}>
                    <Box grow="Yes">
                      <Text size="H4">会议详情</Text>
                    </Box>
                    <IconButton aria-label="关闭" onClick={() => setSelectedMeeting(undefined)}>
                      <Icon src={Icons.Cross} />
                    </IconButton>
                  </Header>
                  <Line variant="Surface" size="300" />
                  <Box direction="Column" gap="400" style={{ padding: config.space.S400 }}>
                    <Box className={css.DetailRow}>
                      <Text priority="300">何时</Text>
                      <Text className={css.BreakText}>{formatDetailTime(selectedMeeting)}</Text>
                    </Box>
                    <Box className={css.DetailRow}>
                      <Text priority="300">何事</Text>
                      <Text className={css.BreakText}>{selectedMeeting.title}</Text>
                    </Box>
                    <Box className={css.DetailRow}>
                      <Text priority="300">何地</Text>
                      <Box direction="Column" gap="100" className={css.BreakText}>
                        <Text>Zoom · {selectedMeeting.zoomMeetingId}</Text>
                        <Text priority="300">{selectedMeeting.locationText}</Text>
                      </Box>
                    </Box>
                    <Box className={css.DetailRow}>
                      <Text priority="300">更新于</Text>
                      <Text>{new Date(selectedMeeting.updatedAt).toLocaleString('zh-CN')}</Text>
                    </Box>
                  </Box>
                </Box>
              )}
            </Dialog>
          </FocusTrap>
        </OverlayCenter>
      </Overlay>
    </Page>
  );
}
