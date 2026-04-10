import React, { useCallback, useEffect } from 'react';
import FocusTrap from 'focus-trap-react';
import {
  Dialog,
  Overlay,
  OverlayCenter,
  OverlayBackdrop,
  Header,
  config,
  Box,
  Text,
  IconButton,
  Icon,
  Icons,
  color,
  Button,
  Spinner,
} from 'folds';
import { MatrixError } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { stopPropagation } from '../../utils/keyboard';

type LeaveRoomPromptProps = {
  roomId: string;
  onDone: () => void;
  onCancel: () => void;
};
export function LeaveRoomPrompt({ roomId, onDone, onCancel }: LeaveRoomPromptProps) {
  const mx = useMatrixClient();

  const [leaveState, leaveRoom] = useAsyncCallback<undefined, MatrixError, []>(
    useCallback(async () => {
      mx.leave(roomId);
    }, [mx, roomId])
  );

  const handleLeave = () => {
    leaveRoom();
  };

  useEffect(() => {
    if (leaveState.status === AsyncStatus.Success) {
      onDone();
    }
  }, [leaveState, onDone]);

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: onCancel,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Dialog variant="Surface">
            <Header
              style={{
                padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
                borderBottomWidth: config.borderWidth.B300,
              }}
              variant="Surface"
              size="500"
            >
              <Box grow="Yes">
                <Text size="H4">{'\u9000\u51fa\u623f\u95f4'}</Text>
              </Box>
              <IconButton size="300" onClick={onCancel} radii="300">
                <Icon src={Icons.Cross} />
              </IconButton>
            </Header>
            <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
              <Box direction="Column" gap="200">
                <Text priority="400">{'\u786e\u5b9a\u8981\u9000\u51fa\u8be5\u623f\u95f4\u5417\uff1f'}</Text>
                {leaveState.status === AsyncStatus.Error && (
                  <Text style={{ color: color.Critical.Main }} size="T300">
                    {'\u9000\u51fa\u623f\u95f4\u5931\u8d25\uff01'} {leaveState.error.message}
                  </Text>
                )}
              </Box>
              <Button
                type="submit"
                variant="Critical"
                onClick={handleLeave}
                before={
                  leaveState.status === AsyncStatus.Loading ? (
                    <Spinner fill="Solid" variant="Critical" size="200" />
                  ) : undefined
                }
                aria-disabled={
                  leaveState.status === AsyncStatus.Loading ||
                  leaveState.status === AsyncStatus.Success
                }
              >
                <Text size="B400">
                  {leaveState.status === AsyncStatus.Loading
                    ? '\u9000\u51fa\u4e2d...'
                    : '\u786e\u8ba4\u9000\u51fa'}
                </Text>
              </Button>
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
