import { Badge, Box, Icon, IconButton, Icons, Spinner, Text, as, toRem } from 'folds';
import React, { ReactNode, useCallback } from 'react';
import { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import { getFileNameExt, mimeTypeToExt } from '../../utils/mimeTypes';
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
          void saveDownloadedFile(downloadState.data, filename);
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
};
export const FileHeader = as<'div', FileHeaderProps>(
  ({ body, mimeType, after, ...props }, ref) => {
    const nameExt = getFileNameExt(body);
    const extLabel = nameExt && nameExt !== body ? nameExt : mimeTypeToExt(mimeType);

    return (
      <Box alignItems="Center" gap="200" grow="Yes" wrap="Wrap" style={{ minWidth: 0 }} {...props} ref={ref}>
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
