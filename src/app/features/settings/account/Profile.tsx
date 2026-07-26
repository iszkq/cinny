import React, {
  ChangeEventHandler,
  FormEventHandler,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Box,
  Text,
  IconButton,
  Icon,
  Icons,
  Input,
  Avatar,
  Button,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Dialog,
  Header,
  config,
  Spinner,
  color,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import classNames from 'classnames';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { UserProfile, useUserProfile } from '../../../hooks/useUserProfile';
import { downloadMedia, getMxIdLocalPart, mxcUrlToHttp } from '../../../utils/matrix';
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
import {
  AVATAR_ACCEPT,
  AVATAR_FRAME_ACCEPT,
  AVATAR_FRAME_MAX_DIMENSION,
  AVATAR_FRAME_MAX_FILE_SIZE,
  AVATAR_FRAME_MIN_DIMENSION,
  AVATAR_FRAME_RECOMMENDED_DIMENSION,
  AVATAR_MAX_FILE_SIZE,
  composeAvatarWithFrame,
  validateAvatarFile,
  validateAvatarFrameImage,
} from '../../../utils/avatar';
import { DEFAULT_AVATAR_FRAMES, DefaultAvatarFrame, loadDefaultAvatarFrame } from './avatarFrames';
import { useAccountData } from '../../../hooks/useAccountData';
import { AccountDataEvent, CinnyAvatarFrameContent } from '../../../../types/matrix/accountData';
import { setAvatarUrlWithoutRoomEvent } from '../../../utils/profile';
import * as css from './Profile.css';

type ProfileProps = {
  profile: UserProfile;
  userId: string;
};

const NO_AVATAR_FRAME = 'none';

const getFileExtension = (mimeType: string): string => {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/gif') return 'gif';
  if (mimeType === 'image/webp') return 'webp';
  return 'img';
};

const getAvatarFile = async (
  mx: ReturnType<typeof useMatrixClient>,
  mxc: string,
  useAuthentication: boolean
): Promise<File> => {
  const httpUrl = mxcUrlToHttp(mx, mxc, useAuthentication);
  if (!httpUrl) throw new Error('当前头像地址无效，请重新上传头像后再设置头像框。');

  const blob = await downloadMedia(httpUrl);
  const mimeType = blob.type.split(';')[0].toLowerCase();
  const file = new File([blob], `avatar.${getFileExtension(mimeType)}`, { type: mimeType });
  const error = validateAvatarFile(file);
  if (error) throw new Error(`当前头像无法用于头像框：${error}`);
  return file;
};

const saveAvatarFrameState = (
  mx: ReturnType<typeof useMatrixClient>,
  content: CinnyAvatarFrameContent
) =>
  mx.setAccountData(AccountDataEvent.CinnyAvatarFrame, {
    version: 1,
    updatedAt: Date.now(),
    ...content,
  });

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
      const { mxc } = upload;
      try {
        await setAvatarUrlWithoutRoomEvent(mx, userId, mxc);
        await saveAvatarFrameState(mx, {
          baseAvatarUrl: mxc,
          avatarUrl: mxc,
        });
        handleRemoveUpload();
      } catch (errorValue) {
        setAvatarError(errorValue instanceof Error ? errorValue.message : '头像更新失败，请重试。');
      }
    },
    [mx, userId, handleRemoveUpload]
  );

  const handleRemoveAvatar = async () => {
    try {
      await setAvatarUrlWithoutRoomEvent(mx, userId, '');
      await saveAvatarFrameState(mx, {});
      setAlertRemove(false);
    } catch (errorValue) {
      setAvatarError(errorValue instanceof Error ? errorValue.message : '头像移除失败，请重试。');
    }
  };

  return (
    <SettingTile
      title={
        <Text as="span" size="L400">
          {'\u5934\u50cf'}
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
                动态头像会保留原始动画。头像框可在下方单独设置。
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
            <Text size="B300">{'\u4e0a\u4f20'}</Text>
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
              <Text size="B300">{'\u79fb\u9664'}</Text>
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
                  <Text size="H4">{'\u79fb\u9664\u5934\u50cf'}</Text>
                </Box>
                <IconButton size="300" onClick={() => setAlertRemove(false)} radii="300">
                  <Icon src={Icons.Cross} />
                </IconButton>
              </Header>
              <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
                <Box direction="Column" gap="200">
                  <Text priority="400">
                    {
                      '\u786e\u5b9a\u8981\u79fb\u9664\u5f53\u524d\u4e2a\u4eba\u5934\u50cf\u5417\uff1f'
                    }
                  </Text>
                </Box>
                <Button variant="Critical" onClick={handleRemoveAvatar}>
                  <Text size="B400">{'\u79fb\u9664'}</Text>
                </Button>
              </Box>
            </Dialog>
          </FocusTrap>
        </OverlayCenter>
      </Overlay>
    </SettingTile>
  );
}

function ProfileAvatarFrame({ profile, userId }: ProfileProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const capabilities = useCapabilities();
  const disableSetAvatar = capabilities['m.set_avatar_url']?.enabled === false;
  const frameEvent = useAccountData(AccountDataEvent.CinnyAvatarFrame);
  const storedFrame = frameEvent?.getContent<CinnyAvatarFrameContent>();
  const storedFrameMatchesAvatar =
    typeof profile.avatarUrl === 'string' &&
    storedFrame?.avatarUrl === profile.avatarUrl &&
    typeof storedFrame.baseAvatarUrl === 'string';
  const baseAvatarMxc = storedFrameMatchesAvatar ? storedFrame.baseAvatarUrl : profile.avatarUrl;
  const currentFrameId = storedFrameMatchesAvatar ? storedFrame.frameId : undefined;
  const baseAvatarUrl = baseAvatarMxc
    ? mxcUrlToHttp(mx, baseAvatarMxc, useAuthentication, 96, 96, 'crop') ?? undefined
    : undefined;
  const currentAvatarUrl = profile.avatarUrl
    ? mxcUrlToHttp(mx, profile.avatarUrl, useAuthentication, 96, 96, 'crop') ?? undefined
    : undefined;

  const [draftFrameId, setDraftFrameId] = useState<string>();
  const [draftAvatarFile, setDraftAvatarFile] = useState<File>();
  const [uploadFile, setUploadFile] = useState<File>();
  const [frameError, setFrameError] = useState<string>();
  const [processingFrameId, setProcessingFrameId] = useState<string>();
  const draftAvatarFileUrl = useObjectURL(draftAvatarFile);
  const processingFrame = processingFrameId !== undefined;
  const hasDraft = draftFrameId !== undefined;
  let selectedFrameId = currentFrameId;
  let previewAvatarUrl = currentAvatarUrl;
  if (hasDraft) {
    selectedFrameId = draftFrameId === NO_AVATAR_FRAME ? undefined : draftFrameId;
    previewAvatarUrl = draftFrameId === NO_AVATAR_FRAME ? baseAvatarUrl : draftAvatarFileUrl;
  }
  const canConfigureFrame = Boolean(profile.avatarUrl && baseAvatarMxc && baseAvatarUrl);
  const uploadAtom = useMemo(() => {
    if (uploadFile) return createUploadAtom(uploadFile);
    return undefined;
  }, [uploadFile]);

  const clearDraft = useCallback(() => {
    setDraftFrameId(undefined);
    setDraftAvatarFile(undefined);
    setUploadFile(undefined);
    setProcessingFrameId(undefined);
  }, []);

  const prepareFrame = useCallback(
    async (framePromise: Promise<File>, frameId: string, trustedFrame = false) => {
      if (!baseAvatarMxc) return;

      setFrameError(undefined);
      setProcessingFrameId(frameId);
      try {
        const [avatar, frame] = await Promise.all([
          getAvatarFile(mx, baseAvatarMxc, useAuthentication),
          framePromise,
        ]);
        const framedAvatar = await composeAvatarWithFrame(avatar, frame, trustedFrame);
        setDraftAvatarFile(framedAvatar);
        setDraftFrameId(frameId);
      } catch (errorValue) {
        setFrameError(
          errorValue instanceof Error ? errorValue.message : '头像框合成失败，请重试。'
        );
      } finally {
        setProcessingFrameId(undefined);
      }
    },
    [mx, baseAvatarMxc, useAuthentication]
  );

  const handleSelectDefaultFrame = useCallback(
    (frame: DefaultAvatarFrame) => {
      prepareFrame(loadDefaultAvatarFrame(frame), frame.id, true);
    },
    [prepareFrame]
  );

  const handleSelectCustomFrame = useCallback(
    async (frame: File) => {
      setFrameError(undefined);
      try {
        const error = await validateAvatarFrameImage(frame);
        if (error) {
          setFrameError(error);
          return;
        }
        await prepareFrame(Promise.resolve(frame), 'custom');
      } catch (errorValue) {
        setFrameError(
          errorValue instanceof Error ? errorValue.message : '头像框无法读取，请更换图片后重试。'
        );
      }
    },
    [prepareFrame]
  );
  const pickFrame = useFilePicker(handleSelectCustomFrame, false);

  const applyNoFrame = useCallback(async () => {
    if (!baseAvatarMxc) return;
    try {
      await saveAvatarFrameState(mx, {
        baseAvatarUrl: baseAvatarMxc,
        avatarUrl: baseAvatarMxc,
      });
      await setAvatarUrlWithoutRoomEvent(mx, userId, baseAvatarMxc);
      clearDraft();
    } catch (errorValue) {
      setFrameError(errorValue instanceof Error ? errorValue.message : '头像框更新失败，请重试。');
    }
  }, [mx, userId, baseAvatarMxc, clearDraft]);

  const handleApplyFrame = () => {
    if (draftFrameId === NO_AVATAR_FRAME) {
      applyNoFrame();
      return;
    }
    if (draftAvatarFile) setUploadFile(draftAvatarFile);
  };

  const handleFrameUploaded = useCallback(
    async (upload: UploadSuccess) => {
      if (!baseAvatarMxc || !draftFrameId || draftFrameId === NO_AVATAR_FRAME) return;
      try {
        await saveAvatarFrameState(mx, {
          baseAvatarUrl: baseAvatarMxc,
          avatarUrl: upload.mxc,
          frameId: draftFrameId,
        });
        await setAvatarUrlWithoutRoomEvent(mx, userId, upload.mxc);
        clearDraft();
      } catch (errorValue) {
        setFrameError(
          errorValue instanceof Error ? errorValue.message : '头像框更新失败，请重试。'
        );
      }
    },
    [mx, userId, baseAvatarMxc, draftFrameId, clearDraft]
  );

  return (
    <SettingTile
      title={<Text size="L400">头像框</Text>}
      after={
        profile.avatarUrl && (
          <Avatar size="500" radii="300">
            <UserAvatar
              userId={userId}
              src={previewAvatarUrl}
              renderFallback={() => <Text size="H4">?</Text>}
            />
          </Avatar>
        )
      }
    >
      {!canConfigureFrame && (
        <Text size="T200" priority="300">
          请先上传头像，再选择头像框。
        </Text>
      )}
      {canConfigureFrame && uploadAtom && (
        <CompactUploadCardRenderer
          uploadAtom={uploadAtom}
          onRemove={() => setUploadFile(undefined)}
          onComplete={handleFrameUploaded}
        />
      )}
      {canConfigureFrame && !uploadAtom && baseAvatarUrl && (
        <Box direction="Column" gap="300">
          <div className={css.AvatarFrameGrid}>
            <button
              className={classNames(css.AvatarFrameOption, {
                [css.AvatarFrameOptionSelected]: selectedFrameId === undefined,
              })}
              type="button"
              disabled={processingFrame || disableSetAvatar}
              onClick={() => {
                setDraftAvatarFile(undefined);
                setDraftFrameId(NO_AVATAR_FRAME);
                setFrameError(undefined);
              }}
            >
              <Box direction="Column" gap="100" alignItems="Center">
                <div className={css.AvatarFramePreview}>
                  <img className={css.AvatarFramePreviewImage} src={baseAvatarUrl} alt="" />
                </div>
                <Text size="B300">无头像框</Text>
              </Box>
            </button>
            {DEFAULT_AVATAR_FRAMES.map((frame) => (
              <button
                className={classNames(css.AvatarFrameOption, {
                  [css.AvatarFrameOptionSelected]: selectedFrameId === frame.id,
                })}
                type="button"
                disabled={processingFrame || disableSetAvatar}
                onClick={() => handleSelectDefaultFrame(frame)}
                key={frame.id}
              >
                <Box direction="Column" gap="100" alignItems="Center">
                  <div className={css.AvatarFramePreview}>
                    <img
                      className={classNames(
                        css.AvatarFramePreviewImage,
                        css.AvatarFramePreviewImageInset
                      )}
                      src={baseAvatarUrl}
                      alt=""
                    />
                    <img className={css.AvatarFramePreviewOverlay} src={frame.url} alt="" />
                  </div>
                  <Text size="B300">{frame.name}</Text>
                </Box>
              </button>
            ))}
          </div>

          {selectedFrameId === 'custom' && !hasDraft && (
            <Text size="T200" priority="300">
              当前使用自定义头像框。
            </Text>
          )}
          {processingFrame && (
            <Box gap="100" alignItems="Center">
              <Spinner size="100" variant="Secondary" fill="Solid" />
              <Text size="T200" priority="300">
                正在生成头像框预览…
              </Text>
            </Box>
          )}

          <Box gap="200" wrap="Wrap">
            {hasDraft && (
              <Button
                onClick={handleApplyFrame}
                size="300"
                variant="Success"
                radii="300"
                disabled={processingFrame || disableSetAvatar}
              >
                <Text size="B300">应用头像框</Text>
              </Button>
            )}
            <Button
              onClick={() => pickFrame(AVATAR_FRAME_ACCEPT)}
              size="300"
              variant="Secondary"
              fill="Soft"
              outlined
              radii="300"
              disabled={processingFrame || disableSetAvatar}
            >
              <Text size="B300">上传自定义头像框</Text>
            </Button>
            {hasDraft && (
              <Button
                onClick={clearDraft}
                size="300"
                variant="Secondary"
                fill="None"
                radii="300"
                disabled={processingFrame}
              >
                <Text size="B300">取消预览</Text>
              </Button>
            )}
          </Box>

          <Text size="T200" priority="300">
            自定义头像框要求：静态 PNG 或 WebP，最大 {bytesToSize(AVATAR_FRAME_MAX_FILE_SIZE)}
            ；必须为正方形，边长 {AVATAR_FRAME_MIN_DIMENSION}–{AVATAR_FRAME_MAX_DIMENSION}{' '}
            像素，建议 {AVATAR_FRAME_RECOMMENDED_DIMENSION} × {AVATAR_FRAME_RECOMMENDED_DIMENSION}
            ；背景和中央区域须透明，装饰请放在外圈。头像显示在中央约 78% 区域。
          </Text>
          <Text size="T200" priority="300">
            头像和头像框使用 Matrix
            静默资料更新（MSC4069），不会主动向房间发送“更换头像”的成员事件；服务器未启用该能力时会取消更新，避免产生通知。
          </Text>
        </Box>
      )}

      {frameError && (
        <Text size="T200" style={{ color: color.Critical.Main }}>
          {frameError}
        </Text>
      )}
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
    const name = evt.currentTarget.value;
    setDisplayName(name);
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
          {'\u663e\u793a\u540d\u79f0'}
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
            <Text size="B400">{'\u4fdd\u5b58'}</Text>
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
      <Text size="L400">{'\u4e2a\u4eba\u8d44\u6599'}</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <ProfileAvatar userId={userId} profile={profile} />
        <ProfileAvatarFrame userId={userId} profile={profile} />
        <ProfileDisplayName userId={userId} profile={profile} />
      </SequenceCard>
    </Box>
  );
}
