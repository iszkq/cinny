/* eslint-disable jsx-a11y/media-has-caption */
import React, { ReactNode, useCallback, useRef, useState } from 'react';
import {
  Badge,
  Box,
  Chip,
  Icon,
  IconButton,
  Icons,
  ProgressBar,
  Spinner,
  Text,
  color,
  toRem,
} from 'folds';
import { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import { Range } from 'react-range';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { IAudioInfo } from '../../../../types/matrix/common';
import {
  PlayTimeCallback,
  useMediaLoading,
  useMediaPlay,
  useMediaPlaybackRate,
  useMediaPlayTimeCallback,
  useMediaSeek,
  useMediaVolume,
} from '../../../hooks/media';
import { useThrottle } from '../../../hooks/useThrottle';
import { secondsToMinutesAndSeconds } from '../../../utils/common';
import {
  decryptFile,
  downloadEncryptedMedia,
  downloadMedia,
  mxcUrlToHttp,
} from '../../../utils/matrix';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import {
  MAX_AUDIO_TRANSCRIPTION_DURATION_MS,
  useAudioTranscription,
} from '../../../features/voice-transcription';
import { AIHUBMIX_AUDIO_TRANSCRIPTION_MAX_FILE_SIZE } from '../../../utils/ai';
import { ScreenSize, useScreenSizeContext } from '../../../hooks/useScreenSize';

const PLAY_TIME_THROTTLE_OPS = {
  wait: 500,
  immediate: true,
};
const AUDIO_PLAYBACK_RATES = [1, 1.25, 1.5, 2];
const AUDIO_DOWNLOAD_TIMEOUT_MS = 45_000;
const LONG_TRANSCRIPTION_MIN_CHARS = 240;
const COLLAPSED_TRANSCRIPTION_LINES = 6;

type RenderMediaControlProps = {
  after: ReactNode;
  leftControl: ReactNode;
  rightControl: ReactNode;
  children: ReactNode;
};
export type AudioContentProps = {
  mimeType: string;
  url: string;
  info: IAudioInfo;
  encInfo?: EncryptedAttachmentInfo;
  transcriptionId?: string;
  renderMediaControl: (props: RenderMediaControlProps) => ReactNode;
};
export function AudioContent({
  mimeType,
  url,
  info,
  encInfo,
  transcriptionId,
  renderMediaControl,
}: AudioContentProps) {
  const mx = useMatrixClient();
  const screenSize = useScreenSizeContext();
  const useAuthentication = useMediaAuthentication();
  const {
    state: transcriptionState,
    supported,
    mode,
    supportReason,
    transcribe,
  } = useAudioTranscription(transcriptionId ?? url);
  const overDurationLimit =
    mode === 'browser' &&
    typeof info.duration === 'number' &&
    info.duration > MAX_AUDIO_TRANSCRIPTION_DURATION_MS;
  const overAihubmixFileSizeLimit =
    mode === 'aihubmix' &&
    typeof info.size === 'number' &&
    info.size > AIHUBMIX_AUDIO_TRANSCRIPTION_MAX_FILE_SIZE;

  const loadAudioBlob = useCallback(async (): Promise<Blob> => {
    const mediaUrl = mxcUrlToHttp(mx, url, useAuthentication);
    if (!mediaUrl) throw new Error('Invalid media URL');

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), AUDIO_DOWNLOAD_TIMEOUT_MS);

    try {
      return encInfo
        ? await downloadEncryptedMedia(
            mediaUrl,
            (encBuf) => decryptFile(encBuf, mimeType, encInfo),
            { signal: controller.signal }
          )
        : await downloadMedia(mediaUrl, { signal: controller.signal });
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, [mx, url, useAuthentication, mimeType, encInfo]);

  const [srcState, loadSrc] = useAsyncCallback(
    useCallback(async () => {
      const mediaUrl = mxcUrlToHttp(mx, url, useAuthentication);
      if (!mediaUrl) throw new Error('Invalid media URL');

      const fileContent = encInfo
        ? await downloadEncryptedMedia(mediaUrl, (encBuf) => decryptFile(encBuf, mimeType, encInfo))
        : await downloadMedia(mediaUrl);
      return URL.createObjectURL(fileContent);
    }, [mx, url, useAuthentication, mimeType, encInfo])
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [transcriptionExpanded, setTranscriptionExpanded] = useState(false);
  // duration in seconds. (NOTE: info.duration is in milliseconds)
  const infoDuration = info.duration ?? 0;
  const [duration, setDuration] = useState(
    Number.isFinite(infoDuration) && infoDuration > 0 ? infoDuration / 1000 : 0
  );
  const [sliderTime, setSliderTime] = useState<number | null>(null);

  const getAudioRef = useCallback(() => audioRef.current, []);
  const { loading } = useMediaLoading(getAudioRef);
  const { playing, setPlaying } = useMediaPlay(getAudioRef);
  const { playbackRate, setPlaybackRate } = useMediaPlaybackRate(getAudioRef);
  const { seek } = useMediaSeek(getAudioRef);
  const { volume, mute, setMute, setVolume } = useMediaVolume(getAudioRef);
  const handlePlayTimeCallback: PlayTimeCallback = useCallback((d, ct) => {
    // Some browsers briefly report NaN or 0 while a blob is being decoded.
    // Never replace a known duration with that transient value.
    if (Number.isFinite(d) && d > 0) setDuration(d);
    if (Number.isFinite(ct) && ct >= 0) setCurrentTime(ct);
  }, []);
  useMediaPlayTimeCallback(
    getAudioRef,
    useThrottle(handlePlayTimeCallback, PLAY_TIME_THROTTLE_OPS)
  );

  const handlePlay = () => {
    if (srcState.status === AsyncStatus.Success) {
      setPlaying(!playing);
    } else if (srcState.status !== AsyncStatus.Loading) {
      loadSrc();
    }
  };

  const handleCyclePlaybackRate = () => {
    const currentIndex = AUDIO_PLAYBACK_RATES.findIndex(
      (rate) => Math.abs(rate - playbackRate) < 0.001
    );
    const nextRate =
      AUDIO_PLAYBACK_RATES[
        currentIndex >= 0 ? (currentIndex + 1) % AUDIO_PLAYBACK_RATES.length : 0
      ];

    setPlaybackRate(nextRate);
  };

  const playbackRateLabel = `${
    Number.isInteger(playbackRate) ? playbackRate.toFixed(0) : playbackRate
  }x`;
  const transcriptionText =
    transcriptionState.status === AsyncStatus.Success ||
    transcriptionState.status === AsyncStatus.Loading ||
    transcriptionState.status === AsyncStatus.Error
      ? transcriptionState.text
      : undefined;
  const transcriptionError =
    transcriptionState.status === AsyncStatus.Error ? transcriptionState.error : undefined;
  const helperText = !supported
    ? supportReason ?? '\u5f53\u524d\u6d4f\u89c8\u5668\u6682\u4e0d\u652f\u6301\u8f6c\u5199'
    : overAihubmixFileSizeLimit
    ? 'AIHubMix \u97f3\u9891\u8f6c\u5199\u76ee\u524d\u6700\u5927\u652f\u6301 25MB'
    : overDurationLimit
    ? '\u5f53\u524d\u7248\u672c\u6700\u957f\u652f\u6301 5 \u5206\u949f'
    : undefined;
  const shouldShowTranscriptionText =
    !!transcriptionText &&
    (transcriptionState.status !== AsyncStatus.Loading || mode === 'browser');
  const hasLongTranscription =
    !!transcriptionText &&
    (transcriptionText.length > LONG_TRANSCRIPTION_MIN_CHARS ||
      transcriptionText.split(/\r?\n/).length > COLLAPSED_TRANSCRIPTION_LINES);
  const transcriptionActionLabel =
    transcriptionState.status === AsyncStatus.Loading
      ? '\u8f6c\u5199\u4e2d'
      : transcriptionState.status === AsyncStatus.Success
      ? '\u91cd\u65b0\u8f6c\u5199'
      : transcriptionState.status === AsyncStatus.Error
      ? '\u91cd\u8bd5\u8f6c\u5199'
      : '\u8f6c\u5199';
  const renderedCurrentTime = Number.isFinite(currentTime) ? Math.max(0, currentTime) : 0;
  const seekMax = Math.max(duration, 1);
  const progressTime = duration > 0 ? Math.min(sliderTime ?? renderedCurrentTime, duration) : 0;

  const handleTranscribe = () => {
    setTranscriptionExpanded(false);
    transcribe({
      getBlob: loadAudioBlob,
    }).catch(() => undefined);
  };

  return renderMediaControl({
    after: (
      <Box direction="Column" gap="200">
        <Range
          step={0.01}
          min={0}
          max={seekMax}
          values={[progressTime]}
          onChange={(values) => {
            const nextTime = values[0];
            if (Number.isFinite(nextTime)) {
              setSliderTime(nextTime);
              seek(nextTime);
            }
          }}
          onFinalChange={(values) => {
            const nextTime = values[0];
            if (Number.isFinite(nextTime)) seek(nextTime);
            setSliderTime(null);
          }}
          renderTrack={(params) => (
            <div
              {...params.props}
              style={{
                ...params.props.style,
                position: 'relative',
                touchAction: 'none',
              }}
            >
              {params.children}
              <ProgressBar
                as="div"
                variant="Secondary"
                size="300"
                min={0}
                max={seekMax}
                value={progressTime}
                radii="300"
                style={{ pointerEvents: 'none' }}
              />
            </div>
          )}
          renderThumb={(params) => (
            <Badge
              size="300"
              variant="Secondary"
              fill="Solid"
              radii="Pill"
              outlined
              {...params.props}
              style={{
                ...params.props.style,
                zIndex: 2,
                touchAction: 'none',
              }}
            />
          )}
        />

        <Box direction="Column" gap="100">
          <Box alignItems="Center" gap="200" wrap="Wrap">
            <Chip
              variant="SurfaceVariant"
              radii="300"
              onClick={handleTranscribe}
              disabled={
                !supported ||
                overDurationLimit ||
                overAihubmixFileSizeLimit ||
                transcriptionState.status === AsyncStatus.Loading
              }
              before={
                transcriptionState.status === AsyncStatus.Loading ? (
                  <Spinner variant="Secondary" size="50" />
                ) : (
                  <Icon src={Icons.Alphabet} size="50" />
                )
              }
            >
              <Text size="B300">{transcriptionActionLabel}</Text>
            </Chip>
            {helperText && (
              <Text
                size="T200"
                priority="300"
                style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}
              >
                {helperText}
              </Text>
            )}
          </Box>

          {(transcriptionState.status !== AsyncStatus.Idle || shouldShowTranscriptionText) && (
            <Box direction="Column" gap="100">
              {shouldShowTranscriptionText && (
                <>
                  <Text
                    size="T300"
                    style={{
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      ...(!transcriptionExpanded && hasLongTranscription
                        ? {
                            display: '-webkit-box',
                            WebkitBoxOrient: 'vertical',
                            WebkitLineClamp: COLLAPSED_TRANSCRIPTION_LINES,
                            overflow: 'hidden',
                          }
                        : undefined),
                    }}
                  >
                    {transcriptionText}
                  </Text>
                  {hasLongTranscription && (
                    <Box justifyContent="End">
                      <Chip
                        variant="SurfaceVariant"
                        radii="300"
                        onClick={() => setTranscriptionExpanded((expanded) => !expanded)}
                        before={
                          <Icon
                            src={transcriptionExpanded ? Icons.ChevronTop : Icons.ChevronBottom}
                            size="50"
                          />
                        }
                      >
                        <Text size="B300">{transcriptionExpanded ? '收起' : '展开全文'}</Text>
                      </Chip>
                    </Box>
                  )}
                </>
              )}
              {transcriptionError && (
                <Text size="T200" style={{ color: color.Critical.Main }}>
                  {transcriptionError}
                </Text>
              )}
            </Box>
          )}
        </Box>
      </Box>
    ),
    leftControl: (
      <>
        <Chip
          onClick={handlePlay}
          variant="Secondary"
          radii="300"
          disabled={srcState.status === AsyncStatus.Loading}
          before={
            srcState.status === AsyncStatus.Loading || loading ? (
              <Spinner variant="Secondary" size="50" />
            ) : (
              <Icon src={playing ? Icons.Pause : Icons.Play} size="50" filled={playing} />
            )
          }
        >
          <Text size="B300">{playing ? '\u6682\u505c' : '\u64ad\u653e'}</Text>
        </Chip>
        <Text size="T200">{`${secondsToMinutesAndSeconds(
          Math.min(renderedCurrentTime, duration || renderedCurrentTime)
        )} / ${duration > 0 ? secondsToMinutesAndSeconds(duration) : '--:--'}`}</Text>
      </>
    ),
    rightControl: (
      <>
        <Chip variant="SurfaceVariant" radii="300" onClick={handleCyclePlaybackRate}>
          <Text size="B300">{playbackRateLabel}</Text>
        </Chip>
        <IconButton
          variant="SurfaceVariant"
          size="300"
          radii="Pill"
          onClick={() => setMute(!mute)}
          aria-pressed={mute}
        >
          <Icon src={mute ? Icons.VolumeMute : Icons.VolumeHigh} size="50" />
        </IconButton>
        {screenSize !== ScreenSize.Mobile && (
          <Range
            step={0.1}
            min={0}
            max={1}
            values={[volume]}
            onChange={(values) => setVolume(values[0])}
            renderTrack={(params) => (
              <div {...params.props}>
                {params.children}
                <ProgressBar
                  style={{ width: toRem(48) }}
                  variant="Secondary"
                  size="300"
                  min={0}
                  max={1}
                  value={volume}
                  radii="300"
                />
              </div>
            )}
            renderThumb={(params) => (
              <Badge
                size="300"
                variant="Secondary"
                fill="Solid"
                radii="Pill"
                outlined
                {...params.props}
                style={{
                  ...params.props.style,
                  zIndex: 0,
                }}
              />
            )}
          />
        )}
      </>
    ),
    children: (
      <audio controls={false} autoPlay ref={audioRef}>
        {srcState.status === AsyncStatus.Success && <source src={srcState.data} type={mimeType} />}
      </audio>
    ),
  });
}
