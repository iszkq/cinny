import React, {
  ChangeEventHandler,
  FormEventHandler,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Avatar,
  Box,
  Button,
  color,
  config,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Input,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Spinner,
  Text,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { UserProfile, useUserProfile } from '../../../hooks/useUserProfile';
import { getMxIdLocalPart, mxcUrlToHttp } from '../../../utils/matrix';
import { UserAvatar } from '../../../components/user-avatar';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { bytesToSize, nameInitials } from '../../../utils/common';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { useFilePicker } from '../../../hooks/useFilePicker';
import { useObjectURL } from '../../../hooks/useObjectURL';
import { stopPropagation } from '../../../utils/keyboard';
import { createUploadAtom, UploadSuccess } from '../../../state/upload';
import { CompactUploadCardRenderer } from '../../../components/upload-card';
import { useCapabilities } from '../../../hooks/useCapabilities';
import { AVATAR_ACCEPT, AVATAR_MAX_FILE_SIZE, validateAvatarFile } from '../../../utils/avatar';

type ProfileProps = {
  profile: UserProfile;
  userId: string;
};

function ProfileAvatar({ profile, userId }: ProfileProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const capabilities = useCapabilities();
  const [alertRemove, setAlertRemove] = useState(false);
  const disableSetAvatar = capabilities['m.set_avatar_url']?.enabled === false;

  const defaultDisplayName = profile.displayName ?? getMxIdLocalPart(userId) ?? userId;
  const avatarUrl = profile.avatarUrl
    ? mxcUrlToHttp(mx, profile.avatarUrl, useAuthentication, 96, 96, 'crop') ?? undefined
    : undefined;

  const [imageFile, setImageFile] = useState<File>();
  const [uploadFile, setUploadFile] = useState<File>();
  const [avatarError, setAvatarError] = useState<string>();
  const imageFileURL = useObjectURL(imageFile);
  const uploadAtom = useMemo(() => {
    if (uploadFile) return createUploadAtom(uploadFile);
    return undefined;
  }, [uploadFile]);

  const handleSelectAvatar = useCallback((file: File) => {
    const error = validateAvatarFile(file);
    setAvatarError(error);
    setImageFile(error ? undefined : file);
    setUploadFile(undefined);
  }, []);
  const pickFile = useFilePicker(handleSelectAvatar, false);

  const handleRemoveUpload = useCallback(() => {
    setImageFile(undefined);
    setUploadFile(undefined);
    setAvatarError(undefined);
  }, []);

  const handleUploaded = useCallback(
    async (upload: UploadSuccess) => {
      try {
        await mx.setAvatarUrl(upload.mxc);
        handleRemoveUpload();
      } catch (errorValue) {
        setAvatarError(errorValue instanceof Error ? errorValue.message : '头像更新失败，请重试。');
      }
    },
    [mx, handleRemoveUpload]
  );

  const handleRemoveAvatar = async () => {
    try {
      await mx.setAvatarUrl('');
      setAlertRemove(false);
    } catch (errorValue) {
      setAvatarError(errorValue instanceof Error ? errorValue.message : '头像移除失败，请重试。');
    }
  };

  return (
    <SettingTile
      title={
        <Text as="span" size="L400">
          头像
        </Text>
      }
      after={
        <Avatar size="500" radii="300">
          <UserAvatar
            userId={userId}
            src={avatarUrl}
            renderFallback={() => <Text size="H4">{nameInitials(defaultDisplayName)}</Text>}
          />
        </Avatar>
      }
    >
      {uploadAtom && (
        <Box gap="200" direction="Column">
          <CompactUploadCardRenderer
            uploadAtom={uploadAtom}
            onRemove={handleRemoveUpload}
            onComplete={handleUploaded}
          />
        </Box>
      )}
      {!uploadAtom && imageFile && imageFileURL && (
        <Box gap="300" direction="Column">
          <Box gap="300" alignItems="Center">
            <Avatar size="500" radii="300">
              <UserAvatar
                userId={userId}
                src={imageFileURL}
                alt="新头像预览"
                renderFallback={() => <Text size="H4">?</Text>}
              />
            </Avatar>
            <Box direction="Column" gap="100">
              <Text size="B300">{imageFile.name}</Text>
              <Text size="T200" priority="300">
                动态头像会保留原始动画。
              </Text>
            </Box>
          </Box>
          <Box gap="200" wrap="Wrap">
            <Button
              onClick={() => {
                setAvatarError(undefined);
                setUploadFile(imageFile);
                setImageFile(undefined);
              }}
              size="300"
              variant="Success"
              radii="300"
            >
              <Text size="B300">上传这个头像</Text>
            </Button>
            <Button
              onClick={handleRemoveUpload}
              size="300"
              variant="Secondary"
              fill="None"
              radii="300"
            >
              <Text size="B300">取消</Text>
            </Button>
          </Box>
        </Box>
      )}
      {!uploadAtom && (!imageFile || !imageFileURL) && (
        <Box gap="200">
          <Button
            onClick={() => pickFile(AVATAR_ACCEPT)}
            size="300"
            variant="Secondary"
            fill="Soft"
            outlined
            radii="300"
            disabled={disableSetAvatar}
          >
            <Text size="B300">上传</Text>
          </Button>
          {avatarUrl && (
            <Button
              size="300"
              variant="Critical"
              fill="None"
              radii="300"
              disabled={disableSetAvatar}
              onClick={() => setAlertRemove(true)}
            >
              <Text size="B300">移除</Text>
            </Button>
          )}
        </Box>
      )}

      {!imageFile && !uploadAtom && (
        <Text size="T200" priority="300">
          支持 JPG、PNG、GIF、WebP，最大 {bytesToSize(AVATAR_MAX_FILE_SIZE)}。动态头像会直接播放。
        </Text>
      )}
      {avatarError && (
        <Text size="T200" style={{ color: color.Critical.Main }}>
          {avatarError}
        </Text>
      )}

      <Overlay open={alertRemove} backdrop={<OverlayBackdrop />}>
        <OverlayCenter>
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              onDeactivate: () => setAlertRemove(false),
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
                  <Text size="H4">移除头像</Text>
                </Box>
                <IconButton size="300" onClick={() => setAlertRemove(false)} radii="300">
                  <Icon src={Icons.Cross} />
                </IconButton>
              </Header>
              <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
                <Box direction="Column" gap="200">
                  <Text priority="400">确定要移除当前个人头像吗？</Text>
                </Box>
                <Button variant="Critical" onClick={handleRemoveAvatar}>
                  <Text size="B400">移除</Text>
                </Button>
              </Box>
            </Dialog>
          </FocusTrap>
        </OverlayCenter>
      </Overlay>
    </SettingTile>
  );
}

function ProfileDisplayName({ profile, userId }: ProfileProps) {
  const mx = useMatrixClient();
  const capabilities = useCapabilities();
  const disableSetDisplayname = capabilities['m.set_displayname']?.enabled === false;

  const defaultDisplayName = profile.displayName ?? getMxIdLocalPart(userId) ?? userId;
  const [displayName, setDisplayName] = useState<string>(defaultDisplayName);

  const [changeState, changeDisplayName] = useAsyncCallback(
    useCallback((name: string) => mx.setDisplayName(name), [mx])
  );
  const changingDisplayName = changeState.status === AsyncStatus.Loading;

  useEffect(() => {
    setDisplayName(defaultDisplayName);
  }, [defaultDisplayName]);

  const handleChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    setDisplayName(evt.currentTarget.value);
  };

  const handleReset = () => {
    setDisplayName(defaultDisplayName);
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    if (changingDisplayName) return;

    const target = evt.target as HTMLFormElement | undefined;
    const displayNameInput = target?.displayNameInput as HTMLInputElement | undefined;
    const name = displayNameInput?.value;
    if (!name) return;

    changeDisplayName(name);
  };

  const hasChanges = displayName !== defaultDisplayName;
  return (
    <SettingTile
      title={
        <Text as="span" size="L400">
          显示名称
        </Text>
      }
    >
      <Box direction="Column" grow="Yes" gap="100">
        <Box
          as="form"
          onSubmit={handleSubmit}
          gap="200"
          aria-disabled={changingDisplayName || disableSetDisplayname}
        >
          <Box grow="Yes" direction="Column">
            <Input
              required
              name="displayNameInput"
              value={displayName}
              onChange={handleChange}
              variant="Secondary"
              radii="300"
              style={{ paddingRight: config.space.S200 }}
              readOnly={changingDisplayName || disableSetDisplayname}
              after={
                hasChanges &&
                !changingDisplayName && (
                  <IconButton
                    type="reset"
                    onClick={handleReset}
                    size="300"
                    radii="300"
                    variant="Secondary"
                  >
                    <Icon src={Icons.Cross} size="100" />
                  </IconButton>
                )
              }
            />
          </Box>
          <Button
            size="400"
            variant={hasChanges ? 'Success' : 'Secondary'}
            fill={hasChanges ? 'Solid' : 'Soft'}
            outlined
            radii="300"
            disabled={!hasChanges || changingDisplayName}
            type="submit"
          >
            {changingDisplayName && <Spinner variant="Success" fill="Solid" size="300" />}
            <Text size="B400">保存</Text>
          </Button>
        </Box>
      </Box>
    </SettingTile>
  );
}

export function Profile() {
  const mx = useMatrixClient();
  const userId = mx.getUserId()!;
  const profile = useUserProfile(userId);

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">个人资料</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <ProfileAvatar userId={userId} profile={profile} />
        <ProfileDisplayName userId={userId} profile={profile} />
      </SequenceCard>
    </Box>
  );
}
