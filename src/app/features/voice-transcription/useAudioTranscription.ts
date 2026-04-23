import { useCallback, useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import { AsyncStatus } from '../../hooks/useAsyncCallback';
import { AISettings, aiSettingsAtom } from '../../state/ai';
import { useClientConfig } from '../../hooks/useClientConfig';
import { ua } from '../../utils/user-agent';
import {
  AIHUBMIX_AUDIO_TRANSCRIPTION_MODEL,
  getAihubmixAudioTranscriptionApiKey,
  transcribeAudioWithAihubmix,
} from '../../utils/ai';

type AudioTranscriptionIdle = {
  status: AsyncStatus.Idle;
};

type AudioTranscriptionLoading = {
  status: AsyncStatus.Loading;
  text?: string;
  detail?: string;
};

type AudioTranscriptionSuccess = {
  status: AsyncStatus.Success;
  text: string;
  detail?: string;
};

type AudioTranscriptionError = {
  status: AsyncStatus.Error;
  error: string;
  text?: string;
  detail?: string;
};

export type AudioTranscriptionState =
  | AudioTranscriptionIdle
  | AudioTranscriptionLoading
  | AudioTranscriptionSuccess
  | AudioTranscriptionError;

type TranscribeAudioOptions = {
  getBlob: () => Promise<Blob>;
  lang?: string;
};

type SpeechRecognitionFailure = Error & {
  code?: SpeechRecognitionErrorCode;
};

type AudioTranscriptionSupport = {
  supported: boolean;
  mode: 'aihubmix' | 'browser' | 'none';
  reason?: string;
};

const DEFAULT_LANG = 'zh-CN';
export const MAX_AUDIO_TRANSCRIPTION_DURATION_MS = 5 * 60 * 1000;
const MAX_AUDIO_TRANSCRIPTION_DURATION_SEC = MAX_AUDIO_TRANSCRIPTION_DURATION_MS / 1000;
const AUDIO_TRANSCRIPTION_SEGMENT_DURATION_SEC = 20;
const AUDIO_TRANSCRIPTION_SEGMENT_COOLDOWN_MS = 150;
const MAX_RECOGNITION_RESTARTS_PER_SEGMENT = 2;

const IDLE_STATE: AudioTranscriptionState = {
  status: AsyncStatus.Idle,
};

const transcriptionStateById = new Map<string, AudioTranscriptionState>();
const pendingTranscriptions = new Map<string, Promise<string>>();
const listeners = new Set<() => void>();

const emitChange = () => {
  listeners.forEach((listener) => listener());
};

const getAudioTranscriptionState = (id: string): AudioTranscriptionState =>
  transcriptionStateById.get(id) ?? IDLE_STATE;

const setAudioTranscriptionState = (id: string, state: AudioTranscriptionState) => {
  transcriptionStateById.set(id, state);
  emitChange();
};

const combineTranscript = (leftText = '', rightText = ''): string =>
  `${leftText} ${rightText}`.replace(/\s+/g, ' ').trim();

const wait = (durationMs: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });

const getSpeechRecognitionConstructor = (): SpeechRecognitionConstructor | undefined => {
  if (typeof window === 'undefined') return undefined;

  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
};

const getAudioTranscriptionSupport = (
  aiSettings: AISettings,
  defaultAihubmixApiKey?: string
): AudioTranscriptionSupport => {
  if (getAihubmixAudioTranscriptionApiKey(aiSettings, defaultAihubmixApiKey)) {
    return {
      supported: true,
      mode: 'aihubmix',
      reason: `AIHubMix \u4e91\u7aef\u8f6c\u5199\uff08${AIHUBMIX_AUDIO_TRANSCRIPTION_MODEL}\uff09`,
    };
  }

  if (typeof window === 'undefined') {
    return {
      supported: false,
      mode: 'none',
      reason: '\u5f53\u524d\u73af\u5883\u6682\u4e0d\u652f\u6301\u8bed\u97f3\u8f6c\u5199\u3002',
    };
  }

  const browserName = ua().browser.name ?? '';
  if (browserName !== 'Chrome') {
    return {
      supported: false,
      mode: 'none',
      reason:
        '\u8bf7\u5148\u5728 AI \u52a9\u624b\u8bbe\u7f6e\u4e2d\u914d\u7f6e AIHubMix\uff0c\u6216\u6539\u7528 Google Chrome \u7684\u6d4f\u89c8\u5668\u539f\u751f\u8f6c\u5199\u3002',
    };
  }

  if (typeof window.AudioContext === 'undefined' || !getSpeechRecognitionConstructor()) {
    return {
      supported: false,
      mode: 'none',
      reason: '\u5f53\u524d Chrome \u73af\u5883\u7f3a\u5c11\u5fc5\u8981\u7684\u8bed\u97f3\u80fd\u529b\u3002',
    };
  }

  return {
    supported: true,
    mode: 'browser',
    reason: '\u6d4f\u89c8\u5668\u539f\u751f\u666e\u901a\u8bdd\u8f6c\u5199\uff08\u6700\u957f 5 \u5206\u949f\uff09',
  };
};

const getSpeechRecognitionErrorMessage = (error?: SpeechRecognitionErrorCode): string => {
  if (error === 'language-not-supported') {
    return '\u5f53\u524d\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u666e\u901a\u8bdd\u8f6c\u5199\u3002';
  }

  if (error === 'network') {
    return '\u6d4f\u89c8\u5668\u8bed\u97f3\u8bc6\u522b\u670d\u52a1\u8fde\u63a5\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002';
  }

  if (error === 'service-not-allowed' || error === 'not-allowed') {
    return '\u5f53\u524d\u6d4f\u89c8\u5668\u7981\u6b62\u4e86\u8bed\u97f3\u8bc6\u522b\u670d\u52a1\u3002';
  }

  if (error === 'audio-capture') {
    return '\u5f53\u524d\u6d4f\u89c8\u5668\u65e0\u6cd5\u8bfb\u53d6\u97f3\u9891\u8f68\u9053\u3002';
  }

  if (error === 'no-speech') {
    return '\u6ca1\u6709\u8bc6\u522b\u5230\u53ef\u8f6c\u5199\u7684\u8bed\u97f3\u5185\u5bb9\u3002';
  }

  if (error === 'aborted') {
    return '\u8bed\u97f3\u8f6c\u5199\u5df2\u4e2d\u65ad\u3002';
  }

  return '\u5f53\u524d\u6d4f\u89c8\u5668\u6682\u4e0d\u652f\u6301\u5386\u53f2\u8bed\u97f3\u8f6c\u5199\u3002';
};

const createSpeechRecognitionError = (
  code?: SpeechRecognitionErrorCode,
  fallbackMessage?: string
): SpeechRecognitionFailure => {
  const error = new Error(
    fallbackMessage ?? getSpeechRecognitionErrorMessage(code)
  ) as SpeechRecognitionFailure;

  error.code = code;
  return error;
};

const getTranscriptionLoadingDetail = (currentSegment: number, totalSegments: number): string =>
  `\u6b63\u5728\u8bc6\u522b\u7b2c ${currentSegment}/${totalSegments} \u6bb5...`;

const getTranscriptionSuccessDetail = (totalSegments: number): string =>
  `\u5df2\u5b8c\u6210\uff0c\u5171 ${totalSegments} \u6bb5`;

const decodeAudioBlob = async (blob: Blob, audioContext: AudioContext): Promise<AudioBuffer> => {
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  return audioContext.decodeAudioData((await blob.arrayBuffer()).slice(0));
};

const createAudioBufferSegment = (
  audioContext: AudioContext,
  audioBuffer: AudioBuffer,
  startSecond: number,
  endSecond: number
): AudioBuffer => {
  const startFrame = Math.max(0, Math.floor(startSecond * audioBuffer.sampleRate));
  const endFrame = Math.min(audioBuffer.length, Math.ceil(endSecond * audioBuffer.sampleRate));
  const frameLength = Math.max(1, endFrame - startFrame);

  const segmentBuffer = audioContext.createBuffer(
    audioBuffer.numberOfChannels,
    frameLength,
    audioBuffer.sampleRate
  );

  for (let channelIndex = 0; channelIndex < audioBuffer.numberOfChannels; channelIndex += 1) {
    const sourceChannelData = audioBuffer.getChannelData(channelIndex);
    const targetChannelData = segmentBuffer.getChannelData(channelIndex);
    targetChannelData.set(sourceChannelData.subarray(startFrame, endFrame));
  }

  return segmentBuffer;
};

const cleanupSegmentNodes = async (
  destination: MediaStreamAudioDestinationNode,
  source: AudioBufferSourceNode,
  sourceStarted: boolean,
  sourceEnded: boolean
) => {
  try {
    source.onended = null;
    source.disconnect();
  } catch {
    // ignore source cleanup failures
  }

  try {
    if (sourceStarted && !sourceEnded) {
      source.stop(0);
    }
  } catch {
    // ignore source stop failures during cleanup
  }

  destination.stream.getTracks().forEach((track) => track.stop());

  try {
    destination.disconnect();
  } catch {
    // ignore destination cleanup failures
  }
};

const transcribeAudioSegment = async (
  audioContext: AudioContext,
  audioBufferSegment: AudioBuffer,
  lang: string,
  onProgress: (text: string) => void
): Promise<string> => {
  const SpeechRecognitionCtor = getSpeechRecognitionConstructor();
  if (!SpeechRecognitionCtor) {
    throw createSpeechRecognitionError(
      undefined,
      '\u5f53\u524d\u6d4f\u89c8\u5668\u6682\u4e0d\u652f\u6301\u5386\u53f2\u8bed\u97f3\u8f6c\u5199\u3002'
    );
  }

  const destination = audioContext.createMediaStreamDestination();
  const source = audioContext.createBufferSource();
  source.buffer = audioBufferSegment;
  source.connect(destination);

  const audioTrack = destination.stream.getAudioTracks()[0];
  if (!audioTrack) {
    await cleanupSegmentNodes(destination, source, false, false);
    throw createSpeechRecognitionError('audio-capture');
  }

  return new Promise<string>((resolve, reject) => {
    const recognition = new SpeechRecognitionCtor();
    let settled = false;
    let sourceStarted = false;
    let sourceEnded = false;
    let finishedBySource = false;
    let restartCount = 0;
    let settledText = '';
    let sessionConfirmedText = '';
    let sessionPendingText = '';
    let lastError: SpeechRecognitionFailure | undefined;
    let fatalError = false;

    const getVisibleText = () =>
      combineTranscript(
        settledText,
        combineTranscript(sessionConfirmedText, sessionPendingText)
      );

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;

      try {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.onnomatch = null;
        recognition.abort();
      } catch {
        // ignore event cleanup failures
      }

      cleanupSegmentNodes(destination, source, sourceStarted, sourceEnded)
        .catch(() => undefined)
        .finally(callback);
    };

    const resolveWithTranscript = () => {
      const text = getVisibleText();
      if (!text) {
        reject(
          lastError ??
            createSpeechRecognitionError(
              'no-speech',
              '\u6ca1\u6709\u8bc6\u522b\u5230\u53ef\u8f6c\u5199\u7684\u8bed\u97f3\u5185\u5bb9\u3002'
            )
        );
        return;
      }

      resolve(text);
    };

    const startRecognition = () => {
      recognition.start(audioTrack);
    };

    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let nextConfirmedText = '';
      let nextPendingText = '';

      for (let index = 0; index < event.results.length; index += 1) {
        const transcript = event.results[index][0]?.transcript?.trim() ?? '';
        if (!transcript) continue;

        if (event.results[index].isFinal) {
          nextConfirmedText = combineTranscript(nextConfirmedText, transcript);
        } else {
          nextPendingText = combineTranscript(nextPendingText, transcript);
        }
      }

      sessionConfirmedText = nextConfirmedText;
      sessionPendingText = nextPendingText;
      onProgress(getVisibleText());
    };

    recognition.onnomatch = () => {
      lastError = createSpeechRecognitionError('no-speech');
    };

    recognition.onerror = (event) => {
      if (event.error === 'aborted' && finishedBySource) {
        return;
      }

      lastError = createSpeechRecognitionError(event.error);
      fatalError =
        event.error === 'audio-capture' ||
        event.error === 'language-not-supported' ||
        event.error === 'network' ||
        event.error === 'not-allowed' ||
        event.error === 'service-not-allowed';
    };

    recognition.onend = () => {
      if (settled) return;

      settledText = combineTranscript(settledText, sessionConfirmedText);
      sessionConfirmedText = '';
      sessionPendingText = '';

      if (!finishedBySource && !fatalError && restartCount < MAX_RECOGNITION_RESTARTS_PER_SEGMENT) {
        restartCount += 1;

        try {
          startRecognition();
          return;
        } catch (error) {
          fatalError = true;
          lastError =
            error instanceof Error
              ? (error as SpeechRecognitionFailure)
              : createSpeechRecognitionError();
        }
      }

      finish(() => {
        if (finishedBySource || getVisibleText()) {
          resolveWithTranscript();
          return;
        }

        reject(
          lastError ??
            createSpeechRecognitionError(
              undefined,
              '\u5f53\u524d\u6d4f\u89c8\u5668\u6682\u4e0d\u652f\u6301\u5386\u53f2\u8bed\u97f3\u8f6c\u5199\u3002'
            )
        );
      });
    };

    source.onended = () => {
      sourceEnded = true;
      finishedBySource = true;

      try {
        recognition.stop();
      } catch {
        finish(() => {
          resolveWithTranscript();
        });
      }
    };

    try {
      startRecognition();
      source.start(0);
      sourceStarted = true;
    } catch (error) {
      finish(() => {
        reject(
          error instanceof Error
            ? (error as SpeechRecognitionFailure)
            : createSpeechRecognitionError(
                undefined,
                '\u5f53\u524d\u6d4f\u89c8\u5668\u6682\u4e0d\u652f\u6301\u5386\u53f2\u8bed\u97f3\u8f6c\u5199\u3002'
              )
        );
      });
    }
  });
};

const transcribeAudioBlob = async (
  blob: Blob,
  lang: string,
  onProgress: (text: string, detail: string) => void,
  audioContext: AudioContext
): Promise<{ text: string; totalSegments: number }> => {
  const decodedAudio = await decodeAudioBlob(blob, audioContext);

  if (!Number.isFinite(decodedAudio.duration) || decodedAudio.duration <= 0) {
    throw new Error('\u65e0\u6cd5\u89e3\u6790\u8fd9\u6761\u8bed\u97f3\u3002');
  }

  if (decodedAudio.duration > MAX_AUDIO_TRANSCRIPTION_DURATION_SEC) {
    throw new Error(
      '\u5f53\u524d\u7248\u672c\u6700\u957f\u53ea\u652f\u6301 5 \u5206\u949f\u5185\u7684\u8bed\u97f3\u8f6c\u5199\u3002'
    );
  }

  const totalSegments = Math.max(
    1,
    Math.ceil(decodedAudio.duration / AUDIO_TRANSCRIPTION_SEGMENT_DURATION_SEC)
  );

  let transcriptText = '';

  for (let segmentIndex = 0; segmentIndex < totalSegments; segmentIndex += 1) {
    const startSecond = segmentIndex * AUDIO_TRANSCRIPTION_SEGMENT_DURATION_SEC;
    const endSecond = Math.min(
      decodedAudio.duration,
      startSecond + AUDIO_TRANSCRIPTION_SEGMENT_DURATION_SEC
    );

    const segmentBuffer = createAudioBufferSegment(
      audioContext,
      decodedAudio,
      startSecond,
      endSecond
    );
    const detail = getTranscriptionLoadingDetail(segmentIndex + 1, totalSegments);

    onProgress(transcriptText, detail);

    try {
      const segmentText = await transcribeAudioSegment(
        audioContext,
        segmentBuffer,
        lang,
        (partialSegmentText) => {
          onProgress(combineTranscript(transcriptText, partialSegmentText), detail);
        }
      );

      transcriptText = combineTranscript(transcriptText, segmentText);
      onProgress(transcriptText, detail);
    } catch (error) {
      const speechError = error as SpeechRecognitionFailure;

      if (speechError.code === 'no-speech') {
        continue;
      }

      throw error;
    }

    if (segmentIndex + 1 < totalSegments) {
      await wait(AUDIO_TRANSCRIPTION_SEGMENT_COOLDOWN_MS);
    }
  }

  if (!transcriptText) {
    throw createSpeechRecognitionError(
      'no-speech',
      '\u6ca1\u6709\u8bc6\u522b\u5230\u53ef\u8f6c\u5199\u7684\u8bed\u97f3\u5185\u5bb9\u3002'
    );
  }

  return {
    text: transcriptText,
    totalSegments,
  };
};

export const canTranscribeAudioInBrowser = (): boolean => {
  return getAudioTranscriptionSupport({
    provider: 'aihubmix',
    apiKey: '',
    baseUrl: '',
    modelsApiUrl: '',
    models: [],
    skills: [],
  }).supported;
};

export const useAudioTranscription = (id: string | undefined) => {
  const aiSettings = useAtomValue(aiSettingsAtom);
  const clientConfig = useClientConfig();
  const defaultAihubmixApiKey = clientConfig.audioTranscription?.defaultAihubmixApiKey;
  const support = getAudioTranscriptionSupport(aiSettings, defaultAihubmixApiKey);
  const [state, setState] = useState<AudioTranscriptionState>(() =>
    id ? getAudioTranscriptionState(id) : IDLE_STATE
  );

  useEffect(() => {
    if (!id) {
      setState(IDLE_STATE);
      return undefined;
    }

    const handleChange = () => {
      setState(getAudioTranscriptionState(id));
    };

    handleChange();
    listeners.add(handleChange);

    return () => {
      listeners.delete(handleChange);
    };
  }, [id]);

  const transcribe = useCallback(
    async ({ getBlob, lang = DEFAULT_LANG }: TranscribeAudioOptions): Promise<string> => {
      if (!id) throw new Error('Missing transcription id.');
      if (!support.supported) {
        throw new Error(
          support.reason ??
            '\u5f53\u524d\u6d4f\u89c8\u5668\u6682\u4e0d\u652f\u6301\u5386\u53f2\u8bed\u97f3\u8f6c\u5199\u3002'
        );
      }

      const pending = pendingTranscriptions.get(id);
      if (pending) return pending;

      const previousState = getAudioTranscriptionState(id);
      const previousText =
        previousState.status === AsyncStatus.Success ||
        previousState.status === AsyncStatus.Loading ||
        previousState.status === AsyncStatus.Error
          ? previousState.text
          : undefined;

      if (support.mode === 'aihubmix') {
        setAudioTranscriptionState(id, {
          status: AsyncStatus.Loading,
          text: previousText,
        });

        const promise = getBlob()
          .then((blob) =>
            transcribeAudioWithAihubmix(aiSettings, blob, {
              apiKey: defaultAihubmixApiKey,
              model: AIHUBMIX_AUDIO_TRANSCRIPTION_MODEL,
              language: 'zh',
              temperature: 0.2,
              filename: 'voice-message.webm',
            })
          )
          .then((text) => {
            setAudioTranscriptionState(id, {
              status: AsyncStatus.Success,
              text,
            });

            return text;
          })
          .catch((error) => {
            const nextState = getAudioTranscriptionState(id);
            const nextText =
              nextState.status === AsyncStatus.Success ||
              nextState.status === AsyncStatus.Loading ||
              nextState.status === AsyncStatus.Error
                ? nextState.text
                : previousText;
            const nextDetail =
              nextState.status === AsyncStatus.Loading ||
              nextState.status === AsyncStatus.Success ||
              nextState.status === AsyncStatus.Error
                ? nextState.detail
                : undefined;

            setAudioTranscriptionState(id, {
              status: AsyncStatus.Error,
              error:
                error instanceof Error
                  ? error.message
                  : '\u8bed\u97f3\u8f6c\u5199\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002',
              text: nextText,
              detail: nextDetail,
            });

            throw error;
          })
          .finally(() => {
            pendingTranscriptions.delete(id);
          });

        pendingTranscriptions.set(id, promise);
        return promise;
      }

      setAudioTranscriptionState(id, {
        status: AsyncStatus.Loading,
        text: previousText,
        detail: '\u6b63\u5728\u89e3\u6790\u8bed\u97f3...',
      });

      const promise = (async () => {
        if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') {
          throw new Error(
            '\u5f53\u524d\u6d4f\u89c8\u5668\u6682\u4e0d\u652f\u6301\u5386\u53f2\u8bed\u97f3\u8f6c\u5199\u3002'
          );
        }

        const audioContext = new window.AudioContext();

        try {
          if (audioContext.state === 'suspended') {
            await audioContext.resume().catch(() => undefined);
          }

          const blob = await getBlob();
          return await transcribeAudioBlob(
            blob,
            lang,
            (text, detail) => {
              setAudioTranscriptionState(id, {
                status: AsyncStatus.Loading,
                text,
                detail,
              });
            },
            audioContext
          );
        } finally {
          await audioContext.close().catch(() => undefined);
        }
      })()
        .then(({ text, totalSegments }) => {
          setAudioTranscriptionState(id, {
            status: AsyncStatus.Success,
            text,
            detail: getTranscriptionSuccessDetail(totalSegments),
          });

          return text;
        })
        .catch((error) => {
          const nextState = getAudioTranscriptionState(id);
          const nextText =
            nextState.status === AsyncStatus.Success ||
            nextState.status === AsyncStatus.Loading ||
            nextState.status === AsyncStatus.Error
              ? nextState.text
              : previousText;
          const nextDetail =
            nextState.status === AsyncStatus.Loading ||
            nextState.status === AsyncStatus.Success ||
            nextState.status === AsyncStatus.Error
              ? nextState.detail
              : undefined;

          setAudioTranscriptionState(id, {
            status: AsyncStatus.Error,
            error:
              error instanceof Error
                ? error.message
                : '\u8bed\u97f3\u8f6c\u5199\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002',
            text: nextText,
            detail: nextDetail,
          });

          throw error;
        })
        .finally(() => {
          pendingTranscriptions.delete(id);
        });

      pendingTranscriptions.set(id, promise);
      return promise;
    },
    [aiSettings, defaultAihubmixApiKey, id, support.mode, support.reason, support.supported]
  );

  return {
    state,
    supported: support.supported,
    mode: support.mode,
    supportReason: support.reason,
    transcribe,
  };
};
