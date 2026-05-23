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

const CN = {
  visibleVoters: '\u663e\u793a\u6635\u79f0',
  hiddenVoters: '\u9690\u85cf\u6635\u79f0',
  endedCannotVote: '\u6295\u7968\u5df2\u622a\u6b62\uff0c\u65e0\u6cd5\u7ee7\u7eed\u6295\u7968\u3002',
  tooManySelections: '\u8be5\u6295\u7968\u6700\u591a\u53ef\u9009',
  submittingVote: '\u6b63\u5728\u63d0\u4ea4\u6295\u7968...',
  clearingVote: '\u6b63\u5728\u6e05\u9664\u6295\u7968...',
  voteUpdated: '\u6295\u7968\u5df2\u66f4\u65b0\u3002',
  voteCleared: '\u5df2\u53d6\u6d88\u4f60\u7684\u6295\u7968\u3002',
  voteFailed: '\u6295\u7968\u63d0\u4ea4\u5931\u8d25\u3002',
  parseFailed: '\u8be5\u6295\u7968\u5185\u5bb9\u65e0\u6cd5\u89e3\u6790\u3002',
  maxSelections: '\u6700\u591a\u53ef\u9009',
  expiredAt: '\u622a\u6b62',
  longTerm: '\u957f\u671f\u6709\u6548',
  noNamedVoters: '\u6682\u65e0\u8bb0\u540d\u6295\u7968',
  votes: '\u7968',
  selected: '\u5df2\u9009',
  participants: '\u53c2\u4e0e\u4eba\u6570',
  totalSelections: '\u7d2f\u8ba1\u9009\u62e9',
  openInTimeline:
    '\u8bf7\u5728\u623f\u95f4\u6d88\u606f\u5217\u8868\u4e2d\u6253\u5f00\u8be5\u6295\u7968\uff0c\u4ee5\u4fbf\u76f4\u63a5\u53c2\u4e0e\u6295\u7968\u3002',
  endedSummary: '\u8be5\u6295\u7968\u5df2\u7ecf\u622a\u6b62\uff0c\u53ea\u80fd\u67e5\u770b\u7ed3\u679c\u3002',
  multipleHint:
    '\u70b9\u51fb\u9009\u9879\u5373\u53ef\u5207\u6362\u4f60\u7684\u6295\u7968\u9009\u62e9\u3002',
  singleHint:
    '\u70b9\u51fb\u4efb\u4e00\u9009\u9879\u5373\u53ef\u6295\u7968\uff0c\u518d\u6b21\u70b9\u51fb\u5df2\u9009\u9879\u53ef\u53d6\u6d88\u6295\u7968\u3002',
} as const;

const getVisibilityLabel = (showVoters: boolean): string =>
  showVoters ? CN.visibleVoters : CN.hiddenVoters;

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

      const rawRelation = event.getContent<IContent>()['m.relates_to'];
      const relationEventId =
        event.getRelation()?.event_id ??
        (rawRelation && typeof rawRelation === 'object'
          ? (rawRelation as Record<string, unknown>).event_id
          : undefined);
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
      if (hasPollEnded(poll, summary?.endedAt)) {
        setStatus(CN.endedCannotVote, true);
        return;
      }

      const selectedSet = new Set(summary?.myAnswers ?? []);

      if (poll.mode === 'multiple') {
        if (selectedSet.has(optionId)) {
          selectedSet.delete(optionId);
        } else if (selectedSet.size >= poll.maxSelections) {
          setStatus(`${CN.tooManySelections} ${poll.maxSelections} \u9879\u3002`, true);
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
      setStatus(nextAnswers.length > 0 ? CN.submittingVote : CN.clearingVote);

      try {
        const previousResponseEventIds = summary?.myResponseEventIds ?? [];

        if (nextAnswers.length > 0) {
          await mx.sendEvent(
            room.roomId,
            POLL_RESPONSE_EVENT_TYPE,
            createPollResponseContent(eventId, nextAnswers) as never
          );

          void Promise.allSettled(
            previousResponseEventIds.map((responseEventId) =>
              mx.redactEvent(room.roomId, responseEventId)
            )
          );
        } else {
          await Promise.all(
            previousResponseEventIds.map((responseEventId) =>
              mx.redactEvent(room.roomId, responseEventId)
            )
          );
        }

        setStatus(nextAnswers.length > 0 ? CN.voteUpdated : CN.voteCleared);
        setRevision((current) => current + 1);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : CN.voteFailed, true);
      } finally {
        setSubmitting(false);
      }
    },
    [eventId, mx, poll, room, setStatus, submitting, summary]
  );

  if (!poll) {
    return (
      <Text size="T300" priority="300">
        {CN.parseFailed}
      </Text>
    );
  }

  const summaryData = summary ?? {
    optionToUserIds: new Map<string, string[]>(),
    myAnswers: [],
    myResponseEventIds: [],
    totalSelections: 0,
    totalVoters: 0,
    endedAt: undefined,
  };
  const ended = hasPollEnded(poll, summaryData.endedAt);
  const totalForPercent =
    poll.mode === 'multiple' ? summaryData.totalSelections : summaryData.totalVoters;
  const getOptionPercent = (votes: number): number =>
    totalForPercent > 0 ? Math.round((votes / totalForPercent) * 100) : 0;

  return (
    <SequenceCard
      variant="SurfaceVariant"
      direction="Column"
      gap="300"
      style={{
        padding: config.space.S300,
        minWidth: 0,
        maxWidth: '520px',
      }}
    >
      <Box justifyContent="SpaceBetween" alignItems="Start" gap="200" style={{ minWidth: 0 }}>
        <Box direction="Column" gap="100" style={{ minWidth: 0 }}>
          <Text size="B400">{poll.title}</Text>
          {poll.description && (
            <Text size="T300" priority="300">
              {poll.description}
            </Text>
          )}
        </Box>
        <Badge size="300" variant={ended ? 'Critical' : 'Success'} fill="Soft" radii="Pill">
          <Text size="T200">{ended ? '\u5df2\u622a\u6b62' : '\u8fdb\u884c\u4e2d'}</Text>
        </Badge>
      </Box>

      <Box gap="100" style={{ flexWrap: 'wrap' }}>
        <Badge size="300" variant="Secondary" fill="Soft" radii="Pill">
          <Text size="T200">{getPollModeLabel(poll.mode)}</Text>
        </Badge>
        {poll.mode === 'multiple' && (
          <Badge size="300" variant="Secondary" fill="Soft" radii="Pill">
            <Text size="T200">{`${CN.maxSelections} ${poll.maxSelections} \u9879`}</Text>
          </Badge>
        )}
        <Badge size="300" variant={ended ? 'Critical' : 'Secondary'} fill="Soft" radii="Pill">
          <Text size="T200">
            {ended
              ? summaryData.endedAt
                ? `${CN.expiredAt} ${new Date(summaryData.endedAt).toLocaleString()}`
                : '\u5df2\u622a\u6b62'
              : poll.expiresAt
                ? `${CN.expiredAt} ${new Date(poll.expiresAt).toLocaleString()}`
                : CN.longTerm}
          </Text>
        </Badge>
        <Badge size="300" variant="Secondary" fill="Soft" radii="Pill">
          <Text size="T200">{getVisibilityLabel(poll.showVoters)}</Text>
        </Badge>
      </Box>

      <Box direction="Column" gap="200">
        {poll.options.map((option) => {
          const voterIds = summaryData.optionToUserIds.get(option.id) ?? [];
          const percent = getOptionPercent(voterIds.length);
          const selected = summaryData.myAnswers.includes(option.id);
          const voterNames =
            poll.showVoters && room
              ? voterIds.map(
                  (userId) =>
                    getMemberDisplayName(room, userId) ?? getMxIdLocalPart(userId) ?? userId
                )
              : [];
          const visibleNames = voterNames.slice(0, 8).join('\u3001');
          const fullNames = voterNames.join('\u3001');
          const namesSuffix =
            voterNames.length > 8
              ? ` \u7b49 ${voterNames.length} \u4eba`
              : voterNames.length > 0
                ? ''
                : CN.noNamedVoters;

          return (
            <Box
              key={option.id}
              as="button"
              type="button"
              direction="Column"
              gap="100"
              onClick={() => handleVote(option.id)}
              aria-pressed={selected}
              disabled={!room || !eventId || ended || submitting}
              style={{
                width: '100%',
                border: selected
                  ? '1px solid rgba(38, 132, 255, 0.58)'
                  : '1px solid rgba(120, 120, 120, 0.22)',
                borderRadius: 8,
                padding: config.space.S300,
                background: selected ? 'rgba(38, 132, 255, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                cursor: !room || !eventId || ended || submitting ? 'default' : 'pointer',
                opacity: submitting && selected ? 0.75 : 1,
                transition: 'border-color 120ms ease, background 120ms ease, opacity 120ms ease',
              }}
            >
              <Box justifyContent="SpaceBetween" alignItems="Center" gap="200">
                <Text size="B300" align="Left">
                  {option.text}
                </Text>
                <Text size="T200" priority="300" align="Right">
                  {`${percent}% \u00b7 ${voterIds.length} ${CN.votes}${
                    selected ? ` \u00b7 ${CN.selected}` : ''
                  }`}
                </Text>
              </Box>
              <ProgressBar
                variant="Secondary"
                size="300"
                min={0}
                max={100}
                value={percent}
                radii="300"
              />
              {poll.showVoters && (
                <Text
                  size="T200"
                  priority="300"
                  align="Left"
                  title={fullNames || undefined}
                  style={{ wordBreak: 'break-word' }}
                >
                  {visibleNames ? `${visibleNames}${namesSuffix}` : namesSuffix}
                </Text>
              )}
            </Box>
          );
        })}
      </Box>

      <Box direction="Column" gap="50">
        <Text size="T200" priority="300">
          {`${CN.participants} ${summaryData.totalVoters}`}
          {poll.mode === 'multiple' ? ` \u00b7 ${CN.totalSelections} ${summaryData.totalSelections}` : ''}
        </Text>
        {!room || !eventId ? (
          <Text size="T200" priority="300">
            {CN.openInTimeline}
          </Text>
        ) : (
          <Text size="T200" priority="300">
            {ended
              ? CN.endedSummary
              : poll.mode === 'multiple'
                ? CN.multipleHint
                : CN.singleHint}
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
