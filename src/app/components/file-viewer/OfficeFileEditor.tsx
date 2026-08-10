import React, { ChangeEvent, useCallback, useRef, useState } from 'react';
import { Box, Button, Icon, Icons, Spinner, Text } from 'folds';
import { MsgType, RelationType, Room } from 'matrix-js-sdk';
import { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useClientConfig } from '../../hooks/useClientConfig';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import {
  OFFICE_FILE_EXTENSIONS,
  getFileNameExt,
  getOfficeDocumentKind,
} from '../../utils/mimeTypes';
import {
  decryptFile,
  downloadEncryptedMedia,
  downloadMedia,
  encryptFile,
  mxcUrlToHttp,
} from '../../utils/matrix';
import { saveDownloadedFile } from '../../utils/saveDownloadedFile';

const DEFAULT_OFFICE_EDITOR_URL = 'https://office.ziziyi.com/editor';
const OFFICE_UPDATE_PROPERTY = 'com.xinghuo.office_update';

type OfficeFileEditorStatus =
  | { type: 'idle' }
  | { type: 'preparing'; message: string }
  | { type: 'uploading'; message: string }
  | { type: 'success'; message: string }
  | { type: 'error'; message: string };

export type OfficeFileEditorProps = {
  body: string;
  mimeType: string;
  url: string;
  encInfo?: EncryptedAttachmentInfo;
  infoSize?: number;
  room?: Room;
  eventId?: string;
};

const appendOfficeEditorParams = (
  editorUrl: string,
  fileUrl: string,
  fileName: string,
  fileType: string
): string => {
  const target = new URL(editorUrl);
  target.searchParams.set('url', fileUrl);
  target.searchParams.set('fileName', fileName);
  target.searchParams.set('fileType', fileType);
  target.searchParams.set('editing', '1');
  target.searchParams.set('lang', 'zh-CN');
  return target.toString();
};

const getReplacementMimeType = (file: File, fallback: string): string =>
  file.type || fallback || 'application/octet-stream';

export function OfficeFileEditor({
  body,
  mimeType,
  url,
  encInfo,
  infoSize,
  room,
  eventId,
}: OfficeFileEditorProps) {
  const mx = useMatrixClient();
  const clientConfig = useClientConfig();
  const useAuthentication = useMediaAuthentication();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<OfficeFileEditorStatus>({ type: 'idle' });

  const officeKind = getOfficeDocumentKind(body, mimeType);
  const officeEditorUrl =
    clientConfig.officeEditor?.url?.trim() || DEFAULT_OFFICE_EDITOR_URL;
  const canReplace = Boolean(room && eventId?.startsWith('$'));

  const loadSourceFile = useCallback(async (): Promise<Blob> => {
    const mediaUrl = mxcUrlToHttp(mx, url, useAuthentication);
    if (!mediaUrl) throw new Error('Invalid media URL');

    return encInfo
      ? downloadEncryptedMedia(mediaUrl, (buffer) => decryptFile(buffer, mimeType, encInfo))
      : downloadMedia(mediaUrl);
  }, [encInfo, mimeType, mx, url, useAuthentication]);

  const handleOpenEditor = useCallback(async () => {
    if (!officeKind) return;

    const fileType = getFileNameExt(body);
    const publicMediaUrl = encInfo ? null : mxcUrlToHttp(mx, url, false);
    if (publicMediaUrl) {
      window.open(
        appendOfficeEditorParams(officeEditorUrl, publicMediaUrl, body, fileType),
        '_blank',
        'noopener,noreferrer'
      );
      setStatus({
        type: 'success',
        message:
          '已打开在线编辑器；若提示安装扩展，请选择直接打开。编辑后下载文件，再点击“更新原文件”。',
      });
      return;
    }

    const editorWindow = window.open('', '_blank');
    if (!editorWindow) {
      setStatus({ type: 'error', message: '浏览器拦截了编辑器窗口，请允许弹出窗口后重试。' });
      return;
    }

    editorWindow.document.title = '正在准备 Office 文档';
    editorWindow.document.body.textContent = '正在准备文档，请稍候…';
    setStatus({ type: 'preparing', message: '正在解密并准备文档…' });

    try {
      const source = await loadSourceFile();
      await saveDownloadedFile(source, body);
      editorWindow.location.href = officeEditorUrl;
      setStatus({
        type: 'success',
        message: '加密文档已下载，请在在线编辑器中选择该文件；编辑后下载并更新原文件。',
      });
    } catch {
      editorWindow.close();
      setStatus({ type: 'error', message: '文档准备失败，请先使用下载按钮保存后再编辑。' });
    }
  }, [body, encInfo, loadSourceFile, mx, officeEditorUrl, officeKind, url]);

  const handleReplacement = useCallback(
    async (selectedFile: File) => {
      if (!room || !eventId || !officeKind) return;

      const selectedKind = getOfficeDocumentKind(selectedFile.name, selectedFile.type);
      if (selectedKind !== officeKind) {
        setStatus({ type: 'error', message: '请选择与原文件相同类型的 Office 文档。' });
        return;
      }

      setStatus({ type: 'uploading', message: '正在上传并更新原文件消息…' });
      try {
        const replacementMimeType = getReplacementMimeType(selectedFile, mimeType);
        const uploadItem = room.hasEncryptionStateEvent()
          ? await encryptFile(selectedFile)
          : { file: selectedFile, encInfo: undefined };
        const upload = await mx.uploadContent(uploadItem.file, {
          includeFilename: !uploadItem.encInfo,
          name: selectedFile.name,
          type: replacementMimeType,
        });
        const replacementMxc = upload.content_uri;
        if (!replacementMxc) throw new Error('Missing MXC URI');

        const newContent: Record<string, unknown> = {
          msgtype: MsgType.File,
          body: selectedFile.name,
          filename: selectedFile.name,
          info: {
            mimetype: replacementMimeType,
            size: selectedFile.size,
          },
          [OFFICE_UPDATE_PROPERTY]: {
            source_event_id: eventId,
            updated_at: Date.now(),
          },
        };

        if (uploadItem.encInfo) {
          newContent.file = { ...uploadItem.encInfo, url: replacementMxc };
        } else {
          newContent.url = replacementMxc;
        }

        await mx.sendMessage(room.roomId, {
          ...newContent,
          body: `* ${selectedFile.name}`,
          'm.new_content': newContent,
          'm.relates_to': {
            event_id: eventId,
            rel_type: RelationType.Replace,
          },
          [OFFICE_UPDATE_PROPERTY]: true,
        } as never);

        setStatus({
          type: 'success',
          message: '原聊天位置中的文件已更新。',
        });
      } catch {
        setStatus({ type: 'error', message: '文件更新失败，请检查网络或房间权限后重试。' });
      }
    },
    [eventId, mimeType, mx, officeKind, room]
  );

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const [file] = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (file) void handleReplacement(file);
  };

  if (!officeKind) return null;

  const busy = status.type === 'preparing' || status.type === 'uploading';

  return (
    <Box direction="Column" gap="100">
      <Box gap="200" wrap="Wrap">
        <Button
          variant="Primary"
          fill="Solid"
          radii="300"
          size="400"
          onClick={() => void handleOpenEditor()}
          disabled={busy}
          before={
            status.type === 'preparing' ? (
              <Spinner size="100" variant="Primary" fill="Solid" />
            ) : (
              <Icon size="100" src={Icons.External} />
            )
          }
        >
          <Text size="B400">在线编辑</Text>
        </Button>
        {canReplace && (
          <Button
            variant="Secondary"
            fill="Soft"
            radii="300"
            size="400"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            before={
              status.type === 'uploading' ? (
                <Spinner size="100" variant="Secondary" fill="Soft" />
              ) : (
                <Icon size="100" src={Icons.ArrowTop} />
              )
            }
          >
            <Text size="B400">更新原文件</Text>
          </Button>
        )}
      </Box>
      <input
        ref={inputRef}
        hidden
        type="file"
        accept={OFFICE_FILE_EXTENSIONS.map((ext) => `.${ext}`).join(',')}
        onChange={handleFileSelect}
      />
      {status.type !== 'idle' && (
        <Text size="O400" priority={status.type === 'error' ? '300' : '400'}>
          {status.message}
        </Text>
      )}
      {typeof infoSize === 'number' && infoSize > 20 * 1024 * 1024 && (
        <Text size="O400" priority="300">
          大型文档加载和转换可能需要较长时间。
        </Text>
      )}
    </Box>
  );
}
