import React, { ReactNode, useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Icon,
  Icons,
  Modal,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Spinner,
  Text,
  Tooltip,
  TooltipProvider,
  as,
} from 'folds';
import { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import FocusTrap from 'focus-trap-react';
import { IFileInfo } from '../../../../types/matrix/common';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { bytesToSize } from '../../../utils/common';
import {
  READABLE_EXT_TO_MIME_TYPE,
  READABLE_TEXT_MIME_TYPES,
  getFileNameExt,
  getFilePreviewKind,
  getNormalizedMimeType,
  mimeTypeToExt,
} from '../../../utils/mimeTypes';
import { stopPropagation } from '../../../utils/keyboard';
import {
  decryptFile,
  downloadEncryptedMedia,
  downloadMedia,
  mxcUrlToHttp,
} from '../../../utils/matrix';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { ModalWide } from '../../../styles/Modal.css';
import { saveDownloadedFile } from '../../../utils/saveDownloadedFile';

const renderErrorButton = (retry: () => void, text: string) => (
  <TooltipProvider
    tooltip={
      <Tooltip variant="Critical">
        <Text>{'\u6587\u4ef6\u52a0\u8f7d\u5931\u8d25\u3002'}</Text>
      </Tooltip>
    }
    position="Top"
    align="Center"
  >
    {(triggerRef) => (
      <Button
        ref={triggerRef}
        size="400"
        variant="Critical"
        fill="Soft"
        outlined
        radii="300"
        onClick={retry}
        before={<Icon size="100" src={Icons.Warning} filled />}
      >
        <Text size="B400" truncate>
          {text}
        </Text>
      </Button>
    )}
  </TooltipProvider>
);

const isSpreadsheetPreviewUnavailableError = (error: unknown): boolean => {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : undefined;

  if (!message) {
    return false;
  }

  return /non-whitespace before first tag|unsupported encryption/i.test(message);
};

const useLoadRemoteFile = (
  mimeType: string,
  url: string,
  encInfo?: EncryptedAttachmentInfo
) => {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  return useCallback(async () => {
    const mediaUrl = mxcUrlToHttp(mx, url, useAuthentication);
    if (!mediaUrl) throw new Error('Invalid media URL');

    return encInfo
      ? downloadEncryptedMedia(mediaUrl, (encBuf) => decryptFile(encBuf, mimeType, encInfo))
      : downloadMedia(mediaUrl);
  }, [mx, url, useAuthentication, mimeType, encInfo]);
};

const renderPreviewModal = (
  open: boolean,
  requestClose: () => void,
  content: ReactNode
) => (
  <Overlay open={open} backdrop={<OverlayBackdrop />}>
    <OverlayCenter>
      <FocusTrap
        focusTrapOptions={{
          initialFocus: false,
          onDeactivate: requestClose,
          clickOutsideDeactivates: true,
          escapeDeactivates: stopPropagation,
        }}
      >
        <Modal
          className={ModalWide}
          size="500"
          onContextMenu={(evt: any) => evt.stopPropagation()}
        >
          {content}
        </Modal>
      </FocusTrap>
    </OverlayCenter>
  </Overlay>
);

type RenderTextViewerProps = {
  name: string;
  text: string;
  langName: string;
  requestClose: () => void;
};
type ReadTextFileProps = {
  body: string;
  mimeType: string;
  url: string;
  encInfo?: EncryptedAttachmentInfo;
  renderViewer: (props: RenderTextViewerProps) => ReactNode;
};
export function ReadTextFile({ body, mimeType, url, encInfo, renderViewer }: ReadTextFileProps) {
  const [textViewer, setTextViewer] = useState(false);
  const loadRemoteFile = useLoadRemoteFile(mimeType, url, encInfo);

  const [textState, loadText] = useAsyncCallback(
    useCallback(async () => {
      const fileContent = await loadRemoteFile();
      const text = await fileContent.text();

      setTextViewer(true);
      return text;
    }, [loadRemoteFile])
  );

  const normalizedMimeType = getNormalizedMimeType(mimeType);
  const extensionMimeType = READABLE_EXT_TO_MIME_TYPE[getFileNameExt(body)];

  return (
    <>
      {textState.status === AsyncStatus.Success &&
        renderPreviewModal(
          textViewer,
          () => setTextViewer(false),
          renderViewer({
            name: body,
            text: textState.data,
            langName: READABLE_TEXT_MIME_TYPES.includes(normalizedMimeType)
              ? mimeTypeToExt(normalizedMimeType)
              : mimeTypeToExt(extensionMimeType ?? normalizedMimeType),
            requestClose: () => setTextViewer(false),
          })
        )}
      {textState.status === AsyncStatus.Error ? (
        renderErrorButton(loadText, '\u6253\u5f00\u6587\u672c')
      ) : (
        <Button
          variant="Secondary"
          fill="Solid"
          radii="300"
          size="400"
          onClick={() =>
            textState.status === AsyncStatus.Success ? setTextViewer(true) : loadText()
          }
          disabled={textState.status === AsyncStatus.Loading}
          before={
            textState.status === AsyncStatus.Loading ? (
              <Spinner fill="Solid" size="100" variant="Secondary" />
            ) : (
              <Icon size="100" src={Icons.ArrowRight} filled />
            )
          }
        >
          <Text size="B400" truncate>
            {'\u6253\u5f00\u6587\u672c'}
          </Text>
        </Button>
      )}
    </>
  );
}

type RenderPdfViewerProps = {
  name: string;
  src: string;
  requestClose: () => void;
};
export type ReadPdfFileProps = {
  body: string;
  mimeType: string;
  url: string;
  encInfo?: EncryptedAttachmentInfo;
  renderViewer: (props: RenderPdfViewerProps) => ReactNode;
};
export function ReadPdfFile({ body, mimeType, url, encInfo, renderViewer }: ReadPdfFileProps) {
  const [pdfViewer, setPdfViewer] = useState(false);
  const loadRemoteFile = useLoadRemoteFile(mimeType, url, encInfo);

  const [pdfState, loadPdf] = useAsyncCallback(
    useCallback(async () => {
      const fileContent = await loadRemoteFile();
      setPdfViewer(true);
      return URL.createObjectURL(fileContent);
    }, [loadRemoteFile])
  );

  useEffect(
    () => () => {
      if (pdfState.status === AsyncStatus.Success) {
        URL.revokeObjectURL(pdfState.data);
      }
    },
    [pdfState]
  );

  return (
    <>
      {pdfState.status === AsyncStatus.Success &&
        renderPreviewModal(
          pdfViewer,
          () => setPdfViewer(false),
          renderViewer({
            name: body,
            src: pdfState.data,
            requestClose: () => setPdfViewer(false),
          })
        )}
      {pdfState.status === AsyncStatus.Error ? (
        renderErrorButton(loadPdf, '\u6253\u5f00\u6587\u6863')
      ) : (
        <Button
          variant="Secondary"
          fill="Solid"
          radii="300"
          size="400"
          onClick={() => (pdfState.status === AsyncStatus.Success ? setPdfViewer(true) : loadPdf())}
          disabled={pdfState.status === AsyncStatus.Loading}
          before={
            pdfState.status === AsyncStatus.Loading ? (
              <Spinner fill="Solid" size="100" variant="Secondary" />
            ) : (
              <Icon size="100" src={Icons.ArrowRight} filled />
            )
          }
        >
          <Text size="B400" truncate>
            {'\u6253\u5f00\u6587\u6863'}
          </Text>
        </Button>
      )}
    </>
  );
}

type RenderSpreadsheetViewerProps = {
  name: string;
  data: ArrayBuffer;
  mimeType: string;
  requestClose: () => void;
  onPreviewUnavailable?: () => void;
};
export type ReadSpreadsheetFileProps = {
  body: string;
  mimeType: string;
  url: string;
  encInfo?: EncryptedAttachmentInfo;
  renderViewer: (props: RenderSpreadsheetViewerProps) => ReactNode;
};
export function ReadSpreadsheetFile({
  body,
  mimeType,
  url,
  encInfo,
  renderViewer,
}: ReadSpreadsheetFileProps) {
  const [sheetViewer, setSheetViewer] = useState(false);
  const [previewUnavailable, setPreviewUnavailable] = useState(false);
  const loadRemoteFile = useLoadRemoteFile(mimeType, url, encInfo);

  const [sheetState, loadSpreadsheet] = useAsyncCallback(
    useCallback(async () => {
      const fileContent = await loadRemoteFile();
      const buffer = await fileContent.arrayBuffer();

      setSheetViewer(true);
      return buffer;
    }, [loadRemoteFile])
  );

  if (previewUnavailable) {
    return null;
  }

  return (
    <>
      {sheetState.status === AsyncStatus.Success &&
        renderPreviewModal(
          sheetViewer,
          () => setSheetViewer(false),
          renderViewer({
            name: body,
            data: sheetState.data,
            mimeType,
            onPreviewUnavailable: () => {
              setSheetViewer(false);
              setPreviewUnavailable(true);
            },
            requestClose: () => setSheetViewer(false),
          })
        )}
      {sheetState.status === AsyncStatus.Error && !isSpreadsheetPreviewUnavailableError(sheetState.error) ? (
        renderErrorButton(loadSpreadsheet, '\u6253\u5f00\u8868\u683c')
      ) : (
        <Button
          variant="Secondary"
          fill="Solid"
          radii="300"
          size="400"
          onClick={() =>
            sheetState.status === AsyncStatus.Success ? setSheetViewer(true) : loadSpreadsheet()
          }
          disabled={sheetState.status === AsyncStatus.Loading}
          before={
            sheetState.status === AsyncStatus.Loading ? (
              <Spinner fill="Solid" size="100" variant="Secondary" />
            ) : (
              <Icon size="100" src={Icons.File} filled />
            )
          }
        >
          <Text size="B400" truncate>
            {'\u6253\u5f00\u8868\u683c'}
          </Text>
        </Button>
      )}
    </>
  );
}

type RenderDocxViewerProps = {
  name: string;
  data: ArrayBuffer;
  mimeType: string;
  requestClose: () => void;
};
export type ReadDocxFileProps = {
  body: string;
  mimeType: string;
  url: string;
  encInfo?: EncryptedAttachmentInfo;
  renderViewer: (props: RenderDocxViewerProps) => ReactNode;
};
export function ReadDocxFile(_: ReadDocxFileProps) {
  return null;
}

export type DownloadFileProps = {
  body: string;
  mimeType: string;
  url: string;
  info: IFileInfo;
  encInfo?: EncryptedAttachmentInfo;
};
export function DownloadFile({ body, mimeType, url, info, encInfo }: DownloadFileProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const [downloadState, download] = useAsyncCallback(
    useCallback(async () => {
      const mediaUrl = mxcUrlToHttp(mx, url, useAuthentication);
      if (!mediaUrl) throw new Error('Invalid media URL');
      const fileContent = encInfo
        ? await downloadEncryptedMedia(mediaUrl, (encBuf) => decryptFile(encBuf, mimeType, encInfo))
        : await downloadMedia(mediaUrl);

      await saveDownloadedFile(fileContent, body);
      return fileContent;
    }, [mx, url, useAuthentication, mimeType, encInfo, body])
  );

  return downloadState.status === AsyncStatus.Error ? (
    renderErrorButton(download, `\u91cd\u8bd5\u4e0b\u8f7d (${bytesToSize(info.size ?? 0)})`)
  ) : (
    <Button
      variant="Secondary"
      fill="Soft"
      radii="300"
      size="400"
      onClick={() => {
        if (downloadState.status === AsyncStatus.Success) {
          void saveDownloadedFile(downloadState.data, body);
          return;
        }

        download();
      }}
      disabled={downloadState.status === AsyncStatus.Loading}
      before={
        downloadState.status === AsyncStatus.Loading ? (
          <Spinner fill="Soft" size="100" variant="Secondary" />
        ) : (
          <Icon size="100" src={Icons.Download} filled />
        )
      }
    >
      <Text size="B400" truncate>{`\u4e0b\u8f7d (${bytesToSize(info.size ?? 0)})`}</Text>
    </Button>
  );
}

type FileContentProps = {
  body: string;
  mimeType: string;
  renderAsTextFile: () => ReactNode;
  renderAsPdfFile: () => ReactNode;
  renderAsSpreadsheetFile: () => ReactNode;
  renderAsDocxFile: () => ReactNode;
};
export const FileContent = as<'div', FileContentProps>(
  (
    {
      body,
      mimeType,
      renderAsTextFile,
      renderAsPdfFile,
      renderAsSpreadsheetFile,
      renderAsDocxFile,
      children,
      ...props
    },
    ref
  ) => {
    const previewKind = getFilePreviewKind(body, mimeType);
    const showDocxPreview = false;

    return (
      <Box direction="Column" gap="300" {...props} ref={ref}>
        {previewKind === 'text' && renderAsTextFile()}
        {previewKind === 'pdf' && renderAsPdfFile()}
        {previewKind === 'spreadsheet' && renderAsSpreadsheetFile()}
        {previewKind === 'docx' && showDocxPreview && renderAsDocxFile()}
        {children}
      </Box>
    );
  }
);
