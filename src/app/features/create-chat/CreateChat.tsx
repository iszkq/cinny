import { Box, Button, color, config, Icon, Icons, Input, Spinner, Switch, Text } from 'folds';
import React, { FormEventHandler, useCallback, useState } from 'react';
import { ICreateRoomStateEvent, MatrixError, Preset, Visibility } from 'matrix-js-sdk';
import { useNavigate } from 'react-router-dom';
import { SettingTile } from '../../components/setting-tile';
import { SequenceCard } from '../../components/sequence-card';
import { addRoomIdToMDirect, isUserId } from '../../utils/matrix';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { ErrorCode } from '../../cs-errorcode';
import { millisecondsToMinutes } from '../../utils/common';
import { createRoomEncryptionState } from '../../components/create-room';
import { useAlive } from '../../hooks/useAlive';
import { getDirectRoomPath } from '../../pages/pathUtils';

type CreateChatProps = {
  defaultUserId?: string;
};
export function CreateChat({ defaultUserId }: CreateChatProps) {
  const mx = useMatrixClient();
  const alive = useAlive();
  const navigate = useNavigate();

  const [encryption, setEncryption] = useState(true);
  const [invalidUserId, setInvalidUserId] = useState(false);

  const [createState, create] = useAsyncCallback<string, Error | MatrixError, [string, boolean]>(
    useCallback(
      async (userId, encrypted) => {
        const initialState: ICreateRoomStateEvent[] = [];

        if (encrypted) initialState.push(createRoomEncryptionState());

        const result = await mx.createRoom({
          is_direct: true,
          invite: [userId],
          visibility: Visibility.Private,
          preset: Preset.TrustedPrivateChat,
          initial_state: initialState,
        });

        addRoomIdToMDirect(mx, result.room_id, userId);

        return result.room_id;
      },
      [mx]
    )
  );
  const loading = createState.status === AsyncStatus.Loading;
  const error = createState.status === AsyncStatus.Error ? createState.error : undefined;
  const disabled = createState.status === AsyncStatus.Loading;

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    setInvalidUserId(false);

    const target = evt.target as HTMLFormElement | undefined;
    const userIdInput = target?.userIdInput as HTMLInputElement | undefined;
    const userId = userIdInput?.value.trim();

    if (!userIdInput || !userId) return;
    if (!isUserId(userId)) {
      setInvalidUserId(true);
      return;
    }

    create(userId, encryption).then((roomId) => {
      if (alive()) {
        userIdInput.value = '';
        navigate(getDirectRoomPath(roomId));
      }
    });
  };

  return (
    <Box as="form" onSubmit={handleSubmit} grow="Yes" direction="Column" gap="500">
      <Box direction="Column" gap="100">
        <Text size="L400">{'\u7528\u6237 ID'}</Text>
        <Input
          defaultValue={defaultUserId}
          placeholder="@username:server"
          name="userIdInput"
          variant="SurfaceVariant"
          size="500"
          radii="400"
          required
          autoFocus
          autoComplete="off"
          disabled={disabled}
        />
        {invalidUserId && (
          <Box style={{ color: color.Critical.Main }} alignItems="Center" gap="100">
            <Icon src={Icons.Warning} filled size="50" />
            <Text size="T200" style={{ color: color.Critical.Main }}>
              <b>{'\u8bf7\u8f93\u5165\u6709\u6548\u7684\u7528\u6237 ID\u3002'}</b>
            </Text>
          </Box>
        )}
      </Box>
      <Box shrink="No" direction="Column" gap="100">
        <Text size="L400">{'\u9009\u9879'}</Text>
        <SequenceCard
          style={{ padding: config.space.S300 }}
          variant="SurfaceVariant"
          direction="Column"
          gap="500"
        >
          <SettingTile
            title={'\u7aef\u5230\u7aef\u52a0\u5bc6'}
            description={
              '\u5f00\u542f\u540e\uff0c\u623f\u95f4\u521b\u5efa\u5b8c\u6210\u540e\u5c06\u65e0\u6cd5\u5173\u95ed\u3002'
            }
            after={
              <Switch
                variant="Primary"
                value={encryption}
                onChange={setEncryption}
                disabled={disabled}
              />
            }
          />
        </SequenceCard>
      </Box>
      {error && (
        <Box style={{ color: color.Critical.Main }} alignItems="Center" gap="200">
          <Icon src={Icons.Warning} filled size="100" />
          <Text size="T300" style={{ color: color.Critical.Main }}>
            <b>
              {error instanceof MatrixError && error.name === ErrorCode.M_LIMIT_EXCEEDED
                ? `\u670d\u52a1\u5668\u5bf9\u4f60\u7684\u8bf7\u6c42\u8fdb\u884c\u4e86\u9650\u6d41\uff0c\u8bf7\u5728 ${millisecondsToMinutes(
                    (error.data.retry_after_ms as number | undefined) ?? 0
                  )} \u5206\u949f\u540e\u91cd\u8bd5\uff01`
                : error.message}
            </b>
          </Text>
        </Box>
      )}
      <Box shrink="No" direction="Column" gap="200">
        <Button
          type="submit"
          size="500"
          variant="Primary"
          radii="400"
          disabled={disabled}
          before={loading && <Spinner variant="Primary" fill="Solid" size="200" />}
        >
          <Text size="B500">{'\u521b\u5efa'}</Text>
        </Button>
      </Box>
    </Box>
  );
}
