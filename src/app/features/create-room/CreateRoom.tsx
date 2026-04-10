import React, { FormEventHandler, useCallback, useEffect, useState } from 'react';
import { MatrixError, Room, JoinRule } from 'matrix-js-sdk';
import {
  Box,
  Button,
  Chip,
  color,
  config,
  Icon,
  Icons,
  Input,
  Spinner,
  Switch,
  Text,
  TextArea,
} from 'folds';
import { SettingTile } from '../../components/setting-tile';
import { SequenceCard } from '../../components/sequence-card';
import {
  creatorsSupported,
  knockRestrictedSupported,
  knockSupported,
  restrictedSupported,
} from '../../utils/matrix';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { millisecondsToMinutes, replaceSpaceWithDash } from '../../utils/common';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { useCapabilities } from '../../hooks/useCapabilities';
import { useAlive } from '../../hooks/useAlive';
import { ErrorCode } from '../../cs-errorcode';
import {
  AdditionalCreatorInput,
  createRoom,
  CreateRoomAliasInput,
  CreateRoomData,
  CreateRoomAccess,
  CreateRoomAccessSelector,
  RoomVersionSelector,
  useAdditionalCreators,
  CreateRoomType,
} from '../../components/create-room';
import { RoomType } from '../../../types/matrix/room';
import { CreateRoomTypeSelector } from '../../components/create-room/CreateRoomTypeSelector';
import { getRoomIconSrc } from '../../utils/room';

const getCreateRoomAccessToIcon = (access: CreateRoomAccess, type?: CreateRoomType) => {
  const isVoiceRoom = type === CreateRoomType.VoiceRoom;

  let joinRule: JoinRule = JoinRule.Public;
  if (access === CreateRoomAccess.Restricted) joinRule = JoinRule.Restricted;
  if (access === CreateRoomAccess.Private) joinRule = JoinRule.Knock;

  return getRoomIconSrc(Icons, isVoiceRoom ? RoomType.Call : undefined, joinRule);
};

const getCreateRoomTypeToIcon = (type: CreateRoomType) => {
  if (type === CreateRoomType.VoiceRoom) return Icons.VolumeHigh;
  return Icons.Hash;
};

type CreateRoomFormProps = {
  defaultAccess?: CreateRoomAccess;
  defaultType?: CreateRoomType;
  space?: Room;
  onCreate?: (roomId: string) => void;
};
export function CreateRoomForm({
  defaultAccess,
  defaultType,
  space,
  onCreate,
}: CreateRoomFormProps) {
  const mx = useMatrixClient();
  const alive = useAlive();

  const capabilities = useCapabilities();
  const roomVersions = capabilities['m.room_versions'];
  const [selectedRoomVersion, selectRoomVersion] = useState(roomVersions?.default ?? '1');
  useEffect(() => {
    // capabilities load async
    selectRoomVersion(roomVersions?.default ?? '1');
  }, [roomVersions?.default]);

  const allowRestricted = space && restrictedSupported(selectedRoomVersion);

  const [type, setType] = useState(defaultType ?? CreateRoomType.TextRoom);
  const [access, setAccess] = useState(
    defaultAccess ?? (allowRestricted ? CreateRoomAccess.Restricted : CreateRoomAccess.Private)
  );
  const allowAdditionalCreators = creatorsSupported(selectedRoomVersion);
  const { additionalCreators, addAdditionalCreator, removeAdditionalCreator } =
    useAdditionalCreators();
  const [federation, setFederation] = useState(true);
  const [encryption, setEncryption] = useState(false);
  const [knock, setKnock] = useState(false);
  const [advance, setAdvance] = useState(false);

  const allowKnock = access === CreateRoomAccess.Private && knockSupported(selectedRoomVersion);
  const allowKnockRestricted =
    access === CreateRoomAccess.Restricted && knockRestrictedSupported(selectedRoomVersion);

  const handleRoomVersionChange = (version: string) => {
    if (!restrictedSupported(version)) {
      setAccess(CreateRoomAccess.Private);
    }
    selectRoomVersion(version);
  };

  const [createState, create] = useAsyncCallback<string, Error | MatrixError, [CreateRoomData]>(
    useCallback((data) => createRoom(mx, data), [mx])
  );
  const loading = createState.status === AsyncStatus.Loading;
  const error = createState.status === AsyncStatus.Error ? createState.error : undefined;
  const disabled = createState.status === AsyncStatus.Loading;

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    if (disabled) return;
    const form = evt.currentTarget;

    const nameInput = form.nameInput as HTMLInputElement | undefined;
    const topicTextArea = form.topicTextAria as HTMLTextAreaElement | undefined;
    const aliasInput = form.aliasInput as HTMLInputElement | undefined;
    const roomName = nameInput?.value.trim();
    const roomTopic = topicTextArea?.value.trim();
    const aliasLocalPart =
      aliasInput && aliasInput.value ? replaceSpaceWithDash(aliasInput.value) : undefined;

    if (!roomName) return;
    const publicRoom = access === CreateRoomAccess.Public;
    let roomKnock = false;
    if (allowKnock && access === CreateRoomAccess.Private) {
      roomKnock = knock;
    }
    if (allowKnockRestricted && access === CreateRoomAccess.Restricted) {
      roomKnock = knock;
    }

    let roomType: RoomType | undefined;
    if (type === CreateRoomType.VoiceRoom) roomType = RoomType.Call;

    create({
      version: selectedRoomVersion,
      type: roomType,
      parent: space,
      access,
      name: roomName,
      topic: roomTopic || undefined,
      aliasLocalPart: publicRoom ? aliasLocalPart : undefined,
      encryption: publicRoom ? false : encryption,
      knock: roomKnock,
      allowFederation: federation,
      additionalCreators: allowAdditionalCreators ? additionalCreators : undefined,
    }).then((roomId) => {
      if (alive()) {
        onCreate?.(roomId);
      }
    });
  };

  return (
    <Box as="form" onSubmit={handleSubmit} grow="Yes" direction="Column" gap="500">
      {!space && (
        <Box direction="Column" gap="100">
          <Text size="L400">{'\u7c7b\u578b'}</Text>
          <CreateRoomTypeSelector
            value={type}
            onSelect={setType}
            disabled={disabled}
            getIcon={getCreateRoomTypeToIcon}
          />
        </Box>
      )}
      <Box direction="Column" gap="100">
        <Text size="L400">{'\u8bbf\u95ee\u6743\u9650'}</Text>
        <CreateRoomAccessSelector
          value={access}
          onSelect={setAccess}
          canRestrict={allowRestricted}
          disabled={disabled}
          getIcon={(roomAccess) => getCreateRoomAccessToIcon(roomAccess, type)}
        />
      </Box>
      <Box shrink="No" direction="Column" gap="100">
        <Text size="L400">{'\u540d\u79f0'}</Text>
        <Input
          required
          before={<Icon size="100" src={getCreateRoomAccessToIcon(access, type)} />}
          name="nameInput"
          autoFocus
          size="500"
          variant="SurfaceVariant"
          radii="400"
          autoComplete="off"
          disabled={disabled}
        />
      </Box>
      <Box shrink="No" direction="Column" gap="100">
        <Text size="L400">{'\u4e3b\u9898\uff08\u53ef\u9009\uff09'}</Text>
        <TextArea
          name="topicTextAria"
          size="500"
          variant="SurfaceVariant"
          radii="400"
          disabled={disabled}
        />
      </Box>

      {access === CreateRoomAccess.Public && <CreateRoomAliasInput disabled={disabled} />}

      <Box shrink="No" direction="Column" gap="100">
        <Box gap="200" alignItems="End">
          <Text size="L400">{'\u9009\u9879'}</Text>
          <Box grow="Yes" justifyContent="End">
            <Chip
              radii="Pill"
              before={<Icon src={advance ? Icons.ChevronTop : Icons.ChevronBottom} size="50" />}
              onClick={() => setAdvance(!advance)}
              type="button"
            >
              <Text size="T200">{'\u9ad8\u7ea7\u9009\u9879'}</Text>
            </Chip>
          </Box>
        </Box>
        {allowAdditionalCreators && (
          <SequenceCard
            style={{ padding: config.space.S300 }}
            variant="SurfaceVariant"
            direction="Column"
            gap="500"
          >
            <AdditionalCreatorInput
              additionalCreators={additionalCreators}
              onSelect={addAdditionalCreator}
              onRemove={removeAdditionalCreator}
            />
          </SequenceCard>
        )}
        {access !== CreateRoomAccess.Public && (
          <>
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
            {advance && (allowKnock || allowKnockRestricted) && (
              <SequenceCard
                style={{ padding: config.space.S300 }}
                variant="SurfaceVariant"
                direction="Column"
                gap="500"
              >
                <SettingTile
                  title={'\u7533\u8bf7\u52a0\u5165'}
                  description={'\u4efb\u4f55\u4eba\u90fd\u53ef\u4ee5\u53d1\u9001\u52a0\u5165\u6b64\u623f\u95f4\u7684\u8bf7\u6c42\u3002'}
                  after={
                    <Switch
                      variant="Primary"
                      value={knock}
                      onChange={setKnock}
                      disabled={disabled}
                    />
                  }
                />
              </SequenceCard>
            )}
          </>
        )}

        <SequenceCard
          style={{ padding: config.space.S300 }}
          variant="SurfaceVariant"
          direction="Column"
          gap="500"
        >
          <SettingTile
            title={'\u5141\u8bb8\u8054\u90a6\u4e92\u901a'}
            description={'\u5176\u4ed6\u670d\u52a1\u5668\u7684\u7528\u6237\u4e5f\u53ef\u4ee5\u52a0\u5165\u3002'}
            after={
              <Switch
                variant="Primary"
                value={federation}
                onChange={setFederation}
                disabled={disabled}
              />
            }
          />
        </SequenceCard>
        {advance && (
          <RoomVersionSelector
            versions={roomVersions?.available ? Object.keys(roomVersions.available) : ['1']}
            value={selectedRoomVersion}
            onChange={handleRoomVersionChange}
            disabled={disabled}
          />
        )}
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
