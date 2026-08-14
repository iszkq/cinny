import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Icon, IconButton, Icons, Spinner, Text } from 'folds';
import {
  consumeNativeOfficeBinary,
  emitNativeOfficeAction,
  emitNativeOfficeReady,
  getNativeOfficeRequestId,
  getNativeOfficeSessionId,
  listenNativeOfficeCommand,
  listenNativeOfficePayload,
  NativeOfficeBridgeMessage,
  NativeOfficeWindowAction,
  NativeOfficeWindowPayload,
  writeNativeOfficeBinary,
} from '../../utils/nativeOfficeWindow';
import * as css from './OfficeFileEditor.css';
import { PasswordInput } from '../password-input';

const OFFICE_BRIDGE_READY = 'xinghuo-office-ready';
const OFFICE_BRIDGE_OPEN = 'xinghuo-office-open';
const OFFICE_BRIDGE_SAVED = 'xinghuo-office-saved';

type OfficeFrameMessage = NativeOfficeBridgeMessage & {
  buffer?: ArrayBuffer;
};

type NativeOfficeWindowActionInput = NativeOfficeWindowAction extends infer Action
  ? Action extends NativeOfficeWindowAction
    ? Omit<Action, 'sessionId' | 'requestId'>
    : never
  : never;

const getPhaseLabel = (payload: NativeOfficeWindowPayload): string => {
  const { phase, mode } = payload;
  if (phase === 'loading') return '正在准备文档…';
  if (phase === 'saving') return '正在生成最新文件…';
  if (phase === 'uploading') return '正在更新原文件…';
  if (phase === 'publishing') return '正在发布文件更新…';
  if (phase === 'saved') return '最新文件已发布';
  if (phase === 'error') return '操作失败，请重试';
  return mode === 'preview' ? '只读预览' : '编辑就绪';
};

const isSaveShortcut = (event: KeyboardEvent): boolean =>
  (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's';

const isInteractiveDragTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest('button, a, input, textarea, select, [role="button"], [contenteditable="true"]')
  );
};

const emitAction = (action: NativeOfficeWindowAction): void => {
  emitNativeOfficeAction(action).catch(() => undefined);
};

const closeCurrentWindow = async (): Promise<void> => {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const currentWindow = getCurrentWindow();
  await currentWindow.destroy().catch(async () => {
    await currentWindow.close().catch(() => window.close());
  });
};

export function NativeOfficeWindow() {
  const sessionId = getNativeOfficeSessionId();
  const requestId = getNativeOfficeRequestId();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const payloadRef = useRef<NativeOfficeWindowPayload>();
  const iframeReadyRef = useRef(false);
  const sourceBufferRef = useRef<ArrayBuffer>();
  const consumedSourceTokensRef = useRef(new Set<string>());
  const closeAllowedRef = useRef(false);
  const detachedRef = useRef(false);
  const [payload, setPayload] = useState<NativeOfficeWindowPayload>();
  const [maximized, setMaximized] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');

  const emitSessionAction = useCallback(
    (action: NativeOfficeWindowActionInput) => {
      const currentPayload = payloadRef.current;
      if (!sessionId || !currentPayload || currentPayload.sessionId !== sessionId) return;
      emitAction({
        ...action,
        sessionId,
        requestId: currentPayload.requestId,
      } as NativeOfficeWindowAction);
    },
    [sessionId]
  );

  const postToOffice = useCallback((message: { type: string; saveId?: string }) => {
    const currentPayload = payloadRef.current;
    const targetWindow = iframeRef.current?.contentWindow;
    if (!currentPayload || !targetWindow) return;
    targetWindow.postMessage(
      { ...message, requestId: currentPayload.requestId },
      new URL(currentPayload.src).origin
    );
  }, []);

  const transferSourceIfReady = useCallback(() => {
    const currentPayload = payloadRef.current;
    const targetWindow = iframeRef.current?.contentWindow;
    const buffer = sourceBufferRef.current;
    if (!currentPayload || !targetWindow || !iframeReadyRef.current || !buffer) return;

    targetWindow.postMessage(
      {
        type: OFFICE_BRIDGE_OPEN,
        requestId: currentPayload.requestId,
        fileName: currentPayload.body,
        fileType: currentPayload.body.split('.').pop()?.toLowerCase() ?? '',
        mimeType: currentPayload.mimeType,
        ...(currentPayload.password ? { password: currentPayload.password } : {}),
        buffer,
      },
      new URL(currentPayload.src).origin,
      [buffer]
    );
    sourceBufferRef.current = undefined;
    emitSessionAction({ type: 'source-consumed' });
  }, [emitSessionAction]);

  useEffect(() => {
    if (!sessionId || !requestId) return undefined;

    let disposed = false;
    let unlistenPayload: (() => void) | undefined;
    let unlistenCommand: (() => void) | undefined;

    Promise.all([
      listenNativeOfficePayload(sessionId, requestId, (nextPayload) => {
        if (disposed || nextPayload.requestId !== requestId) return;
        payloadRef.current = nextPayload;
        setPayload(nextPayload);
      }),
      listenNativeOfficeCommand(sessionId, requestId, (command) => {
        if (disposed) return;
        if (command.type === 'detached') {
          detachedRef.current = true;
          return;
        }
        if (command.type === 'close') {
          closeAllowedRef.current = true;
          closeCurrentWindow().catch(() => undefined);
          return;
        }
        postToOffice(command.message);
      }),
    ])
      .then(([nextUnlistenPayload, nextUnlistenCommand]) => {
        if (disposed) {
          nextUnlistenPayload();
          nextUnlistenCommand();
          return;
        }
        unlistenPayload = nextUnlistenPayload;
        unlistenCommand = nextUnlistenCommand;
        emitNativeOfficeReady(sessionId, requestId).catch(() => undefined);
      })
      .catch(() => {
        emitAction({
          type: 'native-error',
          sessionId,
          requestId,
          message: 'Office 独立窗口通信初始化失败。',
        });
      });

    return () => {
      disposed = true;
      unlistenPayload?.();
      unlistenCommand?.();
    };
  }, [postToOffice, requestId, sessionId]);

  const sourceBinaryToken = payload?.sourceBinary?.token;
  const sourceBinaryByteLength = payload?.sourceBinary?.byteLength;

  useEffect(() => {
    if (!sessionId || !sourceBinaryToken || sourceBinaryByteLength === undefined) return undefined;
    if (consumedSourceTokensRef.current.has(sourceBinaryToken)) return undefined;
    consumedSourceTokensRef.current.add(sourceBinaryToken);

    let disposed = false;
    consumeNativeOfficeBinary(sessionId, sourceBinaryToken)
      .then((buffer) => {
        if (disposed) return;
        if (buffer.byteLength !== sourceBinaryByteLength) {
          throw new Error('Office source file size mismatch.');
        }
        sourceBufferRef.current = buffer;
        transferSourceIfReady();
      })
      .catch(() => {
        if (!disposed) {
          emitSessionAction({
            type: 'native-error',
            message: '文档无法传入独立窗口，已返回主窗口打开。',
          });
        }
      });

    return () => {
      disposed = true;
    };
  }, [
    emitSessionAction,
    sessionId,
    sourceBinaryByteLength,
    sourceBinaryToken,
    transferSourceIfReady,
  ]);

  useEffect(() => {
    const handleOfficeMessage = (event: MessageEvent<OfficeFrameMessage>) => {
      const currentPayload = payloadRef.current;
      if (!currentPayload || currentPayload.sessionId !== sessionId) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.origin !== new URL(currentPayload.src).origin) return;
      if (event.data?.requestId !== currentPayload.requestId) return;

      if (event.data.type === OFFICE_BRIDGE_READY) {
        iframeReadyRef.current = true;
        emitSessionAction({
          type: 'bridge',
          message: {
            type: OFFICE_BRIDGE_READY,
            requestId: currentPayload.requestId,
          },
        });
        transferSourceIfReady();
        return;
      }

      if (
        event.data.type === OFFICE_BRIDGE_SAVED &&
        event.data.buffer instanceof ArrayBuffer &&
        event.data.buffer.byteLength > 0
      ) {
        const { buffer, ...message } = event.data;
        writeNativeOfficeBinary(currentPayload.sessionId, buffer)
          .then((binary) => {
            emitSessionAction({ type: 'bridge', message: { ...message, binary } });
          })
          .catch(() => {
            emitSessionAction({
              type: 'bridge',
              message: {
                type: 'xinghuo-office-error',
                requestId: currentPayload.requestId,
                saveId: event.data.saveId,
                message: '保存结果无法传回主窗口。',
              },
            });
          });
        return;
      }

      const message: OfficeFrameMessage = { ...event.data };
      delete message.buffer;
      emitSessionAction({ type: 'bridge', message });
    };

    window.addEventListener('message', handleOfficeMessage);
    return () => window.removeEventListener('message', handleOfficeMessage);
  }, [emitSessionAction, sessionId, transferSourceIfReady]);

  useEffect(() => {
    if (!sessionId || !requestId) return undefined;
    let unlisten: (() => void) | undefined;
    import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) =>
        getCurrentWindow().onCloseRequested((event) => {
          if (closeAllowedRef.current) return;
          // Preview windows can outlive the chat message that opened them.
          // Once detached there is no parent modal left to acknowledge a
          // clean close request, so close the native window directly.
          if (!payloadRef.current?.dirty || detachedRef.current) {
            if (payloadRef.current?.dirty && detachedRef.current) {
              event.preventDefault();
              const nextPayload = { ...payloadRef.current, showClosePrompt: true };
              payloadRef.current = nextPayload;
              setPayload(nextPayload);
              return;
            }
            closeAllowedRef.current = true;
            void closeCurrentWindow();
            return;
          }
          event.preventDefault();
          emitSessionAction({ type: 'close' });
        })
      )
      .then((nextUnlisten) => {
        unlisten = nextUnlisten;
      })
      .catch(() => undefined);
    return () => unlisten?.();
  }, [emitSessionAction, requestId, sessionId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        emitSessionAction({ type: 'close' });
        return;
      }
      if (!isSaveShortcut(event) || payloadRef.current?.mode !== 'edit') return;
      event.preventDefault();
      event.stopPropagation();
      if (payloadRef.current?.dirty) emitSessionAction({ type: 'save' });
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [emitSessionAction]);

  const handleMinimize = () => {
    import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().minimize())
      .catch(() => undefined);
  };

  const handleToggleMaximize = () => {
    import('@tauri-apps/api/window')
      .then(async ({ getCurrentWindow }) => {
        await getCurrentWindow().toggleMaximize();
        setMaximized((current) => !current);
      })
      .catch(() => undefined);
  };

  const handleWindowDragStart: React.PointerEventHandler<HTMLElement> = (event) => {
    if (isInteractiveDragTarget(event.target)) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    window.getSelection()?.removeAllRanges();
    import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().startDragging())
      .catch(() => undefined);
  };

  const handleCloseRequest = () => {
    const currentPayload = payloadRef.current;
    if (!currentPayload?.dirty) {
      closeAllowedRef.current = true;
      void closeCurrentWindow();
      return;
    }
    if (detachedRef.current) {
      const nextPayload = { ...currentPayload, showClosePrompt: true };
      payloadRef.current = nextPayload;
      setPayload(nextPayload);
      return;
    }
    emitSessionAction({ type: 'close' });
  };

  const handleContinueEditing = () => {
    if (!detachedRef.current || !payloadRef.current) {
      emitSessionAction({ type: 'continue-editing' });
      return;
    }
    const nextPayload = { ...payloadRef.current, showClosePrompt: false };
    payloadRef.current = nextPayload;
    setPayload(nextPayload);
  };

  const handleDiscard = () => {
    if (detachedRef.current) {
      closeAllowedRef.current = true;
      void closeCurrentWindow();
      return;
    }
    emitSessionAction({ type: 'discard' });
  };

  const submitPassword = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const password = passwordInput.trim();
    if (!password) return;
    emitSessionAction({ type: 'submit-password', password });
    setPasswordInput('');
  };

  if (!sessionId || !requestId) {
    return (
      <Box className={css.nativeWindowFallback} alignItems="Center" justifyContent="Center">
        <Text>Office window is missing its session id.</Text>
      </Box>
    );
  }

  if (!payload) {
    return (
      <Box
        className={css.nativeWindowFallback}
        alignItems="Center"
        justifyContent="Center"
        direction="Column"
        gap="200"
      >
        <Spinner variant="Secondary" />
        <Text size="T200" priority="300">
          Office 文档正在打开…
        </Text>
      </Box>
    );
  }

  const publishing = payload.phase === 'publishing';
  const busy = payload.phase === 'saving' || payload.phase === 'uploading' || publishing;
  let closeButtonLabel = '关闭 Office 文档';
  if (publishing) closeButtonLabel = '关闭 Office 文档，文件将在后台继续发布';
  else if (busy) closeButtonLabel = '取消保存并关闭 Office 文档';

  return (
    <div className={css.nativeEditorWindow}>
      <header className={css.editorHeader} onPointerDown={handleWindowDragStart}>
        <Box alignItems="Center" gap="200" grow="Yes" style={{ minWidth: 0 }}>
          <div
            className={css.headerIcon}
            style={{ backgroundColor: payload.iconColor }}
            aria-hidden
          >
            {payload.iconLabel}
          </div>
          <Box direction="Column" grow="Yes" style={{ minWidth: 0 }}>
            <Text size="B400" truncate title={payload.body}>
              {payload.body}
            </Text>
            <Text size="O400" priority={payload.phase === 'error' ? '300' : '400'} truncate>
              {getPhaseLabel(payload)}
            </Text>
          </Box>
        </Box>
        <Box alignItems="Center" gap="100" shrink="No">
          {payload.mode === 'edit' && (
            <Button
              variant="Primary"
              fill="Solid"
              size="300"
              radii="300"
              disabled={!payload.dirty || payload.phase !== 'ready' || payload.legacyRetryBlocked}
              onClick={() => emitSessionAction({ type: 'save' })}
              before={busy ? <Spinner size="100" fill="Solid" /> : undefined}
            >
              <Text size="B300">保存</Text>
            </Button>
          )}
          <div className={css.nativeWindowControls}>
            <IconButton
              variant="Surface"
              size="300"
              radii="300"
              onClick={handleMinimize}
              aria-label="最小化 Office 窗口"
              title="最小化"
            >
              <Icon src={Icons.Minus} size="50" />
            </IconButton>
            <IconButton
              variant="Surface"
              size="300"
              radii="300"
              onClick={handleToggleMaximize}
              aria-label={maximized ? '还原 Office 窗口' : '最大化 Office 窗口'}
              title={maximized ? '还原' : '最大化'}
            >
              <span
                className={maximized ? css.nativeWindowRestoreGlyph : css.nativeWindowMaximizeGlyph}
              />
            </IconButton>
            <IconButton
              variant="Surface"
              size="300"
              radii="300"
              onClick={handleCloseRequest}
              aria-label={closeButtonLabel}
              title="关闭"
            >
              <Icon src={Icons.Cross} size="100" />
            </IconButton>
          </div>
        </Box>
      </header>

      <div className={css.editorBody}>
        <iframe
          ref={iframeRef}
          className={css.editorFrame}
          src={payload.src}
          title={`${payload.mode === 'edit' ? '在线编辑' : '在线预览'} ${payload.body}`}
          allow="clipboard-read; clipboard-write"
        />
        {payload.passwordRequired && (
          <div className={css.promptBackdrop}>
            <Box
              as="form"
              className={`${css.promptCard} ${css.nativePromptCard}`}
              onSubmit={submitPassword}
              role="dialog"
              aria-modal="true"
              aria-label="输入 Office 文档密码"
            >
              <Text size="T300">此 Office 文档已加密</Text>
              <Text size="T200" priority="300">
                请输入文档密码后再打开。密码仅用于本次解密，不会保存到设备或上传到聊天服务器。
              </Text>
              {payload.passwordError && (
                <Text size="T200" priority="300">
                  密码不正确或文档无法解密，请确认后重试。
                </Text>
              )}
              <PasswordInput
                size="400"
                variant="Secondary"
                autoFocus
                name="officeDocumentPassword"
                placeholder="请输入文档密码"
                value={passwordInput}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setPasswordInput(event.target.value)
                }
                required
              />
              <Box gap="200" justifyContent="End">
                <Button
                  type="button"
                  variant="Secondary"
                  fill="Soft"
                  size="300"
                  radii="300"
                  onClick={() => emitSessionAction({ type: 'close' })}
                >
                  <Text size="B300">取消</Text>
                </Button>
                <Button type="submit" variant="Primary" fill="Solid" size="300" radii="300">
                  <Text size="B300">解密并打开</Text>
                </Button>
              </Box>
            </Box>
          </div>
        )}
        {payload.phase === 'loading' && !payload.passwordRequired && (
          <div className={css.loadingLayer}>
            <Spinner size="400" />
            <Text size="T300">正在打开 Office 文档…</Text>
          </div>
        )}
        {payload.phase === 'error' && (
          <div className={css.errorLayer} role="alert">
            <Icon src={Icons.Warning} size="300" />
            <Text size="T300" align="Center">
              {payload.errorMessage || '文档打开或保存失败，请检查网络后重试。'}
            </Text>
            <Box gap="200" justifyContent="Center" wrap="Wrap">
              {!payload.dirty && (
                <Button
                  variant="Primary"
                  fill="Solid"
                  size="300"
                  radii="300"
                  onClick={() => emitSessionAction({ type: 'retry-open' })}
                >
                  <Text size="B300">重新打开</Text>
                </Button>
              )}
              {payload.mode === 'edit' && payload.dirty && !payload.legacyRetryBlocked && (
                <Button
                  variant="Primary"
                  fill="Solid"
                  size="300"
                  radii="300"
                  onClick={() => emitSessionAction({ type: 'save' })}
                >
                  <Text size="B300">重试保存</Text>
                </Button>
              )}
              <Button
                variant="Secondary"
                fill="Soft"
                size="300"
                radii="300"
                onClick={() => emitSessionAction({ type: 'discard' })}
              >
                <Text size="B300">关闭</Text>
              </Button>
            </Box>
          </div>
        )}
        {busy && (
          <div
            className={`${css.saveStatus} ${css.nativeSaveStatus}`}
            role="status"
            aria-live="polite"
          >
            <Box alignItems="Center" gap="200" grow="Yes">
              <Spinner size="100" />
              <Text size="T300">{getPhaseLabel(payload)}</Text>
            </Box>
            <Button
              variant={publishing ? 'Secondary' : 'Critical'}
              fill="Soft"
              size="300"
              radii="300"
              onClick={() => emitSessionAction({ type: 'discard' })}
            >
              <Text size="B300">{publishing ? '关闭窗口（继续发布）' : '取消并关闭'}</Text>
            </Button>
          </div>
        )}
        {payload.showClosePrompt && (
          <div className={css.promptBackdrop}>
            <div
              className={`${css.promptCard} ${css.nativePromptCard}`}
              role="alertdialog"
              aria-modal="true"
            >
              <Box direction="Column" gap="100">
                <Text size="H4">保存对文档的修改？</Text>
                <Text size="T300" priority="300">
                  保存后会发布最新文件；不保存则不会产生任何更新。
                </Text>
              </Box>
              <Box gap="100" justifyContent="End" wrap="Wrap">
                <Button
                  variant="Secondary"
                  fill="Soft"
                  size="300"
                  radii="300"
                  onClick={handleContinueEditing}
                >
                  <Text size="B300">继续编辑</Text>
                </Button>
                <Button
                  variant="Critical"
                  fill="Soft"
                  size="300"
                  radii="300"
                  onClick={handleDiscard}
                >
                  <Text size="B300">不保存</Text>
                </Button>
                <Button
                  variant="Primary"
                  fill="Solid"
                  size="300"
                  radii="300"
                  onClick={() => emitSessionAction({ type: 'save-close' })}
                >
                  <Text size="B300">保存并关闭</Text>
                </Button>
              </Box>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
