import React, {
  ReactEventHandler,
  ReactNode,
  SyntheticEvent,
  useCallback,
  useEffect,
  useState,
} from 'react';
import {
  Badge,
  Box,
  Button,
  Chip,
  Icon,
  Icons,
  Spinner,
  Text,
  Tooltip,
  TooltipProvider,
  as,
} from 'folds';
import classNames from 'classnames';
import { BlurhashCanvas } from 'react-blurhash';
import { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import {
  IThumbnailContent,
  IVideoInfo,
  MATRIX_BLUR_HASH_PROPERTY_NAME,
} from '../../../../types/matrix/common';
import * as css from './style.css';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { bytesToSize, millisecondsToMinutesAndSeconds } from '../../../utils/common';
import {
  decryptFile,
  downloadEncryptedMedia,
  downloadMedia,
  mxcUrlToHttp,
} from '../../../utils/matrix';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { validBlurHash } from '../../../utils/blurHash';

type RenderVideoProps = {
  title: string;
  src: string;
  onLoadedMetadata: ReactEventHandler<HTMLVideoElement>;
  onError: () => void;
  autoPlay: boolean;
  controls: boolean;
};
type VideoContentProps = {
  body: string;
  mimeType: string;
  url: string;
  info: IVideoInfo & IThumbnailContent;
  encInfo?: EncryptedAttachmentInfo;
  autoPlay?: boolean;
  markedAsSpoiler?: boolean;
  spoilerReason?: string;
  onDimensionsChange?: (width: number, height: number) => void;
  renderThumbnail?: (onLoad: ReactEventHandler<HTMLImageElement>) => ReactNode;
  renderVideo: (props: RenderVideoProps) => ReactNode;
};
export const VideoContent = as<'div', VideoContentProps>(
  (
    {
      className,
      body,
      mimeType,
      url,
      info,
      encInfo,
      autoPlay,
      markedAsSpoiler,
      spoilerReason,
      onDimensionsChange,
      renderThumbnail,
      renderVideo,
      ...props
    },
    ref
  ) => {
    const mx = useMatrixClient();
    const useAuthentication = useMediaAuthentication();
    const blurHash = validBlurHash(info.thumbnail_info?.[MATRIX_BLUR_HASH_PROPERTY_NAME]);

    const [load, setLoad] = useState(false);
    const [error, setError] = useState(false);
    const [blurred, setBlurred] = useState(markedAsSpoiler ?? false);

    const [srcState, loadSrc] = useAsyncCallback(
      useCallback(async () => {
        const mediaUrl = mxcUrlToHttp(mx, url, useAuthentication);
        if (!mediaUrl) throw new Error('Invalid media URL');

        const fileContent = encInfo
          ? await downloadEncryptedMedia(mediaUrl, (encBuf) =>
              decryptFile(encBuf, mimeType, encInfo)
            )
          : await downloadMedia(mediaUrl);
        const playableContent =
          fileContent.type === mimeType ? fileContent : new Blob([fileContent], { type: mimeType });
        return URL.createObjectURL(playableContent);
      }, [mx, url, useAuthentication, mimeType, encInfo])
    );

    const handleLoad = (evt: SyntheticEvent<HTMLVideoElement>) => {
      setLoad(true);
      onDimensionsChange?.(evt.currentTarget.videoWidth, evt.currentTarget.videoHeight);
    };
    const handleThumbnailLoad = (evt: SyntheticEvent<HTMLImageElement>) => {
      onDimensionsChange?.(evt.currentTarget.naturalWidth, evt.currentTarget.naturalHeight);
    };
    const handleError = () => {
      setLoad(false);
      setError(true);
    };

    const handleRetry = () => {
      setError(false);
      loadSrc();
    };

    useEffect(() => {
      if (autoPlay) loadSrc();
    }, [autoPlay, loadSrc]);

    return (
      <Box className={classNames(css.RelativeBase, className)} {...props} ref={ref}>
        {typeof blurHash === 'string' && !load && (
          <BlurhashCanvas
            style={{ width: '100%', height: '100%' }}
            width={32}
            height={32}
            hash={blurHash}
            punch={1}
          />
        )}
        {renderThumbnail && !load && (
          <Box
            className={classNames(css.AbsoluteContainer, blurred && css.Blur)}
            alignItems="Center"
            justifyContent="Center"
          >
            {renderThumbnail(handleThumbnailLoad)}
          </Box>
        )}
        {!autoPlay && !blurred && srcState.status === AsyncStatus.Idle && (
          <Box className={css.AbsoluteContainer} alignItems="Center" justifyContent="Center">
            <Button
              variant="Secondary"
              fill="Solid"
              radii="300"
              size="300"
              onClick={loadSrc}
              before={<Icon size="Inherit" src={Icons.Play} filled />}
            >
              <Text size="B300">{'\u89c2\u770b'}</Text>
            </Button>
          </Box>
        )}
        {srcState.status === AsyncStatus.Success && (
          <Box className={classNames(css.AbsoluteContainer, blurred && css.Blur)}>
            {renderVideo({
              title: body,
              src: srcState.data,
              onLoadedMetadata: handleLoad,
              onError: handleError,
              autoPlay: true,
              controls: true,
            })}
          </Box>
        )}
        {blurred && !error && srcState.status !== AsyncStatus.Error && (
          <Box className={css.AbsoluteContainer} alignItems="Center" justifyContent="Center">
            <TooltipProvider
              tooltip={
                typeof spoilerReason === 'string' && (
                  <Tooltip variant="Secondary">
                    <Text>{spoilerReason}</Text>
                  </Tooltip>
                )
              }
              position="Top"
              align="Center"
            >
              {(triggerRef) => (
                <Chip
                  ref={triggerRef}
                  variant="Secondary"
                  radii="Pill"
                  size="500"
                  outlined
                  onClick={() => {
                    setBlurred(false);
                  }}
                >
                  <Text size="B300">{'\u663e\u793a\u5267\u900f'}</Text>
                </Chip>
              )}
            </TooltipProvider>
          </Box>
        )}
        {(srcState.status === AsyncStatus.Loading || srcState.status === AsyncStatus.Success) &&
          !load &&
          !blurred && (
            <Box className={css.AbsoluteContainer} alignItems="Center" justifyContent="Center">
              <Spinner variant="Secondary" />
            </Box>
          )}
        {(error || srcState.status === AsyncStatus.Error) && (
          <Box className={css.AbsoluteContainer} alignItems="Center" justifyContent="Center">
            <TooltipProvider
              tooltip={
                <Tooltip variant="Critical">
                  <Text>{'\u89c6\u9891\u52a0\u8f7d\u5931\u8d25\u3002'}</Text>
                </Tooltip>
              }
              position="Top"
              align="Center"
            >
              {(triggerRef) => (
                <Button
                  ref={triggerRef}
                  size="300"
                  variant="Critical"
                  fill="Soft"
                  outlined
                  radii="300"
                  onClick={handleRetry}
                  before={<Icon size="Inherit" src={Icons.Warning} filled />}
                >
                  <Text size="B300">{'\u91cd\u8bd5'}</Text>
                </Button>
              )}
            </TooltipProvider>
          </Box>
        )}
        {!load && typeof info.size === 'number' && (
          <Box
            className={css.AbsoluteFooter}
            justifyContent="SpaceBetween"
            alignContent="Center"
            gap="200"
          >
            <Badge variant="Secondary" fill="Soft">
              <Text size="L400">{millisecondsToMinutesAndSeconds(info.duration ?? 0)}</Text>
            </Badge>
            <Badge variant="Secondary" fill="Soft">
              <Text size="L400">{bytesToSize(info.size)}</Text>
            </Badge>
          </Box>
        )}
      </Box>
    );
  }
);
