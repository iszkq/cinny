import { EventType, IContent, MatrixClient, MatrixEvent, MsgType, Room } from 'matrix-js-sdk';
import {
  IAudioContent,
  IEncryptedFile,
  IFileContent,
  IImageContent,
  IVideoContent,
  MATRIX_SPOILER_PROPERTY_NAME,
} from '../../../types/matrix/common';
import { MessageEvent } from '../../../types/matrix/room';
import { TUploadItem } from '../../state/room/roomInputDrafts';
import {
  decryptFile,
  downloadEncryptedMedia,
  downloadMedia,
  encryptFile,
  getMxIdLocalPart,
  mxcUrlToHttp,
} from '../../utils/matrix';
import { getMemberAvatarMxc, getMemberDisplayName } from '../../utils/room';
import {
  OUTGOING_POLL_START_EVENT_TYPE,
  UNSTABLE_POLL_START_EVENT_TYPE,
} from '../../utils/polls';
import { getAudioMsgContent, getFileMsgContent, getImageMsgContent, getVideoMsgContent } from '../room/msgContent';
import { isForwardableMessage } from '../room/forwardMessages';
import {
  CINNY_FAVORITE_CONTENT_KEY,
  FavoriteMessageContent,
  FavoriteMessageMetadata,
  getFavoriteMessageMetadataFromEvent,
} from './types';

type FavoriteMediaKind = 'sticker' | 'image' | 'video' | 'audio' | 'file';

type FavoriteMediaSource = {
  kind: FavoriteMediaKind;
  body: string;
  filename: string;
  mimeType?: string;
  mxcUrl: string;
  encInfo?: IEncryptedFile;
  markedAsSpoiler?: boolean;
  audioDuration?: number;
  voice?: boolean;
};

const getFallbackMimeType = (kind: FavoriteMediaKind): string => {
  if (kind === 'sticker' || kind === 'image') return 'image/*';
  if (kind === 'video') return 'video/*';
  if (kind === 'audio') return 'audio/*';

  return 'application/octet-stream';
};

const cloneContent = (content: IContent): IContent => JSON.parse(JSON.stringify(content));

const sanitizeFavoriteContent = (content: IContent): FavoriteMessageContent => {
  const favoriteContent = cloneContent(content) as FavoriteMessageContent;

  delete favoriteContent['m.relates_to'];
  delete favoriteContent['m.mentions'];

  return favoriteContent;
};

const createFavoriteUploadItem = async (
  sourceFile: File,
  targetRoom: Room | undefined,
  source: FavoriteMediaSource
): Promise<TUploadItem> => {
  const metadata = {
    markedAsSpoiler: Boolean(source.markedAsSpoiler),
    audioDuration: source.audioDuration,
    voice: source.voice,
  };

  if (!targetRoom?.hasEncryptionStateEvent()) {
    return {
      file: sourceFile,
      originalFile: sourceFile,
      metadata,
      encInfo: undefined,
    };
  }

  const encryptedFile = await encryptFile(sourceFile);

  return {
    ...encryptedFile,
    metadata,
  };
};

const getFavoriteMediaSource = (mEvent: MatrixEvent): FavoriteMediaSource | undefined => {
  const eventType = mEvent.getType();
  const content = mEvent.getContent();

  if (eventType === EventType.Sticker) {
    const stickerContent = content as Partial<IImageContent>;
    const mxcUrl = stickerContent.file?.url ?? stickerContent.url;

    if (typeof mxcUrl !== 'string') return undefined;

    return {
      kind: 'sticker',
      body: stickerContent.body ?? 'Sticker',
      filename: stickerContent.body ?? 'sticker',
      mimeType: stickerContent.info?.mimetype,
      mxcUrl,
      encInfo: stickerContent.file,
      markedAsSpoiler: stickerContent[MATRIX_SPOILER_PROPERTY_NAME],
    };
  }

  if (eventType !== MessageEvent.RoomMessage) return undefined;

  if (content.msgtype === MsgType.Image) {
    const imageContent = content as Partial<IImageContent>;
    const mxcUrl = imageContent.file?.url ?? imageContent.url;

    if (typeof mxcUrl !== 'string') return undefined;

    return {
      kind: 'image',
      body: imageContent.body ?? imageContent.filename ?? 'image',
      filename: imageContent.filename ?? imageContent.body ?? 'image',
      mimeType: imageContent.info?.mimetype,
      mxcUrl,
      encInfo: imageContent.file,
      markedAsSpoiler: imageContent[MATRIX_SPOILER_PROPERTY_NAME],
    };
  }

  if (content.msgtype === MsgType.Video) {
    const videoContent = content as Partial<IVideoContent>;
    const mxcUrl = videoContent.file?.url ?? videoContent.url;

    if (typeof mxcUrl !== 'string') return undefined;

    return {
      kind: 'video',
      body: videoContent.body ?? videoContent.filename ?? 'video',
      filename: videoContent.filename ?? videoContent.body ?? 'video',
      mimeType: videoContent.info?.mimetype,
      mxcUrl,
      encInfo: videoContent.file,
      markedAsSpoiler: videoContent[MATRIX_SPOILER_PROPERTY_NAME],
    };
  }

  if (content.msgtype === MsgType.Audio) {
    const audioContent = content as Partial<IAudioContent>;
    const mxcUrl = audioContent.file?.url ?? audioContent.url;

    if (typeof mxcUrl !== 'string') return undefined;

    const filename = audioContent.filename ?? audioContent.body ?? 'audio';

    return {
      kind: 'audio',
      body: audioContent.body ?? filename,
      filename,
      mimeType: audioContent.info?.mimetype,
      mxcUrl,
      encInfo: audioContent.file,
      audioDuration: audioContent.info?.duration,
      voice: filename.startsWith('voice-note-'),
    };
  }

  if (content.msgtype === MsgType.File) {
    const fileContent = content as Partial<IFileContent>;
    const mxcUrl = fileContent.file?.url ?? fileContent.url;

    if (typeof mxcUrl !== 'string') return undefined;

    return {
      kind: 'file',
      body: fileContent.body ?? fileContent.filename ?? 'file',
      filename: fileContent.filename ?? fileContent.body ?? 'file',
      mimeType: fileContent.info?.mimetype,
      mxcUrl,
      encInfo: fileContent.file,
    };
  }

  return undefined;
};

const downloadFavoriteSourceFile = async (
  mx: MatrixClient,
  source: FavoriteMediaSource
): Promise<File> => {
  const mediaUrl = source.mxcUrl.startsWith('mxc://')
    ? mxcUrlToHttp(mx, source.mxcUrl, true) ?? mxcUrlToHttp(mx, source.mxcUrl, false)
    : source.mxcUrl;

  if (!mediaUrl) {
    throw new Error('Missing favorite media url.');
  }

  const mimeType = source.mimeType ?? getFallbackMimeType(source.kind);
  const mediaBlob = source.encInfo
    ? await downloadEncryptedMedia(mediaUrl, (encBuffer) =>
        decryptFile(encBuffer, mimeType, source.encInfo)
      )
    : await downloadMedia(mediaUrl);

  return new File([mediaBlob], source.filename, {
    type: mediaBlob.type || mimeType,
  });
};

const createDurableFavoriteContent = async (
  mx: MatrixClient,
  targetRoom: Room | undefined,
  mEvent: MatrixEvent
): Promise<FavoriteMessageContent> => {
  const source = getFavoriteMediaSource(mEvent);
  if (!source) {
    return sanitizeFavoriteContent(mEvent.getContent());
  }

  const sourceFile = await downloadFavoriteSourceFile(mx, source);
  const uploadItem = await createFavoriteUploadItem(sourceFile, targetRoom, source);
  const uploadResponse = await mx.uploadContent(uploadItem.file, {
    includeFilename: true,
    name: sourceFile.name,
    type: uploadItem.file.type || sourceFile.type,
  });
  const uploadMxc = uploadResponse.content_uri;

  if (!uploadMxc) {
    throw new Error('Failed to upload favorite media copy.');
  }

  if (source.kind === 'image') {
    return (await getImageMsgContent(mx, uploadItem, uploadMxc)) as FavoriteMessageContent;
  }

  if (source.kind === 'video') {
    return (await getVideoMsgContent(mx, uploadItem, uploadMxc)) as FavoriteMessageContent;
  }

  if (source.kind === 'audio') {
    return getAudioMsgContent(uploadItem, uploadMxc) as FavoriteMessageContent;
  }

  if (source.kind === 'file') {
    return getFileMsgContent(uploadItem, uploadMxc) as FavoriteMessageContent;
  }

  const stickerContent = (await getImageMsgContent(mx, uploadItem, uploadMxc)) as FavoriteMessageContent;
  delete stickerContent.msgtype;
  delete stickerContent.filename;

  return stickerContent;
};

export const getFavoriteEventsBySource = (
  room: Room | undefined,
  sourceRoomId: string,
  sourceEventId: string
): MatrixEvent[] => {
  if (!room || !sourceEventId) return [];

  return room
    .getLiveTimeline()
    .getEvents()
    .filter((event) => {
      if (event.isRedacted()) return false;

      const metadata = getFavoriteMessageMetadataFromEvent(event);
      return (
        metadata?.sourceRoomId === sourceRoomId && metadata.sourceEventId === sourceEventId
      );
    });
};

export const favoriteMessageToRoom = async (
  mx: MatrixClient,
  targetRoomId: string,
  sourceRoom: Room,
  mEvent: MatrixEvent
): Promise<string | undefined> => {
  const eventType = mEvent.getType();
  const content = mEvent.getContent();
  const sourceEventId = mEvent.getId() ?? '';

  if (!isForwardableMessage(eventType, content)) {
    throw new Error('Unsupported favorite message type.');
  }

  const targetRoom = mx.getRoom(targetRoomId) ?? undefined;
  const existingFavorite = getFavoriteEventsBySource(
    targetRoom,
    sourceRoom.roomId,
    sourceEventId
  )[0];
  if (existingFavorite) {
    return existingFavorite.getId() ?? undefined;
  }

  const senderId = mEvent.getSender();
  const senderName =
    (senderId && getMemberDisplayName(sourceRoom, senderId)) ??
    (senderId && getMxIdLocalPart(senderId)) ??
    senderId ??
    '\u672a\u77e5\u7528\u6237';

  const favoriteContent = await createDurableFavoriteContent(mx, targetRoom, mEvent);
  const metadata: FavoriteMessageMetadata = {
    version: 1,
    sourceRoomId: sourceRoom.roomId,
    sourceRoomName: sourceRoom.name ?? sourceRoom.roomId,
    sourceRoomAvatarMxc: sourceRoom.getMxcAvatarUrl() ?? undefined,
    sourceEventId,
    sourceSenderId: senderId ?? undefined,
    sourceSenderName: senderName,
    sourceSenderAvatarMxc: senderId ? getMemberAvatarMxc(sourceRoom, senderId) : undefined,
    sourceTimestamp: mEvent.getTs(),
    favoritedAt: Date.now(),
  };

  favoriteContent[CINNY_FAVORITE_CONTENT_KEY] = metadata;

  if (eventType === MessageEvent.Sticker) {
    const response = await mx.sendEvent(targetRoomId, EventType.Sticker, favoriteContent);
    return response?.event_id;
  }

  if (eventType === MessageEvent.PollStart || eventType === UNSTABLE_POLL_START_EVENT_TYPE) {
    const response = await mx.sendEvent(targetRoomId, OUTGOING_POLL_START_EVENT_TYPE, favoriteContent);
    return response?.event_id;
  }

  const response = await mx.sendMessage(targetRoomId, favoriteContent as never);
  return response?.event_id;
};

export const removeFavoriteMessage = async (
  mx: MatrixClient,
  roomId: string,
  eventId: string
): Promise<void> => {
  if (!eventId) throw new Error('Missing favorite event id.');

  await mx.redactEvent(roomId, eventId);
};
