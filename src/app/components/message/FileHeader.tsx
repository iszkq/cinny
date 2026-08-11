import { Badge, Box, Icon, IconButton, Icons, Spinner, Text, as, toRem } from 'folds';
import React, { ReactNode, useCallback } from 'react';
import { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import {
  OfficeDocumentKind,
  getFileNameExt,
  getOfficeDocumentKind,
  mimeTypeToExt,
} from '../../utils/mimeTypes';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import {
  decryptFile,
  downloadEncryptedMedia,
  downloadMedia,
  mxcUrlToHttp,
} from '../../utils/matrix';
import { saveDownloadedFile } from '../../utils/saveDownloadedFile';

const badgeStyles = { maxWidth: toRem(100) };

const OFFICE_ICON_META: Record<OfficeDocumentKind, { label: string; background: string }> = {
  word: { label: 'W', background: '#185ABD' },
  spreadsheet: { label: 'X', background: '#107C41' },
  presentation: { label: 'P', background: '#C43E1C' },
  pdf: { label: 'PDF', background: '#E53935' },
};

function OfficeDocumentIcon({ kind }: { kind: OfficeDocumentKind }) {
  const meta = OFFICE_ICON_META[kind];
  return (
    <Box
      alignItems="Center"
      justifyContent="Center"
      shrink="No"
      aria-label={`${kind} document`}
      style={{
        width: toRem(32),
        height: toRem(32),
        borderRadius: toRem(6),
        color: '#fff',
        backgroundColor: meta.background,
        boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.18)',
      }}
    >
      <Text size="B400">{meta.label}</Text>
    </Box>
  );
}

type FileDownloadButtonProps = {
  filename: string;
  url: string;
  mimeType: string;
  encInfo?: EncryptedAttachmentInfo;
};
export function FileDownloadButton({ filename, url, mimeType, encInfo }: FileDownloadButtonProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const [downloadState, download] = useAsyncCallback(
    useCallback(async () => {
      const mediaUrl = mxcUrlToHttp(mx, url, useAuthentication);
      if (!mediaUrl) throw new Error('Invalid media URL');
      const fileContent = encInfo
        ? await downloadEncryptedMedia(mediaUrl, (encBuf) => decryptFile(encBuf, mimeType, encInfo))
        : await downloadMedia(mediaUrl);

      await saveDownloadedFile(fileContent, filename);
      return fileContent;
    }, [mx, url, useAuthentication, mimeType, encInfo, filename])
  );

  const downloading = downloadState.status === AsyncStatus.Loading;
  const hasError = downloadState.status === AsyncStatus.Error;
  return (
    <IconButton
      disabled={downloading}
      onClick={() => {
        if (downloadState.status === AsyncStatus.Success) {
          saveDownloadedFile(downloadState.data, filename).catch(() => undefined);
          return;
        }

        download();
      }}
      variant={hasError ? 'Critical' : 'SurfaceVariant'}
      size="300"
      radii="300"
    >
      {downloading ? (
        <Spinner size="100" variant={hasError ? 'Critical' : 'Secondary'} />
      ) : (
        <Icon size="100" src={Icons.Download} />
      )}
    </IconButton>
  );
}

export type FileHeaderProps = {
  body: string;
  mimeType: string;
  after?: ReactNode;
  actionPlacement?: 'end' | 'badge';
};
export const FileHeader = as<'div', FileHeaderProps>(
  ({ body, mimeType, after, actionPlacement = 'end', ...props }, ref) => {
    const nameExt = getFileNameExt(body);
    const extLabel = nameExt && nameExt !== body ? nameExt : mimeTypeToExt(mimeType);
    const officeKind = getOfficeDocumentKind(body, mimeType);

    if (actionPlacement === 'badge') {
      return (
        <Box
          direction="Column"
          alignItems="Start"
          gap="100"
          grow="Yes"
          style={{ minWidth: 0 }}
          {...props}
          ref={ref}
        >
          <Box alignItems="Center" gap="100">
            {officeKind && <OfficeDocumentIcon kind={officeKind} />}
            <Badge style={badgeStyles} variant="Secondary" radii="Pill">
              <Text size="O400" truncate>
                {extLabel}
              </Text>
            </Badge>
            {after}
          </Box>
          <Text size="T300" truncate style={{ width: '100%' }}>
            {body}
          </Text>
        </Box>
      );
    }

    return (
      <Box
        alignItems="Center"
        gap="200"
        grow="Yes"
        wrap="Wrap"
        style={{ minWidth: 0 }}
        {...props}
        ref={ref}
      >
        {officeKind && <OfficeDocumentIcon kind={officeKind} />}
        <Box shrink="No">
          <Badge style={badgeStyles} variant="Secondary" radii="Pill">
            <Text size="O400" truncate>
              {extLabel}
            </Text>
          </Badge>
        </Box>
        <Box grow="Yes" style={{ minWidth: 0 }}>
          <Text size="T300" truncate>
            {body}
          </Text>
        </Box>
        {after && <Box shrink="No">{after}</Box>}
      </Box>
    );
  }
);
