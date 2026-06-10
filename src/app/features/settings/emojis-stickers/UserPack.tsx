import React, {
  ChangeEventHandler,
  FormEventHandler,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Box,
  Button,
  Icon,
  IconButton,
  Icons,
  Input,
  Spinner,
  Text,
} from 'folds';
import { useAllPersonalImagePacks } from '../../../hooks/useImagePacks';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import {
  ImagePack,
  ImageUsage,
  UserImagePacksContent,
  getCustomUserImagePacksContent,
  setPersonalPackOrder,
  setCustomUserImagePacksContent,
} from '../../../plugins/custom-emoji';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { mxcUrlToHttp } from '../../../utils/matrix';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { LineClamp2 } from '../../../styles/Text.css';
import { randomStr } from '../../../utils/common';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';

type UserPackProps = {
  onViewPack: (imagePack: ImagePack) => void;
};

const createPersonalPackId = () =>
  `personal-${Date.now().toString(36)}-${randomStr(4).toLowerCase()}`;

const createFallbackPackName = (content: UserImagePacksContent) => {
  const existingNames = new Set(
    Object.values(content.packs ?? {}).map((pack) => pack.pack?.display_name).filter(Boolean)
  );

  let index = 1;
  let nextName = `\u4e2a\u4eba\u5206\u7c7b ${index}`;

  while (existingNames.has(nextName)) {
    index += 1;
    nextName = `\u4e2a\u4eba\u5206\u7c7b ${index}`;
  }

  return nextName;
};

const PACK_ORDER_SAVE_DEBOUNCE_MS = 180;

const getPackIds = (packs: ImagePack[]): string[] => packs.map((pack) => pack.id);

const packIdListsEqual = (packIdsA: string[], packIdsB: string[]): boolean =>
  packIdsA.length === packIdsB.length &&
  packIdsA.every((packId, index) => packId === packIdsB[index]);

const reconcilePackOrder = (packOrder: string[] | undefined, packs: ImagePack[]): string[] => {
  const packIds = getPackIds(packs);
  if (!packOrder) return packIds;

  const knownPackIds = new Set(packIds);
  const seenPackIds = new Set<string>();
  const nextOrder = packOrder.filter((packId) => {
    if (!knownPackIds.has(packId) || seenPackIds.has(packId)) return false;
    seenPackIds.add(packId);
    return true;
  });

  packIds.forEach((packId) => {
    if (!seenPackIds.has(packId)) {
      nextOrder.push(packId);
    }
  });

  return nextOrder;
};

const movePackId = (packIds: string[], sourceIndex: number, targetIndex: number): string[] => {
  const nextPackIds = [...packIds];
  const [packId] = nextPackIds.splice(sourceIndex, 1);
  nextPackIds.splice(targetIndex, 0, packId);
  return nextPackIds;
};

function CreatePersonalPackTile({ onViewPack }: UserPackProps) {
  const mx = useMatrixClient();
  const [packName, setPackName] = useState('');

  const [createState, createPack] = useAsyncCallback<ImagePack, Error, [string]>(
    useCallback(
      async (name) => {
        const content = getCustomUserImagePacksContent(mx);
        let packId = createPersonalPackId();

        while (content.packs?.[packId]) {
          packId = createPersonalPackId();
        }

        const trimmedName = name.trim();
        const resolvedName = trimmedName || createFallbackPackName(content);
        const packContent = {
          pack: {
            display_name: resolvedName,
          },
        };

        const updatedContent: UserImagePacksContent = {
          ...content,
          version: content.version ?? 1,
          packs: {
            ...(content.packs ?? {}),
            [packId]: packContent,
          },
        };

        await setCustomUserImagePacksContent(mx, updatedContent);
        return new ImagePack(packId, packContent, undefined);
      },
      [mx]
    )
  );

  const creating = createState.status === AsyncStatus.Loading;

  const handleNameChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    setPackName(evt.currentTarget.value);
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    if (creating) return;

    createPack(packName)
      .then((imagePack) => {
        setPackName('');
        onViewPack(imagePack);
      })
      .catch(() => undefined);
  };

  return (
    <SequenceCard
      className={SequenceCardStyle}
      variant="SurfaceVariant"
      direction="Column"
      gap="400"
    >
      <SettingTile
        title={'\u65b0\u5efa\u4e2a\u4eba\u5206\u7c7b'}
        description={'\u65b0\u5efa\u4e00\u4e2a\u5355\u72ec\u7684\u4e2a\u4eba\u8868\u60c5\u5206\u7c7b\uff0c\u7528\u6765\u6309\u4e3b\u9898\u6574\u7406\u81ea\u5df1\u7684\u8868\u60c5\u3001\u8d34\u7eb8\u6216\u7d20\u6750\u3002'}
      >
        <Box
          as="form"
          direction="Column"
          gap="200"
          onSubmit={handleSubmit}
          style={{ width: '100%' }}
        >
          <Box grow="Yes" style={{ width: '100%' }}>
            <Input
              name="packNameInput"
              value={packName}
              onChange={handleNameChange}
              size="400"
              variant="Secondary"
              radii="300"
              placeholder={'\u53ef\u9009\uff0c\u4f8b\u5982\uff1a\u65e5\u5e38\u8868\u60c5'}
              readOnly={creating}
              style={{ width: '100%' }}
            />
          </Box>
          <Box alignItems="Center" gap="300">
            <Box grow="Yes">
              <Text size="T200" priority="300">
                {
                  '\u5206\u7c7b\u540d\u79f0\u53ef\u4ee5\u5148\u4e0d\u586b\uff0c\u76f4\u63a5\u70b9\u51fb\u521b\u5efa\u540e\u4f1a\u81ea\u52a8\u751f\u6210\u540d\u79f0\uff0c\u7a0d\u540e\u518d\u6539\u4e5f\u53ef\u4ee5\u3002'
                }
              </Text>
            </Box>
            <Box shrink="No">
              <Button
                variant="Success"
                radii="300"
                type="submit"
                disabled={creating}
                before={creating && <Spinner size="200" variant="Success" fill="Solid" />}
              >
                <Text size="B300">{'\u76f4\u63a5\u521b\u5efa'}</Text>
              </Button>
            </Box>
          </Box>
        </Box>
      </SettingTile>
      {createState.status === AsyncStatus.Error && (
        <Text size="T200" priority="300">
          {'\u521b\u5efa\u5206\u7c7b\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5\u3002'}
        </Text>
      )}
    </SequenceCard>
  );
}

export function UserPack({ onViewPack }: UserPackProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const personalPacks = useAllPersonalImagePacks();
  const defaultPackId = mx.getUserId();
  const defaultPack =
    (defaultPackId && personalPacks.find((imagePack) => imagePack.id === defaultPackId)) ||
    (defaultPackId
      ? new ImagePack(
          defaultPackId,
          {
            pack: {
              display_name: '\u9ed8\u8ba4\u5206\u7c7b',
            },
          },
          undefined
        )
      : undefined);
  const customPersonalPacks = personalPacks.filter((imagePack) => imagePack.id !== defaultPackId);
  const [removingPackId, setRemovingPackId] = useState<string>();
  const [optimisticPackOrder, setOptimisticPackOrder] = useState<string[]>();
  const [savingPackOrder, setSavingPackOrder] = useState(false);
  const [removeError, setRemoveError] = useState<string>();
  const [moveError, setMoveError] = useState<string>();
  const packOrderSaveTimerRef = useRef<number>();
  const packOrderSaveIdRef = useRef(0);

  const customPackOrder = useMemo(
    () => reconcilePackOrder(optimisticPackOrder, customPersonalPacks),
    [customPersonalPacks, optimisticPackOrder]
  );
  const orderedCustomPersonalPacks = useMemo(() => {
    const packIdToPack = new Map(customPersonalPacks.map((pack) => [pack.id, pack]));
    return customPackOrder
      .map((packId) => packIdToPack.get(packId))
      .filter((pack): pack is ImagePack => !!pack);
  }, [customPackOrder, customPersonalPacks]);

  useEffect(
    () => () => {
      if (packOrderSaveTimerRef.current) {
        window.clearTimeout(packOrderSaveTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!optimisticPackOrder || savingPackOrder) return;

    const serverOrder = getPackIds(customPersonalPacks);
    if (
      packIdListsEqual(reconcilePackOrder(optimisticPackOrder, customPersonalPacks), serverOrder)
    ) {
      setOptimisticPackOrder(undefined);
    }
  }, [customPersonalPacks, optimisticPackOrder, savingPackOrder]);

  const schedulePackOrderSave = useCallback(
    (nextCustomPackOrder: string[]) => {
      if (!defaultPackId) return;

      if (packOrderSaveTimerRef.current) {
        window.clearTimeout(packOrderSaveTimerRef.current);
      }

      const saveId = packOrderSaveIdRef.current + 1;
      packOrderSaveIdRef.current = saveId;
      setSavingPackOrder(true);
      packOrderSaveTimerRef.current = window.setTimeout(() => {
        packOrderSaveTimerRef.current = undefined;

        setPersonalPackOrder(mx, [defaultPackId, ...nextCustomPackOrder])
          .then(() => {
            if (packOrderSaveIdRef.current !== saveId) return;
            setSavingPackOrder(false);
          })
          .catch(() => {
            if (packOrderSaveIdRef.current !== saveId) return;
            setMoveError('\u5206\u7c7b\u6392\u5e8f\u4fdd\u5b58\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5\u3002');
            setOptimisticPackOrder(undefined);
            setSavingPackOrder(false);
          });
      }, PACK_ORDER_SAVE_DEBOUNCE_MS);
    },
    [defaultPackId, mx]
  );

  const handleView = useCallback(
    (imagePack?: ImagePack) => {
      if (imagePack) {
        onViewPack(imagePack);
        return;
      }

      const defaultPack = new ImagePack(
        mx.getUserId() ?? '',
        {
          pack: {
            display_name: '\u9ed8\u8ba4\u5206\u7c7b',
          },
        },
        undefined
      );
      onViewPack(defaultPack);
    },
    [mx, onViewPack]
  );

  const handleDelete = useCallback(
    async (imagePack: ImagePack) => {
      if (removingPackId || savingPackOrder) return;

      const packName = imagePack.meta.name ?? '\u672a\u547d\u540d\u5206\u7c7b';
      if (!window.confirm(`\u786e\u5b9a\u5220\u9664\u300c${packName}\u300d\u5417\uff1f`)) return;

      setRemoveError(undefined);
      setRemovingPackId(imagePack.id);

      try {
        const content = getCustomUserImagePacksContent(mx);
        const nextPacks = { ...(content.packs ?? {}) };
        delete nextPacks[imagePack.id];

        const updatedContent: UserImagePacksContent = {
          ...content,
          version: content.version ?? 1,
        };

        if (Object.keys(nextPacks).length > 0) {
          updatedContent.packs = nextPacks;
        } else {
          delete updatedContent.packs;
        }
        if (Array.isArray(content.order)) {
          updatedContent.order = content.order.filter((packId) => packId !== imagePack.id);
        }

        await setCustomUserImagePacksContent(mx, updatedContent);
      } catch {
        setRemoveError('\u5220\u9664\u5206\u7c7b\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5\u3002');
      } finally {
        setRemovingPackId(undefined);
      }
    },
    [mx, removingPackId, savingPackOrder]
  );

  const handleMove = useCallback(
    (imagePack: ImagePack, direction: 'up' | 'down') => {
      if (!defaultPackId || removingPackId) return;

      const sourceIndex = customPackOrder.findIndex((packId) => packId === imagePack.id);
      if (sourceIndex < 0) return;

      const targetIndex = direction === 'up' ? sourceIndex - 1 : sourceIndex + 1;
      if (targetIndex < 0 || targetIndex >= customPackOrder.length) return;

      setMoveError(undefined);
      const nextCustomPackOrder = movePackId(customPackOrder, sourceIndex, targetIndex);
      setOptimisticPackOrder(nextCustomPackOrder);
      schedulePackOrderSave(nextCustomPackOrder);
    },
    [customPackOrder, defaultPackId, removingPackId, schedulePackOrderSave]
  );

  const renderPack = (imagePack: ImagePack, isDefault = false, index = -1, total = 0) => {
    const avatarMxc = imagePack.getAvatarUrl(ImageUsage.Emoticon);
    const avatarUrl = avatarMxc ? mxcUrlToHttp(mx, avatarMxc, useAuthentication) : undefined;
    const description =
      imagePack.meta.attribution ??
      (isDefault
        ? '\u8fd9\u662f\u4f60\u7684\u9ed8\u8ba4\u4e2a\u4eba\u5206\u7c7b\uff0c\u4f1a\u4f18\u5148\u51fa\u73b0\u5728\u8868\u60c5\u9762\u677f\u4e2d\u3002'
        : '\u8fd9\u662f\u4f60\u81ea\u5df1\u65b0\u5efa\u7684\u4e2a\u4eba\u5206\u7c7b\uff0c\u53ef\u4ee5\u5355\u72ec\u6574\u7406\u4e0d\u540c\u4e3b\u9898\u7684\u8868\u60c5\u3002');

    return (
      <SequenceCard
        key={imagePack.id}
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title={
            imagePack.meta.name ??
            (isDefault ? '\u9ed8\u8ba4\u5206\u7c7b' : '\u672a\u547d\u540d\u5206\u7c7b')
          }
          description={<span className={LineClamp2}>{description}</span>}
          before={
            <Avatar size="300" radii="300">
              {avatarUrl ? (
                <AvatarImage style={{ objectFit: 'contain' }} src={avatarUrl} />
              ) : (
                <AvatarFallback>
                  <Icon size="400" src={Icons.Sticker} filled />
                </AvatarFallback>
              )}
            </Avatar>
          }
          after={
            <Box gap="200">
              {!isDefault && (
                <>
                  <IconButton
                    size="300"
                    radii="300"
                    variant="Secondary"
                    onClick={() => handleMove(imagePack, 'up')}
                    disabled={!!removingPackId || index <= 0}
                    title={'\u4e0a\u79fb'}
                  >
                    <Icon src={Icons.ChevronTop} size="100" />
                  </IconButton>
                  <IconButton
                    size="300"
                    radii="300"
                    variant="Secondary"
                    onClick={() => handleMove(imagePack, 'down')}
                    disabled={!!removingPackId || index < 0 || index >= total - 1}
                    title={'\u4e0b\u79fb'}
                  >
                    <Icon src={Icons.ChevronBottom} size="100" />
                  </IconButton>
                  <IconButton
                    size="300"
                    radii="300"
                    variant="Secondary"
                    onClick={() => handleDelete(imagePack)}
                    disabled={removingPackId === imagePack.id || savingPackOrder}
                    title={'\u5220\u9664'}
                  >
                    {removingPackId === imagePack.id ? (
                      <Spinner size="100" />
                    ) : (
                      <Icon src={Icons.Delete} size="100" />
                    )}
                  </IconButton>
                </>
              )}
              <Button
                variant="Secondary"
                fill="Soft"
                size="300"
                radii="300"
                outlined
                onClick={() => handleView(imagePack)}
              >
                <Text size="B300">
                  {isDefault ? '\u7ba1\u7406\u9ed8\u8ba4\u5206\u7c7b' : '\u7ba1\u7406\u5206\u7c7b'}
                </Text>
              </Button>
            </Box>
          }
        />
      </SequenceCard>
    );
  };

  return (
    <Box direction="Column" gap="400">
      <CreatePersonalPackTile onViewPack={onViewPack} />
      <Box direction="Column" gap="100">
        <Text size="L400">{'\u4e2a\u4eba\u5206\u7c7b'}</Text>
        {defaultPack && renderPack(defaultPack, true)}
        {orderedCustomPersonalPacks.map((imagePack, index) =>
          renderPack(imagePack, false, index, orderedCustomPersonalPacks.length)
        )}
        {customPersonalPacks.length === 0 && (
          <SequenceCard
            className={SequenceCardStyle}
            variant="SurfaceVariant"
            direction="Column"
            gap="400"
          >
            <SettingTile
              title={'\u6682\u65e0\u81ea\u5b9a\u4e49\u5206\u7c7b'}
              description={
                '\u4f60\u76ee\u524d\u53ea\u6709\u4e00\u4e2a\u9ed8\u8ba4\u5206\u7c7b\uff0c\u53ef\u4ee5\u901a\u8fc7\u4e0a\u65b9\u7684\u201c\u65b0\u5efa\u4e2a\u4eba\u5206\u7c7b\u201d\u6309\u94ae\u518d\u521b\u5efa\u66f4\u591a\u5206\u7c7b\u3002'
              }
            />
          </SequenceCard>
        )}
        {removeError && (
          <Text size="T200" priority="300">
            {removeError}
          </Text>
        )}
        {moveError && (
          <Text size="T200" priority="300">
            {moveError}
          </Text>
        )}
      </Box>
    </Box>
  );
}
