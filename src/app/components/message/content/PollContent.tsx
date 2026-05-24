import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  IContent,
  MatrixEvent,
  MatrixEventEvent,
  Room,
  RoomEvent,
  RoomEventHandlerMap,
} from 'matrix-js-sdk';
import { RelationsEvent } from 'matrix-js-sdk/lib/models/relations';
import {
  Avatar,
  Badge,
  Box,
  Button,
  ProgressBar,
  Text,
  Tooltip,
  TooltipProvider,
  color,
  config,
  toRem,
} from 'folds';
import { SequenceCard } from '../../sequence-card';
import { UserAvatar } from '../../user-avatar';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { nameInitials } from '../../../utils/common';
import { getMxIdLocalPart, mxcUrlToHttp } from '../../../utils/matrix';
import { getMemberAvatarMxc, getMemberDisplayName } from '../../../utils/room';
import {
  combinePollSummaries,
  createPollEndContent,
  createPollSummarySnapshot,
  createPollResponseContent,
  getCachedPollRelationEvents,
  getPollEndRelationCollections,
  getPollModeLabel,
  getPollResponseRelationCollections,
  getPersistedPollSummarySnapshot,
  getPollSummarySnapshot,
  hasPollEnded,
  OUTGOING_POLL_END_EVENT_TYPE,
  OUTGOING_POLL_RESPONSE_EVENT_TYPE,
  parsePollData,
  persistPollSummarySnapshot,
  pollSummaryFromSnapshot,
  primePollRelationEventsCache,
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
  endedAt: '\u7ed3\u675f\u4e8e',
  manualEndOnly: '\u4ec5\u53ef\u7531\u53d1\u8d77\u8005\u624b\u52a8\u7ed3\u675f',
  noNamedVoters: '\u6682\u65e0\u8bb0\u540d\u6295\u7968',
  viewAllVoters: '\u67e5\u770b\u5168\u90e8',
  collapseVoters: '\u6536\u8d77',
  votes: '\u7968',
  selected: '\u5df2\u9009',
  participants: '\u53c2\u4e0e\u4eba\u6570',
  totalSelections: '\u7d2f\u8ba1\u9009\u62e9',
  openInTimeline:
    '\u8bf7\u5728\u623f\u95f4\u6d88\u606f\u5217\u8868\u4e2d\u6253\u5f00\u8be5\u6295\u7968\uff0c\u4ee5\u4fbf\u76f4\u63a5\u53c2\u4e0e\u6295\u7968\u3002',
  endedSummary: '\u8be5\u6295\u7968\u5df2\u7ecf\u622a\u6b62\uff0c\u53ea\u80fd\u67e5\u770b\u7ed3\u679c\u3002',
  multipleHint: '\u591a\u9009\u4f1a\u81ea\u52a8\u5408\u5e76\u63d0\u4ea4\u5f53\u524d\u9009\u62e9\u3002',
  singleHint: '\u70b9\u51fb\u9009\u9879\u540e\u4f1a\u76f4\u63a5\u53d1\u9001\u6295\u7968\u3002',
  pendingChanges: '\u6b63\u5728\u51c6\u5907\u63d0\u4ea4\u6295\u7968...',
  pendingSync: '\u4e0a\u4e00\u6b21\u6295\u7968\u4ecd\u5728\u540c\u6b65\u4e2d\uff0c\u8bf7\u7a0d\u540e\u518d\u63d0\u4ea4\u4fee\u6539\u3002',
  syncingVote: '\u6295\u7968\u540c\u6b65\u4e2d...',
  syncDelayed: '\u6295\u7968\u540c\u6b65\u8d85\u65f6\uff0c\u53ef\u4ee5\u91cd\u65b0\u53d1\u9001\u3002',
  syncFailed: '\u4e0a\u6b21\u6295\u7968\u53d1\u9001\u5931\u8d25\uff0c\u8bf7\u91cd\u65b0\u53d1\u9001\u3002',
  endingPoll: '\u6b63\u5728\u7ed3\u675f\u6295\u7968...',
  pollEnded: '\u6295\u7968\u5df2\u7ed3\u675f\u3002',
  endPoll: '\u7ed3\u675f\u6295\u7968',
  endFailed: '\u7ed3\u675f\u6295\u7968\u5931\u8d25\u3002',
  endedBadge: '\u5df2\u622a\u6b62',
  activeBadge: '\u8fdb\u884c\u4e2d',
} as const;

const MAX_VISIBLE_VOTER_AVATARS = 5;
const MAX_VISIBLE_VOTER_NAMES = 3;
const MAX_INLINE_VOTER_NAMES = 6;
const VOTER_TOOLTIP_MAX_HEIGHT = 240;
const ANSWER_KEY_SEPARATOR = '\u0000';
const MULTIPLE_AUTO_SUBMIT_DELAY_MS = 360;
const PENDING_POLL_RESPONSE_STALE_MS = 45 * 1000;
const ACTIVE_PENDING_STATUSES = new Set(['encrypting', 'queued', 'sending']);
const FAILED_PENDING_STATUSES = new Set(['not_sent', 'cancelled']);

const DEFAULT_SUMMARY = {
  optionToUserIds: new Map<string, string[]>(),
  myAnswers: [] as string[],
  myResponseEventIds: [] as string[],
  myResponseEvents: [] as MatrixEvent[],
  totalSelections: 0,
  totalVoters: 0,
  endedAt: undefined as number | undefined,
};

const getVisibilityLabel = (showVoters: boolean): string =>
  showVoters ? CN.visibleVoters : CN.hiddenVoters;

const answersToKey = (answers: string[]): string => answers.join(ANSWER_KEY_SEPARATOR);
const isRemoteEventId = (eventId: string): boolean => eventId.startsWith('$');

const areAnswersEqual = (left: string[], right: string[]): boolean =>
  left.length === right.length && left.every((answer, index) => answer === right[index]);

const getOrderedAnswers = (
  optionIds: string[],
  selectedAnswers: Set<string>,
  maxSelections: number
): string[] => optionIds.filter((optionId) => selectedAnswers.has(optionId)).slice(0, maxSelections);

type PendingPollEventStatus = 'encrypting' | 'queued' | 'sending' | 'not_sent' | 'cancelled';

type PollVoterDetail = {
  userId: string;
  displayName: string;
  avatarUrl?: string;
};

type PollVoterDirectoryProps = {
  voters: PollVoterDetail[];
  singleColumn?: boolean;
  maxHeight?: string;
};

function PollVoterDirectory({
  voters,
  singleColumn = false,
  maxHeight,
}: PollVoterDirectoryProps) {
  return (
    <Box
      gap="100"
      style={{
        flexWrap: 'wrap',
        maxHeight,
        overflowY: maxHeight ? 'auto' : undefined,
        paddingRight: maxHeight ? config.space.S100 : undefined,
      }}
    >
      {voters.map((voter) => (
        <Box
          key={voter.userId}
          alignItems="Center"
          gap="100"
          style={{
            minWidth: 0,
            width: singleColumn ? '100%' : 'calc(50% - 4px)',
            flex: singleColumn ? '0 0 100%' : '1 1 180px',
            padding: `${config.space.S100} ${config.space.S200}`,
            borderRadius: 8,
            background: 'rgba(255, 255, 255, 0.03)',
          }}
        >
          <Avatar size="200">
            <UserAvatar
              userId={voter.userId}
              src={voter.avatarUrl}
              alt={voter.displayName}
              renderFallback={() => <Text size="T200">{nameInitials(voter.displayName)}</Text>}
            />
          </Avatar>
          <Text size="T200" style={{ minWidth: 0, wordBreak: 'break-word' }}>
            {voter.displayName}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

const getPendingPollEventStatus = (event: MatrixEvent): PendingPollEventStatus | undefined => {
  const status = (event as MatrixEvent & { status?: unknown }).status;
  return typeof status === 'string' ? (status as PendingPollEventStatus) : undefined;
};

export function PollContent({ content, room, eventId }: PollContentProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const poll = useMemo(() => parsePollData(content), [content]);
  const optionIds = useMemo(() => poll?.options.map((option) => option.id) ?? [], [poll]);
  const [revision, setRevision] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [endingPoll, setEndingPoll] = useState(false);
  const [statusText, setStatusText] = useState<string>();
  const [statusError, setStatusError] = useState(false);
  const [draftAnswers, setDraftAnswers] = useState<string[]>([]);
  const [expandedVoterOptionId, setExpandedVoterOptionId] = useState<string>();
  const [cachedRelationEvents, setCachedRelationEvents] = useState<MatrixEvent[]>(() =>
    room && eventId ? getCachedPollRelationEvents(room.roomId, eventId) : []
  );
  const previousCommittedAnswersKeyRef = useRef('');
  const submitInFlightRef = useRef(false);
  const endInFlightRef = useRef(false);
  const relationCollections = useMemo(() => {
    if (!room || !eventId) return [];
    return [
      ...getPollResponseRelationCollections(room, eventId),
      ...getPollEndRelationCollections(room, eventId),
    ];
  }, [room, eventId, revision]);

  useEffect(() => {
    if (!room || !eventId) return undefined;

    const bumpRevision = () => setRevision((current) => current + 1);

    const getRelationEventId = (event: MatrixEvent): string | undefined => {
      const relation = event.getRelation();
      if (typeof relation?.event_id === 'string') return relation.event_id;

      const rawRelation = event.getContent<IContent>()['m.relates_to'];
      if (!rawRelation || typeof rawRelation !== 'object') return undefined;

      return typeof (rawRelation as Record<string, unknown>).event_id === 'string'
        ? ((rawRelation as Record<string, unknown>).event_id as string)
        : undefined;
    };

    const handleRelatedEvent = (event: MatrixEvent) => {
      if (event.getType() === 'm.room.redaction') {
        bumpRevision();
        return;
      }

      const relationEventId = getRelationEventId(event);
      if (relationEventId === eventId || event.getId() === eventId) {
        bumpRevision();
      }
    };

    const handleTimeline: RoomEventHandlerMap[RoomEvent.Timeline] = (event, eventRoom) => {
      if (eventRoom?.roomId !== room.roomId) return;
      handleRelatedEvent(event);
    };

    const handleRedaction: RoomEventHandlerMap[RoomEvent.Redaction] = (_event, eventRoom) => {
      if (eventRoom?.roomId !== room.roomId) return;
      bumpRevision();
    };

    const handleLocalEchoUpdated: RoomEventHandlerMap[RoomEvent.LocalEchoUpdated] = (
      event,
      eventRoom
    ) => {
      if (eventRoom?.roomId !== room.roomId) return;
      handleRelatedEvent(event);
    };

    const handleTimelineRefresh: RoomEventHandlerMap[RoomEvent.TimelineRefresh] = (eventRoom) => {
      if (eventRoom.roomId !== room.roomId) return;
      bumpRevision();
    };

    const handleDecrypted = (event: MatrixEvent) => {
      if (event.getRoomId() !== room.roomId) return;
      handleRelatedEvent(event);
    };

    const relationCleanup = relationCollections.map((relations) => {
      const handleRelationUpdate = () => {
        bumpRevision();
      };

      relations.on(RelationsEvent.Add, handleRelationUpdate);
      relations.on(RelationsEvent.Redaction, handleRelationUpdate);
      relations.on(RelationsEvent.Remove, handleRelationUpdate);

      return () => {
        relations.removeListener(RelationsEvent.Add, handleRelationUpdate);
        relations.removeListener(RelationsEvent.Redaction, handleRelationUpdate);
        relations.removeListener(RelationsEvent.Remove, handleRelationUpdate);
      };
    });

    room.on(RoomEvent.Timeline, handleTimeline);
    room.on(RoomEvent.Redaction, handleRedaction);
    room.on(RoomEvent.LocalEchoUpdated, handleLocalEchoUpdated);
    room.on(RoomEvent.TimelineRefresh, handleTimelineRefresh);
    mx.on(MatrixEventEvent.Decrypted, handleDecrypted);
    return () => {
      room.removeListener(RoomEvent.Timeline, handleTimeline);
      room.removeListener(RoomEvent.Redaction, handleRedaction);
      room.removeListener(RoomEvent.LocalEchoUpdated, handleLocalEchoUpdated);
      room.removeListener(RoomEvent.TimelineRefresh, handleTimelineRefresh);
      mx.off(MatrixEventEvent.Decrypted, handleDecrypted);
      relationCleanup.forEach((dispose) => dispose());
    };
  }, [room, eventId, mx, relationCollections]);

  useEffect(() => {
    if (!room || !eventId) {
      setCachedRelationEvents([]);
      return;
    }

    setCachedRelationEvents(primePollRelationEventsCache(room, eventId));
  }, [room, eventId, revision]);

  const liveSummary = useMemo(() => {
    if (!poll || !room || !eventId) return undefined;
    return summarizePoll(room, eventId, poll, mx.getUserId() ?? undefined, cachedRelationEvents);
  }, [cachedRelationEvents, poll, room, eventId, mx, revision]);

  const snapshotSummary = useMemo(() => {
    if (!poll) return undefined;

    const embeddedSnapshot = getPollSummarySnapshot(content);
    const persistedSnapshot =
      room && eventId ? getPersistedPollSummarySnapshot(room.roomId, eventId) : undefined;

    const embeddedSummary =
      embeddedSnapshot && optionIds.length > 0
        ? pollSummaryFromSnapshot(embeddedSnapshot, optionIds)
        : undefined;
    const persistedSummary =
      persistedSnapshot && optionIds.length > 0
        ? pollSummaryFromSnapshot(persistedSnapshot, optionIds)
        : undefined;

    if (embeddedSummary && persistedSummary) {
      return combinePollSummaries(embeddedSummary, persistedSummary);
    }

    return persistedSummary ?? embeddedSummary;
  }, [content, eventId, optionIds, poll, room]);

  const summary = useMemo(() => {
    if (liveSummary && snapshotSummary) {
      if (getPollSummarySnapshot(content)) {
        return combinePollSummaries(snapshotSummary, liveSummary);
      }
      if (cachedRelationEvents.length > 0) {
        return liveSummary;
      }
      return combinePollSummaries(snapshotSummary, liveSummary);
    }

    return liveSummary ?? snapshotSummary;
  }, [cachedRelationEvents.length, content, liveSummary, snapshotSummary]);

  useEffect(() => {
    if (!room || !eventId || !summary) return;

    const existingSnapshot = getPersistedPollSummarySnapshot(room.roomId, eventId);
    const embeddedSnapshot = getPollSummarySnapshot(content);
    const shouldPersist =
      summary.totalVoters > 0 ||
      summary.totalSelections > 0 ||
      summary.myAnswers.length > 0 ||
      typeof summary.endedAt === 'number' ||
      !!existingSnapshot ||
      !!embeddedSnapshot;

    if (!shouldPersist) return;

    persistPollSummarySnapshot(room.roomId, eventId, createPollSummarySnapshot(summary));
  }, [content, eventId, room, summary]);

  const summaryData = summary ?? DEFAULT_SUMMARY;
  const pollEndedByEvent = typeof summaryData.endedAt === 'number';
  const ended = poll ? hasPollEnded(poll, summaryData.endedAt) : false;
  const pollEvent = useMemo(
    () => (room && eventId ? room.findEventById(eventId) : undefined),
    [room, eventId, revision]
  );
  const pollCreatorId = pollEvent?.getSender();
  const canManagePoll = !!pollCreatorId && pollCreatorId === mx.getUserId();
  const committedAnswers = useMemo(
    () => summaryData.myAnswers.slice(0, poll?.maxSelections ?? summaryData.myAnswers.length),
    [poll, summaryData.myAnswers]
  );
  const committedAnswersKey = answersToKey(committedAnswers);
  const pendingResponseEvents = useMemo(
    () =>
      summaryData.myResponseEvents.filter((responseEvent) => {
        const responseEventId = responseEvent.getId();
        return !!responseEventId && !isRemoteEventId(responseEventId);
      }),
    [summaryData.myResponseEvents]
  );
  const confirmedResponseEventIds = useMemo(
    () => summaryData.myResponseEventIds.filter((responseEventId) => isRemoteEventId(responseEventId)),
    [summaryData.myResponseEventIds]
  );
  const activePendingOwnResponse = useMemo(
    () =>
      pendingResponseEvents.some((responseEvent) => {
        const status = getPendingPollEventStatus(responseEvent);
        return (
          !!status &&
          ACTIVE_PENDING_STATUSES.has(status) &&
          Date.now() - responseEvent.getTs() < PENDING_POLL_RESPONSE_STALE_MS
        );
      }),
    [pendingResponseEvents]
  );
  const stalePendingOwnResponse = useMemo(
    () =>
      pendingResponseEvents.some((responseEvent) => {
        const status = getPendingPollEventStatus(responseEvent);
        return (
          !!status &&
          ACTIVE_PENDING_STATUSES.has(status) &&
          Date.now() - responseEvent.getTs() >= PENDING_POLL_RESPONSE_STALE_MS
        );
      }),
    [pendingResponseEvents]
  );
  const failedPendingOwnResponse = useMemo(
    () =>
      pendingResponseEvents.some((responseEvent) => {
        const status = getPendingPollEventStatus(responseEvent);
        return !!status && FAILED_PENDING_STATUSES.has(status);
      }),
    [pendingResponseEvents]
  );

  useEffect(() => {
    if (!poll) return;

    setDraftAnswers(committedAnswers);
    previousCommittedAnswersKeyRef.current = committedAnswersKey;
    setStatusText(undefined);
    setStatusError(false);
  }, [poll, room?.roomId, eventId]);

  useEffect(() => {
    setExpandedVoterOptionId(undefined);
  }, [eventId, room?.roomId]);

  useEffect(() => {
    const previousCommittedAnswersKey = previousCommittedAnswersKeyRef.current;
    const draftAnswersKey = answersToKey(draftAnswers);

    if (
      draftAnswersKey === previousCommittedAnswersKey &&
      draftAnswersKey !== committedAnswersKey
    ) {
      setDraftAnswers(committedAnswers);
    }

    previousCommittedAnswersKeyRef.current = committedAnswersKey;
  }, [committedAnswers, committedAnswersKey, draftAnswers]);

  useEffect(() => {
    const staleTransitionDelay = pendingResponseEvents.reduce<number | undefined>(
      (currentMinDelay, responseEvent) => {
        const status = getPendingPollEventStatus(responseEvent);
        if (!status || !ACTIVE_PENDING_STATUSES.has(status)) {
          return currentMinDelay;
        }

        const remainingDelay =
          responseEvent.getTs() + PENDING_POLL_RESPONSE_STALE_MS - Date.now();
        if (remainingDelay <= 0) {
          return 0;
        }

        if (typeof currentMinDelay !== 'number') {
          return remainingDelay;
        }

        return Math.min(currentMinDelay, remainingDelay);
      },
      undefined
    );

    if (typeof staleTransitionDelay !== 'number') {
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      setRevision((current) => current + 1);
    }, staleTransitionDelay + 50);

    return () => window.clearTimeout(timerId);
  }, [pendingResponseEvents]);

  const draftDirty = !areAnswersEqual(draftAnswers, committedAnswers);

  const setStatus = useCallback((message: string, error = false) => {
    setStatusText(message);
    setStatusError(error);
  }, []);

  const clearStatus = useCallback(() => {
    setStatusText(undefined);
    setStatusError(false);
  }, []);

  const handleEndPoll = useCallback(async () => {
    if (
      !room ||
      !eventId ||
      !poll ||
      pollEndedByEvent ||
      endingPoll ||
      endInFlightRef.current
    ) {
      return;
    }
    if (!canManagePoll) {
      return;
    }

    endInFlightRef.current = true;
    setEndingPoll(true);
    setStatus(CN.endingPoll);

    try {
      await mx.sendEvent(
        room.roomId,
        OUTGOING_POLL_END_EVENT_TYPE,
        createPollEndContent(eventId) as never
      );
      setStatus(CN.pollEnded);
      setRevision((current) => current + 1);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : CN.endFailed, true);
    } finally {
      endInFlightRef.current = false;
      setEndingPoll(false);
    }
  }, [canManagePoll, endingPoll, eventId, mx, poll, pollEndedByEvent, room, setStatus]);

  const handleSelectOption = useCallback(
    (optionId: string) => {
      if (
        !poll ||
        !room ||
        !eventId ||
        submitting ||
        endingPoll ||
        submitInFlightRef.current ||
        hasPollEnded(poll, summaryData.endedAt)
      ) {
        return;
      }

      const selectedAnswers = new Set(draftAnswers);

      if (poll.mode === 'multiple') {
        if (selectedAnswers.has(optionId)) {
          selectedAnswers.delete(optionId);
        } else if (selectedAnswers.size >= poll.maxSelections) {
          setStatus(`${CN.tooManySelections} ${poll.maxSelections} \u9879\u3002`, true);
          return;
        } else {
          selectedAnswers.add(optionId);
        }
      } else if (selectedAnswers.size === 1 && selectedAnswers.has(optionId)) {
        selectedAnswers.clear();
      } else {
        selectedAnswers.clear();
        selectedAnswers.add(optionId);
      }

      clearStatus();
      setDraftAnswers(getOrderedAnswers(optionIds, selectedAnswers, poll.maxSelections));
    },
    [
      clearStatus,
      draftAnswers,
      endingPoll,
      eventId,
      optionIds,
      poll,
      room,
      setStatus,
      submitting,
      summaryData.endedAt,
    ]
  );

  const handleSubmitVote = useCallback(async () => {
    if (
      !poll ||
      !room ||
      !eventId ||
      submitting ||
      endingPoll ||
      submitInFlightRef.current ||
      !draftDirty
    ) {
      return;
    }
    if (hasPollEnded(poll, summaryData.endedAt)) {
      setStatus(CN.endedCannotVote, true);
      return;
    }
    if (activePendingOwnResponse) {
      setStatus(CN.pendingSync, true);
      return;
    }

    const nextAnswers = getOrderedAnswers(optionIds, new Set(draftAnswers), poll.maxSelections);

    submitInFlightRef.current = true;
    setSubmitting(true);
    setStatus(nextAnswers.length > 0 ? CN.submittingVote : CN.clearingVote);

    try {
      if (nextAnswers.length > 0) {
        await mx.sendEvent(
          room.roomId,
          OUTGOING_POLL_RESPONSE_EVENT_TYPE,
          createPollResponseContent(eventId, nextAnswers) as never
        );
      } else if (confirmedResponseEventIds.length > 0) {
        await Promise.all(
          confirmedResponseEventIds.map((responseEventId) =>
            mx.redactEvent(room.roomId, responseEventId)
          )
        );
      }

      setDraftAnswers(nextAnswers);
      setStatus(nextAnswers.length > 0 ? CN.voteUpdated : CN.voteCleared);
      setRevision((current) => current + 1);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : CN.voteFailed, true);
    } finally {
      submitInFlightRef.current = false;
      setSubmitting(false);
    }
  }, [
    draftAnswers,
    draftDirty,
    eventId,
    mx,
    optionIds,
    poll,
    room,
    setStatus,
    submitting,
    endingPoll,
    activePendingOwnResponse,
    confirmedResponseEventIds,
    summaryData.endedAt,
  ]);

  useEffect(() => {
    if (
      !poll ||
      !room ||
      !eventId ||
      ended ||
      submitting ||
      endingPoll ||
      submitInFlightRef.current
    ) {
      return undefined;
    }
    if (!draftDirty || activePendingOwnResponse) {
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      handleSubmitVote().catch(() => undefined);
    }, poll.mode === 'multiple' ? MULTIPLE_AUTO_SUBMIT_DELAY_MS : 0);

    return () => window.clearTimeout(timerId);
  }, [
    activePendingOwnResponse,
    draftDirty,
    ended,
    endingPoll,
    eventId,
    handleSubmitVote,
    poll,
    room,
    submitting,
  ]);

  if (!poll) {
    return (
      <Text size="T300" priority="300">
        {CN.parseFailed}
      </Text>
    );
  }

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
          <Text size="T200">{ended ? CN.endedBadge : CN.activeBadge}</Text>
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
                ? `${CN.endedAt} ${new Date(summaryData.endedAt).toLocaleString()}`
                : CN.endedBadge
              : CN.manualEndOnly}
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
          const selected = draftAnswers.includes(option.id);
          const voterDetails: PollVoterDetail[] =
            poll.showVoters && room
              ? voterIds.map((userId) => {
                  const displayName =
                    getMemberDisplayName(room, userId) ?? getMxIdLocalPart(userId) ?? userId;
                  const avatarMxc = getMemberAvatarMxc(room, userId);
                  const avatarUrl =
                    avatarMxc
                      ? mxcUrlToHttp(mx, avatarMxc, useAuthentication, 24, 24, 'crop') ?? undefined
                      : undefined;

                  return {
                    userId,
                    displayName,
                    avatarUrl,
                  };
                })
              : [];
          const fullNames = voterDetails.map((voter) => voter.displayName).join('\u3001');
          const visibleAvatars = voterDetails.slice(0, MAX_VISIBLE_VOTER_AVATARS);
          const visibleNames = voterDetails
            .slice(0, MAX_VISIBLE_VOTER_NAMES)
            .map((voter) => voter.displayName)
            .join('\u3001');
          const hiddenCount = Math.max(voterDetails.length - visibleAvatars.length, 0);
          const shouldCollapseVoters = voterDetails.length > MAX_INLINE_VOTER_NAMES;
          const voterNamesLabel = shouldCollapseVoters
            ? `${visibleNames} \u7b49 ${voterDetails.length} \u4eba`
            : fullNames;
          const isVoterDirectoryExpanded = expandedVoterOptionId === option.id;

          return (
            <Box
              key={option.id}
              as="button"
              type="button"
              direction="Column"
              gap="100"
              onClick={() => handleSelectOption(option.id)}
              aria-pressed={selected}
              disabled={!room || !eventId || ended || submitting || endingPoll}
              style={{
                width: '100%',
                border: selected
                  ? '1px solid rgba(38, 132, 255, 0.58)'
                  : '1px solid rgba(120, 120, 120, 0.22)',
                borderRadius: 8,
                padding: config.space.S300,
                background: selected ? 'rgba(38, 132, 255, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                cursor:
                  !room || !eventId || ended || submitting || endingPoll ? 'default' : 'pointer',
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
                <>
                  {voterDetails.length > 0 ? (
                    <>
                      {shouldCollapseVoters ? (
                        <TooltipProvider
                          position="Top"
                          align="Start"
                          tooltip={
                            <Tooltip style={{ maxWidth: toRem(280) }}>
                              <Box
                                direction="Column"
                                gap="100"
                                style={{ minWidth: toRem(220), maxWidth: toRem(280) }}
                              >
                                <Text size="L400">{`${voterDetails.length} \u4eba`}</Text>
                                <PollVoterDirectory
                                  voters={voterDetails}
                                  singleColumn
                                  maxHeight={toRem(VOTER_TOOLTIP_MAX_HEIGHT)}
                                />
                              </Box>
                            </Tooltip>
                          }
                        >
                          {(triggerRef) => (
                            <Box ref={triggerRef} direction="Column" gap="100" style={{ minWidth: 0 }}>
                              <Box gap="50" alignItems="Center" style={{ flexWrap: 'wrap' }}>
                                {visibleAvatars.map((voter, index) => (
                                  <Box
                                    key={voter.userId}
                                    shrink="No"
                                    title={voter.displayName}
                                    style={{ marginLeft: index === 0 ? 0 : -6 }}
                                  >
                                    <Avatar size="200">
                                      <UserAvatar
                                        userId={voter.userId}
                                        src={voter.avatarUrl}
                                        alt={voter.displayName}
                                        renderFallback={() => (
                                          <Text size="T200">{nameInitials(voter.displayName)}</Text>
                                        )}
                                      />
                                    </Avatar>
                                  </Box>
                                ))}
                                {hiddenCount > 0 && (
                                  <Badge size="300" variant="Secondary" fill="Soft" radii="Pill">
                                    <Text size="T200">{`+${hiddenCount}`}</Text>
                                  </Badge>
                                )}
                              </Box>
                              <Box direction="Column" gap="50" style={{ minWidth: 0 }}>
                                <Text
                                  size="T200"
                                  priority="300"
                                  align="Left"
                                  style={{ wordBreak: 'break-word' }}
                                >
                                  {voterNamesLabel}
                                </Text>
                                <Text
                                  as="span"
                                  size="T200"
                                  onClick={(evt) => {
                                    evt.preventDefault();
                                    evt.stopPropagation();
                                    setExpandedVoterOptionId((current) =>
                                      current === option.id ? undefined : option.id
                                    );
                                  }}
                                  style={{
                                    color: color.Primary.Main,
                                    cursor: 'pointer',
                                    width: 'fit-content',
                                  }}
                                >
                                  {isVoterDirectoryExpanded ? CN.collapseVoters : CN.viewAllVoters}
                                </Text>
                              </Box>
                              {isVoterDirectoryExpanded && (
                                <Box
                                  direction="Column"
                                  gap="100"
                                  onClick={(evt) => evt.stopPropagation()}
                                  style={{
                                    marginTop: config.space.S100,
                                    paddingTop: config.space.S100,
                                    borderTop: '1px solid rgba(120, 120, 120, 0.18)',
                                  }}
                                >
                                  <PollVoterDirectory voters={voterDetails} />
                                </Box>
                              )}
                            </Box>
                          )}
                        </TooltipProvider>
                      ) : (
                        <Box direction="Column" gap="100">
                          <Box gap="50" alignItems="Center" style={{ flexWrap: 'wrap' }}>
                            {visibleAvatars.map((voter, index) => (
                              <Box
                                key={voter.userId}
                                shrink="No"
                                title={voter.displayName}
                                style={{ marginLeft: index === 0 ? 0 : -6 }}
                              >
                                <Avatar size="200">
                                  <UserAvatar
                                    userId={voter.userId}
                                    src={voter.avatarUrl}
                                    alt={voter.displayName}
                                    renderFallback={() => (
                                      <Text size="T200">{nameInitials(voter.displayName)}</Text>
                                    )}
                                  />
                                </Avatar>
                              </Box>
                            ))}
                            {hiddenCount > 0 && (
                              <Badge size="300" variant="Secondary" fill="Soft" radii="Pill">
                                <Text size="T200">{`+${hiddenCount}`}</Text>
                              </Badge>
                            )}
                          </Box>
                          <Text
                            size="T200"
                            priority="300"
                            align="Left"
                            title={fullNames || undefined}
                            style={{ wordBreak: 'break-word' }}
                          >
                            {fullNames}
                          </Text>
                        </Box>
                      )}
                    </>
                  ) : (
                    <Text size="T200" priority="300" align="Left">
                      {CN.noNamedVoters}
                    </Text>
                  )}
                </>
              )}
            </Box>
          );
        })}
      </Box>

      <Box direction="Column" gap="100">
        <Text size="T200" priority="300">
          {`${CN.participants} ${summaryData.totalVoters}`}
          {poll.mode === 'multiple'
            ? ` \u00b7 ${CN.totalSelections} ${summaryData.totalSelections}`
            : ''}
        </Text>
        {!room || !eventId ? (
          <Text size="T200" priority="300">
            {CN.openInTimeline}
          </Text>
        ) : (
          <>
            <Text size="T200" priority="300">
              {ended
                ? CN.endedSummary
                : endingPoll
                  ? CN.endingPoll
                : failedPendingOwnResponse
                  ? CN.syncFailed
                : stalePendingOwnResponse
                  ? CN.syncDelayed
                : activePendingOwnResponse
                  ? CN.syncingVote
                : draftDirty
                  ? CN.pendingChanges
                : poll.mode === 'multiple'
                    ? CN.multipleHint
                    : CN.singleHint}
            </Text>
            {canManagePoll && !pollEndedByEvent && (
              <Box>
                <Button
                  type="button"
                  variant="Secondary"
                  fill="Soft"
                  size="300"
                  radii="300"
                  outlined
                  onClick={() => {
                    handleEndPoll().catch(() => undefined);
                  }}
                  disabled={submitting || endingPoll}
                  aria-disabled={submitting || endingPoll}
                >
                  <Text size="B300">{CN.endPoll}</Text>
                </Button>
              </Box>
            )}
          </>
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
