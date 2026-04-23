import { useCallback, useEffect, useState } from 'react';
import { AsyncStatus } from '../../hooks/useAsyncCallback';

type AudioTranscriptionIdle = {
  status: AsyncStatus.Idle;
};

type AudioTranscriptionLoading = {
  status: AsyncStatus.Loading;
  text?: string;
};

type AudioTranscriptionSuccess = {
  status: AsyncStatus.Success;
  text: string;
};

type AudioTranscriptionError = {
  status: AsyncStatus.Error;
  error: string;
  text?: string;
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

const DEFAULT_LANG = 'zh-CN';

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

const combineTranscript = (confirmedText = '', pendingText = ''): string =>
  `${confirmedText} ${pendingText}`.replace(/\s+/g, ' ').trim();

const getSpeechRecognitionConstructor = (): SpeechRecognitionConstructor | undefined => {
  if (typeof window === 'undefined') return undefined;

  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
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

const transcribeAudioBlob = async (
  blob: Blob,
  lang: string,
  onProgress: (text: string) => void,
  preparedAudioContext?: AudioContext
): Promise<string> => {
  const SpeechRecognitionCtor = getSpeechRecognitionConstructor();
  if (!SpeechRecognitionCtor || typeof window.AudioContext === 'undefined') {
    throw new Error(
      '\u5f53\u524d\u6d4f\u89c8\u5668\u6682\u4e0d\u652f\u6301\u5386\u53f2\u8bed\u97f3\u8f6c\u5199\u3002'
    );
  }

  const audioContext = preparedAudioContext ?? new window.AudioContext();
  const destination = audioContext.createMediaStreamDestination();
  const source = audioContext.createBufferSource();

  let sourceStarted = false;
  let sourceEnded = false;

  const cleanup = async () => {
    try {
      if (sourceStarted && !sourceEnded) source.stop(0);
    } catch {
      // ignore source stop failures during cleanup
    }

    destination.stream.getTracks().forEach((track) => track.stop());
    await audioContext.close().catch(() => undefined);
  };

  try {
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    const audioBuffer = await audioContext.decodeAudioData((await blob.arrayBuffer()).slice(0));
    if (!Number.isFinite(audioBuffer.duration) || audioBuffer.duration <= 0) {
      throw new Error('\u65e0\u6cd5\u89e3\u6790\u8fd9\u6761\u8bed\u97f3\u3002');
    }

    source.buffer = audioBuffer;
    source.connect(destination);
  } catch (error) {
    await cleanup();
    throw error instanceof Error
      ? error
      : new Error('\u65e0\u6cd5\u89e3\u6790\u8fd9\u6761\u8bed\u97f3\u3002');
  }

  const audioTrack = destination.stream.getAudioTracks()[0];
  if (!audioTrack) {
    await cleanup();
    throw new Error('\u5f53\u524d\u6d4f\u89c8\u5668\u65e0\u6cd5\u8bfb\u53d6\u97f3\u9891\u8f68\u9053\u3002');
  }

  return new Promise<string>((resolve, reject) => {
    const recognition = new SpeechRecognitionCtor();
    let settled = false;
    let finishedBySource = false;
    let confirmedText = '';
    let pendingText = '';
    let lastError: string | undefined;

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

      cleanup()
        .catch(() => undefined)
        .finally(callback);
    };

    const resolveWithTranscript = () => {
      const text = combineTranscript(confirmedText, pendingText);
      if (!text) {
        reject(
          new Error(
            lastError ?? '\u6ca1\u6709\u8bc6\u522b\u5230\u53ef\u8f6c\u5199\u7684\u8bed\u97f3\u5185\u5bb9\u3002'
          )
        );
        return;
      }
      resolve(text);
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
          nextConfirmedText += transcript;
        } else {
          nextPendingText += transcript;
        }
      }

      confirmedText = nextConfirmedText;
      pendingText = nextPendingText;
      onProgress(combineTranscript(confirmedText, pendingText));
    };

    recognition.onnomatch = () => {
      lastError = '\u6ca1\u6709\u8bc6\u522b\u5230\u53ef\u8f6c\u5199\u7684\u8bed\u97f3\u5185\u5bb9\u3002';
    };

    recognition.onerror = (event) => {
      const errorMessage = getSpeechRecognitionErrorMessage(event.error);

      if (event.error === 'aborted' && finishedBySource) {
        return;
      }

      lastError = errorMessage;
    };

    recognition.onend = () => {
      finish(() => {
        const text = combineTranscript(confirmedText, pendingText);

        if (finishedBySource || text) {
          resolveWithTranscript();
          return;
        }

        reject(
          new Error(
            lastError ?? '\u5f53\u524d\u6d4f\u89c8\u5668\u6682\u4e0d\u652f\u6301\u5386\u53f2\u8bed\u97f3\u8f6c\u5199\u3002'
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
      recognition.start(audioTrack);
      source.start(0);
      sourceStarted = true;
    } catch (error) {
      finish(() => {
        reject(
          error instanceof Error
            ? error
            : new Error(
                '\u5f53\u524d\u6d4f\u89c8\u5668\u6682\u4e0d\u652f\u6301\u5386\u53f2\u8bed\u97f3\u8f6c\u5199\u3002'
              )
        );
      });
    }
  });
};

export const canTranscribeAudioInBrowser = (): boolean => {
  if (typeof window === 'undefined') return false;

  return typeof window.AudioContext !== 'undefined' && !!getSpeechRecognitionConstructor();
};

export const useAudioTranscription = (id: string | undefined) => {
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

      const pending = pendingTranscriptions.get(id);
      if (pending) return pending;

      const previousState = getAudioTranscriptionState(id);
      const previousText =
        previousState.status === AsyncStatus.Success ||
        previousState.status === AsyncStatus.Loading ||
        previousState.status === AsyncStatus.Error
          ? previousState.text
          : undefined;

      setAudioTranscriptionState(id, {
        status: AsyncStatus.Loading,
        text: previousText,
      });

      const promise = (async () => {
        const preparedAudioContext =
          typeof window !== 'undefined' && typeof window.AudioContext !== 'undefined'
            ? new window.AudioContext()
            : undefined;

        try {
          if (preparedAudioContext?.state === 'suspended') {
            await preparedAudioContext.resume().catch(() => undefined);
          }

          const blob = await getBlob();
          return transcribeAudioBlob(
            blob,
            lang,
            (text) => {
              setAudioTranscriptionState(id, {
                status: AsyncStatus.Loading,
                text,
              });
            },
            preparedAudioContext
          );
        } catch (error) {
          await preparedAudioContext?.close().catch(() => undefined);
          throw error;
        }
      })()
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

          setAudioTranscriptionState(id, {
            status: AsyncStatus.Error,
            error:
              error instanceof Error
                ? error.message
                : '\u8bed\u97f3\u8f6c\u5199\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002',
            text: nextText,
          });

          throw error;
        })
        .finally(() => {
          pendingTranscriptions.delete(id);
        });

      pendingTranscriptions.set(id, promise);
      return promise;
    },
    [id]
  );

  return {
    state,
    supported: canTranscribeAudioInBrowser(),
    transcribe,
  };
};
