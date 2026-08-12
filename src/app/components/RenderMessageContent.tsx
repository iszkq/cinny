import React from 'react';
import { Direction, MatrixEvent, MsgType, RelationType, Room } from 'matrix-js-sdk';
import { HTMLReactParserOptions } from 'html-react-parser';
import { Opts } from 'linkifyjs';
import { config } from 'folds';
import {
  AudioContent,
  DownloadFile,
  ReadDocxFile,
  FileContent,
  ImageContent,
  MAudio,
  MBadEncrypted,
  MEmote,
  MFile,
  MImage,
  MLocation,
  MNotice,
  MText,
  MVideo,
  ReadPdfFile,
  ReadTextFile,
  RenderBody,
  ThumbnailContent,
  UnsupportedContent,
  VideoContent,
  PollContent,
  ReadSpreadsheetFile,
} from './message';
import { UrlPreviewCard, UrlPreviewHolder } from './url-preview';
import { Image, MediaControl, Video } from './media';
import { ImageViewer } from './image-viewer';
import { PdfViewer } from './Pdf-viewer';
import { DocxViewer, OfficeFileEditor, SpreadsheetViewer } from './file-viewer';
import { TextViewer } from './text-viewer';
import { JitsiMeetCard } from './jitsi-meet';
import { testMatrixTo } from '../plugins/matrix-to';
import { useMatrixClient } from '../hooks/useMatrixClient';
import { useMediaAuthentication } from '../hooks/useMediaAuthentication';
import { IFileContent, IImageContent } from '../../types/matrix/common';
import {
  isPollMessage,
  POLL_MSGTYPE,
  POLL_START_EVENT_TYPE,
  UNSTABLE_POLL_START_EVENT_TYPE,
} from '../utils/polls';
import { getJitsiMeetInfo } from '../utils/jitsiMeet';
import { getMxIdLocalPart, mxcUrlToHttp } from '../utils/matrix';
import { getMemberAvatarMxc, getMemberDisplayName } from '../utils/room';
import { getOfficeDocumentKind } from '../utils/mimeTypes';
import {
  OFFICE_UPDATE_PROPERTY,
  OfficeFileTimelineEvent,
  resolveLatestOfficeFileRevision,
  subscribeOfficeFileRevisions,
} from '../utils/officeFile';
import type { ViewerImageItem } from './message/content/ImageContent';

const toOfficeTimelineEvent = (event: MatrixEvent): OfficeFileTimelineEvent => ({
  eventId: event.getId(),
  senderId: event.getSender(),
  eventType: event.getType(),
  timestamp: event.getTs(),
  redacted: event.isRedacted(),
  content: event.getContent<Record<string, unknown>>(),
});

const getOfficeSourceEventId = (eventId: string, content: Record<string, unknown>): string => {
  const metadata = content[OFFICE_UPDATE_PROPERTY];
  const relation = content['m.relates_to'];
  if (
    typeof metadata === 'object' &&
    metadata !== null &&
    typeof relation === 'object' &&
    relation !== null
  ) {
    const sourceEventId = (metadata as Record<string, unknown>).source_event_id;
    const relatedEventId = (relation as Record<string, unknown>).event_id;
    if (typeof sourceEventId === 'string' && sourceEventId === relatedEventId) {
      return sourceEventId;
    }
  }
  return eventId;
};

type RenderMessageContentProps = {
  displayName: string;
  msgType: string;
  eventType?: string;
  ts: number;
  edited?: boolean;
  getContent: <T>() => T;
  mediaAutoLoad?: boolean;
  urlPreview?: boolean;
  highlightRegex?: RegExp;
  htmlReactParserOptions: HTMLReactParserOptions;
  linkifyOpts: Opts;
  outlineAttachment?: boolean;
  room?: Room;
  eventId?: string;
  eventSenderId?: string;
  imageViewerItems?: ViewerImageItem[];
};
export function RenderMessageContent({
  displayName,
  msgType,
  eventType,
  ts,
  edited,
  getContent,
  mediaAutoLoad,
  urlPreview,
  highlightRegex,
  htmlReactParserOptions,
  linkifyOpts,
  outlineAttachment,
  room,
  eventId,
  eventSenderId,
  imageViewerItems,
}: RenderMessageContentProps) {
  const [, setOfficeRevision] = React.useState(0);
  const [fetchedOfficeEvents, setFetchedOfficeEvents] = React.useState<OfficeFileTimelineEvent[]>(
    []
  );
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const myUserId = mx.getSafeUserId();
  const myDisplayName =
    (room && getMemberDisplayName(room, myUserId)) ??
    mx.getUser(myUserId)?.displayName ??
    getMxIdLocalPart(myUserId) ??
    myUserId;
  const myAvatarMxc =
    (room && getMemberAvatarMxc(room, myUserId)) ?? mx.getUser(myUserId)?.avatarUrl;
  const myAvatarUrl = myAvatarMxc
    ? mxcUrlToHttp(mx, myAvatarMxc, false, 128, 128, 'crop') ??
      mxcUrlToHttp(mx, myAvatarMxc, useAuthentication, 128, 128, 'crop') ??
      undefined
    : undefined;

  const revisionContent = msgType === MsgType.File ? getContent<IFileContent>() : undefined;
  const revisionFilename = revisionContent?.filename ?? revisionContent?.body ?? '';
  const revisionMimeType = revisionContent?.info?.mimetype ?? 'application/octet-stream';
  const isOfficeFile = Boolean(getOfficeDocumentKind(revisionFilename, revisionMimeType));
  const revisionSourceEventId =
    eventId && revisionContent
      ? getOfficeSourceEventId(eventId, revisionContent as unknown as Record<string, unknown>)
      : undefined;

  React.useEffect(() => {
    if (!isOfficeFile) return undefined;
    return subscribeOfficeFileRevisions(() => setOfficeRevision((revision) => revision + 1));
  }, [isOfficeFile]);

  React.useEffect(() => {
    let disposed = false;
    setFetchedOfficeEvents([]);
    if (!room || !revisionSourceEventId || !isOfficeFile) return undefined;

    const loadRelations = async () => {
      const requests = await Promise.allSettled([
        mx.relations(room.roomId, revisionSourceEventId, RelationType.Reference, 'm.room.message', {
          dir: Direction.Backward,
          limit: 50,
        }),
        mx.relations(room.roomId, revisionSourceEventId, RelationType.Replace, 'm.room.message', {
          dir: Direction.Backward,
          limit: 50,
        }),
      ]);
      if (disposed) return;

      const events = new Map<string, OfficeFileTimelineEvent>();
      requests.forEach((request) => {
        if (request.status !== 'fulfilled') return;
        const addEvent = (event: MatrixEvent | null | undefined) => {
          if (!event) return;
          const descriptor = toOfficeTimelineEvent(event);
          if (descriptor.eventId) events.set(descriptor.eventId, descriptor);
          const replacement = event.replacingEvent();
          if (replacement) {
            const replacementDescriptor = toOfficeTimelineEvent(replacement);
            if (replacementDescriptor.eventId) {
              events.set(replacementDescriptor.eventId, replacementDescriptor);
            }
          }
        };
        addEvent(request.value.originalEvent);
        request.value.events.forEach(addEvent);
      });
      setFetchedOfficeEvents(Array.from(events.values()));
    };

    loadRelations().catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, [isOfficeFile, mx, revisionSourceEventId, room]);

  const renderUrlsPreview = (urls: string[]) => {
    const filteredUrls = urls.filter((url) => !testMatrixTo(url));
    if (filteredUrls.length === 0) return undefined;
    return (
      <UrlPreviewHolder>
        {filteredUrls.map((url) => (
          <UrlPreviewCard key={url} url={url} ts={ts} />
        ))}
      </UrlPreviewHolder>
    );
  };
  const renderCaption = () => {
    const content: IImageContent = getContent();
    if (content.filename && content.filename !== content.body) {
      return (
        <MText
          style={{ marginTop: config.space.S200 }}
          edited={edited}
          content={content}
          renderBody={(props) => (
            <RenderBody
              {...props}
              highlightRegex={highlightRegex}
              htmlReactParserOptions={htmlReactParserOptions}
              linkifyOpts={linkifyOpts}
            />
          )}
          renderUrlsPreview={urlPreview ? renderUrlsPreview : undefined}
        />
      );
    }
    return null;
  };

  const renderFile = () => {
    const currentContent = getContent<IFileContent>();
    const filename = currentContent.filename ?? currentContent.body ?? '';
    const currentMimeType = currentContent.info?.mimetype ?? 'application/octet-stream';
    let officeContent = currentContent;
    let officeSourceEventId = eventId;
    let officeSourceSenderId = eventSenderId;
    let officeUpdatedBy: string | undefined;
    let officeUpdatedAt: number | undefined;

    if (
      room &&
      eventId &&
      currentContent.msgtype === MsgType.File &&
      getOfficeDocumentKind(filename, currentMimeType)
    ) {
      const eventMap = new Map<string, OfficeFileTimelineEvent>();
      const addEvent = (event: MatrixEvent | undefined) => {
        if (!event) return;
        const descriptor = toOfficeTimelineEvent(event);
        if (descriptor.eventId) eventMap.set(descriptor.eventId, descriptor);
      };
      room.getUnfilteredTimelineSet().getLiveTimeline().getEvents().forEach(addEvent);
      fetchedOfficeEvents.forEach((event) => {
        if (event.eventId) eventMap.set(event.eventId, event);
      });
      const currentEvent = room.findEventById(eventId);
      addEvent(currentEvent);
      const currentSenderId = currentEvent?.getSender() ?? eventSenderId;
      if (currentSenderId) {
        eventMap.set(eventId, {
          eventId,
          senderId: currentSenderId,
          eventType: eventType ?? 'm.room.message',
          timestamp: ts,
          content: currentContent as unknown as Record<string, unknown>,
        });
      }
      addEvent(currentEvent?.replacingEvent() ?? undefined);
      const relation = currentEvent?.getContent<Record<string, unknown>>()['m.relates_to'];
      if (typeof relation === 'object' && relation !== null) {
        const referencedEventId = (relation as Record<string, unknown>).event_id;
        if (typeof referencedEventId === 'string') addEvent(room.findEventById(referencedEventId));
      }

      const resolved = resolveLatestOfficeFileRevision({
        currentEventId: eventId,
        currentContent: currentContent as unknown as Record<string, unknown>,
        currentEventTimestamp: ts,
        timelineEvents: Array.from(eventMap.values()),
      });
      if (resolved) {
        officeContent = resolved.content as unknown as IFileContent;
        officeSourceEventId = resolved.sourceEventId;
        officeSourceSenderId = eventMap.get(resolved.sourceEventId)?.senderId;
        if (resolved.updatedBy) {
          officeUpdatedAt = resolved.revisionTimestamp;
          officeUpdatedBy =
            getMemberDisplayName(room, resolved.updatedBy) ??
            mx.getUser(resolved.updatedBy)?.displayName ??
            getMxIdLocalPart(resolved.updatedBy) ??
            resolved.updatedBy;
        }
      }
    }

    return (
      <>
        <MFile
          content={officeContent}
          renderFileContent={({ body, mimeType, info, encInfo, url }) => {
            if (getOfficeDocumentKind(body, mimeType)) {
              return (
                <OfficeFileEditor
                  body={body}
                  mimeType={mimeType}
                  url={url}
                  encInfo={encInfo}
                  infoSize={info.size}
                  room={room}
                  eventId={officeSourceEventId}
                  sourceSenderId={officeSourceSenderId}
                  updatedBy={officeUpdatedBy}
                  updatedAt={officeUpdatedAt}
                />
              );
            }

            return (
              <FileContent
                body={body}
                mimeType={mimeType}
                renderAsPdfFile={() => (
                  <ReadPdfFile
                    body={body}
                    mimeType={mimeType}
                    url={url}
                    encInfo={encInfo}
                    renderViewer={(p) => <PdfViewer {...p} />}
                  />
                )}
                renderAsTextFile={() => (
                  <ReadTextFile
                    body={body}
                    mimeType={mimeType}
                    url={url}
                    encInfo={encInfo}
                    renderViewer={(p) => <TextViewer {...p} />}
                  />
                )}
                renderAsSpreadsheetFile={() => (
                  <ReadSpreadsheetFile
                    body={body}
                    mimeType={mimeType}
                    url={url}
                    encInfo={encInfo}
                    renderViewer={(p) => <SpreadsheetViewer {...p} />}
                  />
                )}
                renderAsDocxFile={() => (
                  <ReadDocxFile
                    body={body}
                    mimeType={mimeType}
                    url={url}
                    encInfo={encInfo}
                    renderViewer={(p) => <DocxViewer {...p} />}
                  />
                )}
              >
                <DownloadFile
                  body={body}
                  mimeType={mimeType}
                  url={url}
                  encInfo={encInfo}
                  info={info}
                />
              </FileContent>
            );
          }}
          outlined={outlineAttachment}
        />
        {renderCaption()}
      </>
    );
  };

  if (msgType === MsgType.Text) {
    const content = getContent<Record<string, unknown>>();
    const meeting = getJitsiMeetInfo(content);
    if (meeting) {
      return (
        <JitsiMeetCard meeting={meeting} displayName={myDisplayName} avatarUrl={myAvatarUrl} />
      );
    }

    return (
      <MText
        edited={edited}
        content={content}
        renderBody={(props) => (
          <RenderBody
            {...props}
            highlightRegex={highlightRegex}
            htmlReactParserOptions={htmlReactParserOptions}
            linkifyOpts={linkifyOpts}
          />
        )}
        renderUrlsPreview={urlPreview ? renderUrlsPreview : undefined}
      />
    );
  }

  if (msgType === MsgType.Emote) {
    return (
      <MEmote
        displayName={displayName}
        edited={edited}
        content={getContent()}
        renderBody={(props) => (
          <RenderBody
            {...props}
            highlightRegex={highlightRegex}
            htmlReactParserOptions={htmlReactParserOptions}
            linkifyOpts={linkifyOpts}
          />
        )}
        renderUrlsPreview={urlPreview ? renderUrlsPreview : undefined}
      />
    );
  }

  if (msgType === MsgType.Notice) {
    return (
      <MNotice
        edited={edited}
        content={getContent()}
        renderBody={(props) => (
          <RenderBody
            {...props}
            highlightRegex={highlightRegex}
            htmlReactParserOptions={htmlReactParserOptions}
            linkifyOpts={linkifyOpts}
          />
        )}
        renderUrlsPreview={urlPreview ? renderUrlsPreview : undefined}
      />
    );
  }

  if (msgType === MsgType.Image) {
    return (
      <>
        <MImage
          content={getContent()}
          renderImageContent={(props) => (
            <ImageContent
              {...props}
              autoPlay={mediaAutoLoad}
              previewMediaStrategy="stable"
              viewerItems={imageViewerItems}
              viewerItemId={eventId}
              renderImage={(p) => (
                <Image {...p} loading={mediaAutoLoad ? 'eager' : 'lazy'} decoding="async" />
              )}
              renderViewer={(p) => <ImageViewer {...p} />}
            />
          )}
          outlined={outlineAttachment}
        />
        {renderCaption()}
      </>
    );
  }

  if (msgType === MsgType.Video) {
    return (
      <>
        <MVideo
          content={getContent()}
          renderAsFile={renderFile}
          renderVideoContent={({ body, info, ...props }) => (
            <VideoContent
              body={body}
              info={info}
              {...props}
              renderThumbnail={
                mediaAutoLoad
                  ? (onLoad) => (
                      <ThumbnailContent
                        info={info}
                        renderImage={(src) => (
                          <Image
                            alt={body}
                            title={body}
                            src={src}
                            loading={mediaAutoLoad ? 'eager' : 'lazy'}
                            decoding="async"
                            onLoad={onLoad}
                          />
                        )}
                      />
                    )
                  : undefined
              }
              renderVideo={(p) => <Video {...p} />}
            />
          )}
          outlined={outlineAttachment}
        />
        {renderCaption()}
      </>
    );
  }

  if (msgType === MsgType.Audio) {
    return (
      <>
        <MAudio
          content={getContent()}
          renderAsFile={renderFile}
          renderAudioContent={({ url, ...props }) => (
            <AudioContent
              {...props}
              url={url}
              transcriptionId={eventId ?? url}
              renderMediaControl={(p) => <MediaControl {...p} />}
            />
          )}
          outlined={outlineAttachment}
        />
        {renderCaption()}
      </>
    );
  }

  if (msgType === MsgType.File) {
    return renderFile();
  }

  if (msgType === MsgType.Location) {
    return <MLocation content={getContent()} />;
  }

  if (
    eventType === POLL_START_EVENT_TYPE ||
    eventType === UNSTABLE_POLL_START_EVENT_TYPE ||
    msgType === POLL_MSGTYPE ||
    isPollMessage(getContent())
  ) {
    return <PollContent content={getContent()} room={room} eventId={eventId} />;
  }

  if (msgType === 'm.bad.encrypted') {
    return <MBadEncrypted mEvent={room && eventId ? room.findEventById(eventId) : undefined} />;
  }

  return <UnsupportedContent />;
}
