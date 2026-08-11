export const OFFICE_UPDATE_PROPERTY = 'com.xinghuo.office_update';

const ROOM_MESSAGE_FILE_TYPE = 'm.file';
const ROOM_MESSAGE_EVENT_TYPE = 'm.room.message';
const REPLACEMENT_RELATION_TYPE = 'm.replace';
const REFERENCE_RELATION_TYPE = 'm.reference';

// Temporary migration window for revisions produced by older Starfire builds. Remove this
// compatibility path after rooms have had enough time to receive the standalone successor format.
export const LEGACY_OFFICE_REPLACEMENT_CUTOFF_TS = Date.parse('2026-09-10T00:00:00Z');

export type OfficeFileMessageContent = Record<string, unknown> & {
  msgtype: string;
  body: string;
};

export type OfficeFileUpdateMetadata = {
  source_event_id: string;
  updated_at: number;
};

export type OfficeFileUpdateMode = 'replace' | 'successor';

export type OfficeFileUpdateMessage = {
  content: OfficeFileMessageContent;
  eventType: typeof ROOM_MESSAGE_EVENT_TYPE;
  mode: OfficeFileUpdateMode;
};

export type OfficeFileTimelineEvent = {
  eventId?: string;
  senderId?: string;
  eventType: string;
  timestamp: number;
  redacted?: boolean;
  content: Record<string, unknown>;
};

export type ResolvedOfficeFileRevision = {
  sourceEventId: string;
  revisionEventId: string;
  revisionTimestamp: number;
  updatedBy?: string;
  content: OfficeFileMessageContent;
};

type ResolveOfficeFileRevisionOptions = {
  currentEventId: string;
  currentContent: Record<string, unknown>;
  currentEventTimestamp: number;
  timelineEvents: OfficeFileTimelineEvent[];
};

// An Office revision can be acknowledged by the send request before the room
// timeline receives its local echo. Keep only the lightweight
// event metadata briefly so reopening the same card does not fall back to the
// old media URI during that sync window. The Matrix event remains authoritative
// after it arrives, and no document bytes are retained here.
const optimisticRevisions = new Map<string, OfficeFileTimelineEvent>();
const MAX_OPTIMISTIC_REVISIONS = 128;
const optimisticRevisionListeners = new Set<() => void>();

export const subscribeOfficeFileRevisions = (listener: () => void): (() => void) => {
  optimisticRevisionListeners.add(listener);
  return () => optimisticRevisionListeners.delete(listener);
};

export const rememberOfficeFileRevision = ({
  sourceEventId,
  revisionEventId,
  senderId,
  eventType,
  content,
  timestamp = Date.now(),
}: {
  sourceEventId: string;
  revisionEventId?: string;
  senderId: string;
  eventType: string;
  content: Record<string, unknown>;
  timestamp?: number;
}): void => {
  const eventId =
    revisionEventId && /^\$\S+$/.test(revisionEventId)
      ? revisionEventId
      : `$local-office-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  optimisticRevisions.set(sourceEventId, {
    eventId,
    senderId,
    eventType,
    timestamp,
    content: { ...content },
  });
  while (optimisticRevisions.size > MAX_OPTIMISTIC_REVISIONS) {
    const oldest = optimisticRevisions.keys().next().value;
    if (typeof oldest !== 'string') break;
    optimisticRevisions.delete(oldest);
  }
  optimisticRevisionListeners.forEach((listener) => listener());
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isMxcUrl = (value: unknown): value is string =>
  typeof value === 'string' && /^mxc:\/\/[^/\s]+\/[^/?#\s]+$/.test(value);

function isServerEventId(value: unknown): value is string {
  return typeof value === 'string' && /^\$\S+$/.test(value);
}

const isMatrixUserId = (value: unknown): value is string =>
  typeof value === 'string' && /^@[^:\s]+:[^\s]+$/.test(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const getUpdateMetadata = (
  content: Record<string, unknown>,
  sourceEventId: string
): OfficeFileUpdateMetadata | undefined => {
  const metadata = content[OFFICE_UPDATE_PROPERTY];
  if (
    !isRecord(metadata) ||
    metadata.source_event_id !== sourceEventId ||
    typeof metadata.updated_at !== 'number' ||
    !Number.isFinite(metadata.updated_at) ||
    metadata.updated_at <= 0
  ) {
    return undefined;
  }
  return metadata as OfficeFileUpdateMetadata;
};

const isEncryptedMedia = (value: unknown): boolean => {
  if (!isRecord(value) || !isMxcUrl(value.url)) return false;
  const { hashes, key } = value;
  return (
    value.v === 'v2' &&
    isNonEmptyString(value.iv) &&
    isRecord(hashes) &&
    isNonEmptyString(hashes.sha256) &&
    isRecord(key) &&
    key.alg === 'A256CTR' &&
    key.kty === 'oct' &&
    isNonEmptyString(key.k) &&
    Array.isArray(key.key_ops) &&
    key.key_ops.includes('encrypt') &&
    key.key_ops.includes('decrypt') &&
    (key.ext === undefined || key.ext === true)
  );
};

const hasValidMedia = (content: Record<string, unknown>): boolean => {
  if (content.file !== undefined) {
    return content.url === undefined && isEncryptedMedia(content.file);
  }
  return isMxcUrl(content.url);
};

const asFileContent = (content: Record<string, unknown>): OfficeFileMessageContent | undefined =>
  content.msgtype === ROOM_MESSAGE_FILE_TYPE &&
  isNonEmptyString(content.body) &&
  hasValidMedia(content)
    ? (content as OfficeFileMessageContent)
    : undefined;

const getFilename = (content: Record<string, unknown>): string | undefined => {
  if (isNonEmptyString(content.filename)) return content.filename;
  return isNonEmptyString(content.body) ? content.body : undefined;
};

const getMimeType = (content: Record<string, unknown>): string | undefined => {
  const { info } = content;
  if (!isRecord(info) || !isNonEmptyString(info.mimetype)) return undefined;
  return info.mimetype.split(';', 1)[0].trim().toLowerCase();
};

const matchesSourceFile = (
  sourceContent: Record<string, unknown>,
  candidateContent: Record<string, unknown>
): boolean =>
  getFilename(sourceContent) === getFilename(candidateContent) &&
  getMimeType(sourceContent) === getMimeType(candidateContent);

const getMediaUrl = (content: Record<string, unknown>): string | undefined => {
  if (isRecord(content.file) && isMxcUrl(content.file.url)) return content.file.url;
  return isMxcUrl(content.url) ? content.url : undefined;
};

const isUsableTimelineEvent = (event: OfficeFileTimelineEvent): boolean =>
  isServerEventId(event.eventId) &&
  isMatrixUserId(event.senderId) &&
  event.eventType === ROOM_MESSAGE_EVENT_TYPE &&
  event.redacted !== true &&
  Number.isFinite(event.timestamp) &&
  event.timestamp > 0;

type RevisionCandidate = {
  content: OfficeFileMessageContent;
  eventId: string;
  timestamp: number;
  senderId?: string;
};

const parseSuccessor = (
  event: OfficeFileTimelineEvent,
  sourceEventId: string,
  sourceContent: OfficeFileMessageContent
): RevisionCandidate | undefined => {
  if (!isUsableTimelineEvent(event) || event.eventId === sourceEventId) return undefined;
  const content = asFileContent(event.content);
  const relation = event.content['m.relates_to'];
  if (
    !content ||
    !isRecord(relation) ||
    relation.rel_type !== REFERENCE_RELATION_TYPE ||
    relation.event_id !== sourceEventId ||
    !getUpdateMetadata(event.content, sourceEventId) ||
    !matchesSourceFile(sourceContent, event.content)
  ) {
    return undefined;
  }
  return { content, eventId: event.eventId!, timestamp: event.timestamp, senderId: event.senderId };
};

const parseReplacement = (
  event: OfficeFileTimelineEvent,
  sourceEvent: OfficeFileTimelineEvent,
  sourceContent: OfficeFileMessageContent
): RevisionCandidate | undefined => {
  if (!isUsableTimelineEvent(event) || event.eventId === sourceEvent.eventId) return undefined;
  const relation = event.content['m.relates_to'];
  const newContentValue = event.content['m.new_content'];
  if (
    !isRecord(relation) ||
    relation.rel_type !== REPLACEMENT_RELATION_TYPE ||
    relation.event_id !== sourceEvent.eventId ||
    !isRecord(newContentValue)
  ) {
    return undefined;
  }
  const newContent = asFileContent(newContentValue);
  if (
    !newContent ||
    !getUpdateMetadata(newContentValue, sourceEvent.eventId!) ||
    !matchesSourceFile(sourceContent, newContentValue)
  ) {
    return undefined;
  }
  const validSender =
    event.senderId === sourceEvent.senderId ||
    // The compatibility reader is declared below beside its migration documentation.
    // eslint-disable-next-line no-use-before-define
    isLegacyCrossSenderOfficeFileReplacement(
      sourceEvent.eventId,
      sourceEvent.content,
      event.content,
      event.timestamp
    );
  if (!validSender) return undefined;
  return {
    content: newContent,
    eventId: event.eventId!,
    timestamp: event.timestamp,
    senderId: event.senderId,
  };
};

/**
 * Resolve an Office card to the newest known valid revision. Collaborator revisions are visible
 * referenced file messages while same-sender revisions use standard replacements. Candidate
 * ordering always uses the homeserver event timestamp.
 */
export const resolveLatestOfficeFileRevision = ({
  currentEventId,
  currentContent,
  timelineEvents,
}: ResolveOfficeFileRevisionOptions): ResolvedOfficeFileRevision | undefined => {
  if (!isServerEventId(currentEventId)) return undefined;
  const currentEvent = timelineEvents.find((event) => event.eventId === currentEventId);
  if (!currentEvent || !isUsableTimelineEvent(currentEvent)) return undefined;

  let sourceEvent = currentEvent;
  const currentRelation = currentEvent.content['m.relates_to'];
  const referencedSourceId =
    isRecord(currentRelation) &&
    currentRelation.rel_type === REFERENCE_RELATION_TYPE &&
    isServerEventId(currentRelation.event_id)
      ? currentRelation.event_id
      : undefined;
  if (referencedSourceId) {
    const referencedSource = timelineEvents.find((event) => event.eventId === referencedSourceId);
    const referencedContent = referencedSource && asFileContent(referencedSource.content);
    if (
      referencedSource &&
      referencedContent &&
      isUsableTimelineEvent(referencedSource) &&
      parseSuccessor(currentEvent, referencedSourceId, referencedContent)
    ) {
      sourceEvent = referencedSource;
    }
  }

  const sourceEventId = sourceEvent.eventId!;
  const sourceContent = asFileContent(sourceEvent.content);
  if (!sourceContent) return undefined;

  const candidates: RevisionCandidate[] = [
    {
      content: sourceContent,
      eventId: sourceEventId,
      timestamp: sourceEvent.timestamp,
      senderId: sourceEvent.senderId,
    },
  ];
  timelineEvents.forEach((event) => {
    const successor = parseSuccessor(event, sourceEventId, sourceContent);
    if (successor) candidates.push(successor);
    const replacement = parseReplacement(event, sourceEvent, sourceContent);
    if (replacement) candidates.push(replacement);
  });
  const optimisticRevision = optimisticRevisions.get(sourceEventId);
  if (
    optimisticRevision &&
    timelineEvents.some((event) => event.eventId === optimisticRevision.eventId)
  ) {
    optimisticRevisions.delete(sourceEventId);
  } else if (optimisticRevision) {
    const successor = parseSuccessor(optimisticRevision, sourceEventId, sourceContent);
    if (successor) candidates.push(successor);
    const replacement = parseReplacement(optimisticRevision, sourceEvent, sourceContent);
    if (replacement) candidates.push(replacement);
  }
  candidates.sort((a, b) => b.timestamp - a.timestamp || b.eventId.localeCompare(a.eventId));

  const currentMediaUrl = getMediaUrl(currentContent);
  const currentMetadata = getUpdateMetadata(currentContent, sourceEventId);
  const matchingCurrentTimestamp = candidates
    .filter(
      (candidate) =>
        getMediaUrl(candidate.content) === currentMediaUrl &&
        (!currentMetadata ||
          getUpdateMetadata(candidate.content, sourceEventId)?.updated_at ===
            currentMetadata.updated_at)
    )
    .reduce<number | undefined>(
      (latest, candidate) =>
        latest === undefined || candidate.timestamp > latest ? candidate.timestamp : latest,
      undefined
    );
  const latest = candidates[0];
  const currentFileContent = asFileContent(currentContent);
  const selected =
    currentFileContent &&
    matchingCurrentTimestamp !== undefined &&
    latest.timestamp <= matchingCurrentTimestamp
      ? {
          content: currentFileContent,
          eventId: currentEventId,
          timestamp: matchingCurrentTimestamp,
          senderId: currentEvent.senderId,
        }
      : latest;

  return {
    sourceEventId,
    revisionEventId: selected.eventId,
    revisionTimestamp: selected.timestamp,
    updatedBy: selected.eventId === sourceEventId ? undefined : selected.senderId,
    content: selected.content,
  };
};

/**
 * Recognize revisions written by Starfire versions which represented a collaborator's save as
 * an invalid cross-sender replacement. New code must never produce this shape; reading it keeps
 * an already-saved revision accessible while rooms migrate to standalone successor messages.
 */
export function isLegacyCrossSenderOfficeFileReplacement(
  sourceEventId: string | undefined,
  sourceContent: Record<string, unknown>,
  replacementContent: Record<string, unknown>,
  replacementTimestamp: number
): boolean {
  if (!sourceEventId || sourceContent.msgtype !== ROOM_MESSAGE_FILE_TYPE) return false;
  if (
    !Number.isFinite(replacementTimestamp) ||
    replacementTimestamp > LEGACY_OFFICE_REPLACEMENT_CUTOFF_TS
  ) {
    return false;
  }
  if (replacementContent[OFFICE_UPDATE_PROPERTY] !== true) return false;

  const relation = replacementContent['m.relates_to'];
  if (
    !isRecord(relation) ||
    relation.rel_type !== REPLACEMENT_RELATION_TYPE ||
    relation.event_id !== sourceEventId
  ) {
    return false;
  }

  const newContent = replacementContent['m.new_content'];
  if (!isRecord(newContent) || newContent.msgtype !== ROOM_MESSAGE_FILE_TYPE) return false;

  const metadata = newContent[OFFICE_UPDATE_PROPERTY];
  if (!isRecord(metadata) || metadata.source_event_id !== sourceEventId) return false;

  const encryptedFile = newContent.file;
  return isMxcUrl(newContent.url) || (isRecord(encryptedFile) && isMxcUrl(encryptedFile.url));
}

type BuildOfficeFileUpdateMessageOptions = {
  sourceEventId: string;
  sourceSenderId?: string;
  currentUserId: string;
  latestContent: OfficeFileMessageContent;
  updatedAt?: number;
};

/**
 * Build the Matrix event used to publish an updated Office attachment.
 *
 * Matrix replacement relations are only valid when the replacement and its target have the
 * same sender. When another room member saves the document, publish a normal `m.file` message
 * instead so every Matrix client can display and download the new revision.
 */
export const buildOfficeFileUpdateMessage = ({
  sourceEventId,
  sourceSenderId,
  currentUserId,
  latestContent,
  updatedAt = Date.now(),
}: BuildOfficeFileUpdateMessageOptions): OfficeFileUpdateMessage => {
  if (latestContent.msgtype !== ROOM_MESSAGE_FILE_TYPE) {
    throw new TypeError('Office updates must use an m.file message');
  }

  const metadata: OfficeFileUpdateMetadata = {
    source_event_id: sourceEventId,
    updated_at: updatedAt,
  };
  const newContent: OfficeFileMessageContent = {
    ...latestContent,
    [OFFICE_UPDATE_PROPERTY]: metadata,
  };

  if (sourceSenderId && sourceSenderId === currentUserId) {
    return {
      mode: 'replace',
      eventType: ROOM_MESSAGE_EVENT_TYPE,
      content: {
        ...newContent,
        body: `* ${newContent.body}`,
        'm.new_content': newContent,
        'm.relates_to': {
          event_id: sourceEventId,
          rel_type: REPLACEMENT_RELATION_TYPE,
        },
      },
    };
  }

  return {
    mode: 'successor',
    eventType: ROOM_MESSAGE_EVENT_TYPE,
    content: {
      ...newContent,
      'm.relates_to': {
        rel_type: REFERENCE_RELATION_TYPE,
        event_id: sourceEventId,
      },
    },
  };
};
