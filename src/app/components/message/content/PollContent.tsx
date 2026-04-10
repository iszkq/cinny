import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { IContent, MatrixEvent, Room, RoomEvent } from 'matrix-js-sdk';
import { Badge, Box, ProgressBar, Text, color, config } from 'folds';
import { SequenceCard } from '../../sequence-card';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { getMxIdLocalPart } from '../../../utils/matrix';
import { getMemberDisplayName } from '../../../utils/room';
import {
  createPollResponseContent,
  getPollModeLabel,
  hasPollEnded,
  parsePollData,
  POLL_RESPONSE_EVENT_TYPE,
  summarizePoll,
} from '../../../utils/polls';

type PollContentProps = {
  content: IContent;
  room?: Room;
  eventId?: string;
};

const getVisibilityLabel = (showVoters: boolean): string => (showVoters ? '显示昵称' : '隐藏昵称');

export function PollContent({ content, room, eventId }: PollContentProps) {
  const mx = useMatrixClient();
  const poll = useMemo(() => parsePollData(content), [content]);
  const [revision, setRevision] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [statusText, setStatusText] = useState<string>();
  const [statusError, setStatusError] = useState(false);

  useEffect(() => {
    if (!room || !eventId) return undefined;

    const handleTimeline = (event: MatrixEvent, eventRoom: Room) => {
      if (eventRoom.roomId !== room.roomId) return;
      if (event.getType() === 'm.room.redaction') {
        setRevision((current) => current + 1);
        return;
      }

      const relationEventId = event.getRelation()?.event_id;
      if (relationEventId === eventId || event.getId() === eventId) {
        setRevision((current) => current + 1);
      }
    };

    room.on(RoomEvent.Timeline, handleTimeline);
    return () => room.removeListener(RoomEvent.Timeline, handleTimeline);
  }, [room, eventId]);

  const summary = useMemo(() => {
    if (!poll || !room || !eventId) return undefined;
    return summarizePoll(room, eventId, poll, mx.getUserId() ?? undefined);
  }, [poll, room, eventId, mx, revision]);

  const setStatus = useCallback((message: string, error = false) => {
    setStatusText(message);
    setStatusError(error);
  }, []);

  const handleVote = useCallback(
    async (optionId: string) => {
      if (!poll || !room || !eventId) return;
      if (submitting) return;
      if (hasPollEnded(poll)) {
        setStatus('投票已截止，无法继续投票。', true);
        return;
      }

      const selectedSet = new Set(summary?.myAnswers ?? []);

      if (poll.mode === 'multiple') {
        if (selectedSet.has(optionId)) {
          selectedSet.delete(optionId);
        } else if (selectedSet.size >= poll.maxSelections) {
          setStatus(`该投票最多可选 ${poll.maxSelections} 项。`, true);
          return;
        } else {
          selectedSet.add(optionId);
        }
      } else if (selectedSet.size === 1 && selectedSet.has(optionId)) {
        selectedSet.clear();
      } else {
        selectedSet.clear();
        selectedSet.add(optionId);
      }

      const nextAnswers = poll.options
        .map((option) => option.id)
        .filter((id) => selectedSet.has(id))
        .slice(0, poll.maxSelections);

      setSubmitting(true);
      setStatus(nextAnswers.length > 0 ? '正在提交投票...' : '正在清除投票...');

      try {
        await Promise.all(
          (summary?.myResponseEventIds ?? []).map((responseEventId) =>
            mx.redactEvent(room.roomId, responseEventId)
          )
        );

        if (nextAnswers.length > 0) {
          await mx.sendEvent(
            room.roomId,
            POLL_RESPONSE_EVENT_TYPE,
            createPollResponseContent(eventId, nextAnswers) as never
          );
        }

        setStatus(nextAnswers.length > 0 ? '投票已更新。' : '已取消你的投票。');
        setRevision((current) => current + 1);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : '投票提交失败。', true);
      } finally {
        setSubmitting(false);
      }
    },
    [eventId, mx, poll, room, setStatus, submitting, summary]
  );

  if (!poll) {
    return (
      <Text size="T300" priority="300">
        该投票内容无法解析。
      </Text>
    );
  }

  const ended = hasPollEnded(poll);
  const summaryData = summary ?? {
    optionToUserIds: new Map<string, string[]>(),
    myAnswers: [],
    myResponseEventIds: [],
    totalSelections: 0,
    totalVoters: 0,
  };
  const maxVotes = Math.max(
    1,
    ...poll.options.map((option) => summaryData.optionToUserIds.get(option.id)?.length ?? 0)
  );

  return (
    <SequenceCard
      variant="SurfaceVariant"
      direction="Column"
      gap="300"
      style={{
        padding: config.space.S300,
        minWidth: 0,
      }}
    >
      <Box direction="Column" gap="100">
        <Text size="B400">{poll.title}</Text>
        {poll.description && (
          <Text size="T300" priority="300">
            {poll.description}
          </Text>
        )}
      </Box>

      <Box gap="100" style={{ flexWrap: 'wrap' }}>
        <Badge size="300" variant="Secondary" fill="Soft" radii="Pill">
          <Text size="T200">{getPollModeLabel(poll.mode)}</Text>
        </Badge>
        {poll.mode === 'multiple' && (
          <Badge size="300" variant="Secondary" fill="Soft" radii="Pill">
            <Text size="T200">{`最多选 ${poll.maxSelections} 项`}</Text>
          </Badge>
        )}
        <Badge
          size="300"
          variant={ended ? 'Critical' : 'Secondary'}
          fill={ended ? 'Soft' : 'Soft'}
          radii="Pill"
        >
          <Text size="T200">
            {ended
              ? '已截止'
              : poll.expiresAt
                ? `截止 ${new Date(poll.expiresAt).toLocaleString()}`
                : '长期有效'}
          </Text>
        </Badge>
        <Badge size="300" variant="Secondary" fill="Soft" radii="Pill">
          <Text size="T200">{getVisibilityLabel(poll.showVoters)}</Text>
        </Badge>
      </Box>

      <Box direction="Column" gap="200">
        {poll.options.map((option) => {
          const voterIds = summaryData.optionToUserIds.get(option.id) ?? [];
          const selected = summaryData.myAnswers.includes(option.id);
          const voterNames =
            poll.showVoters && room
              ? voterIds.map(
                  (userId) => getMemberDisplayName(room, userId) ?? getMxIdLocalPart(userId) ?? userId
                )
              : [];
          const visibleNames = voterNames.slice(0, 4).join('、');
          const namesSuffix =
            voterNames.length > 4 ? ` 等 ${voterNames.length} 人` : voterNames.length > 0 ? '' : '暂无记名投票';

          return (
            <Box
              key={option.id}
              as="button"
              type="button"
              direction="Column"
              gap="100"
              onClick={() => handleVote(option.id)}
              disabled={!room || !eventId || ended || submitting}
              style={{
                width: '100%',
                border: '1px solid rgba(120, 120, 120, 0.22)',
                borderRadius: 12,
                padding: config.space.S300,
                background: selected ? 'rgba(38, 132, 255, 0.10)' : 'transparent',
                cursor: !room || !eventId || ended || submitting ? 'default' : 'pointer',
                opacity: submitting && selected ? 0.75 : 1,
              }}
            >
              <Box justifyContent="SpaceBetween" alignItems="Center" gap="200">
                <Text size="B300" align="Left">
                  {option.text}
                </Text>
                <Text size="T200" priority="300" align="Right">
                  {`${voterIds.length} 票${selected ? ' · 已选' : ''}`}
                </Text>
              </Box>
              <ProgressBar
                variant="Secondary"
                size="300"
                min={0}
                max={maxVotes}
                value={voterIds.length}
                radii="300"
              />
              {poll.showVoters && (
                <Text size="T200" priority="300" align="Left">
                  {visibleNames ? `${visibleNames}${namesSuffix}` : namesSuffix}
                </Text>
              )}
            </Box>
          );
        })}
      </Box>

      <Box direction="Column" gap="50">
        <Text size="T200" priority="300">
          {`参与人数 ${summaryData.totalVoters}`}
          {poll.mode === 'multiple' ? ` · 累计选择 ${summaryData.totalSelections}` : ''}
        </Text>
        {!room || !eventId ? (
          <Text size="T200" priority="300">
            请在房间消息列表中打开该投票，以便直接参与投票。
          </Text>
        ) : (
          <Text size="T200" priority="300">
            {ended
              ? '该投票已经截止，只能查看结果。'
              : poll.mode === 'multiple'
                ? '点击选项即可切换你的投票选择。'
                : '点击任一选项即可投票，再次点击已选项可取消投票。'}
          </Text>
        )}
        {statusText && (
          <Text size="T200" style={{ color: statusError ? color.Critical.Main : undefined }}>
            {statusText}
          </Text>
        )}
      </Box>
    </SequenceCard>
  );
}
