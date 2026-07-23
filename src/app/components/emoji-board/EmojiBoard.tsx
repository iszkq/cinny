import React, {
  ChangeEventHandler,
  FocusEventHandler,
  MouseEventHandler,
  ReactNode,
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Badge, Box, Button, config, Icon, Icons, Scroll, Spinner, Text } from 'folds';
import FocusTrap from 'focus-trap-react';
import { isKeyHotkey } from 'is-hotkey';
import { Room } from 'matrix-js-sdk';
import { atom, PrimitiveAtom, useAtom, useSetAtom } from 'jotai';
import { useVirtualizer } from '@tanstack/react-virtual';
import { IImageInfo } from '../../../types/matrix/common';
import { IEmoji, emojiGroups, emojis } from '../../plugins/emoji';
import { useEmojiGroupLabels } from './useEmojiGroupLabels';
import { useEmojiGroupIcons } from './useEmojiGroupIcons';
import { preventScrollWithArrowKey, stopPropagation } from '../../utils/keyboard';
import {
  useAllPersonalImagePacks,
  usePersonalImagePacks,
  useRelevantImagePacks,
} from '../../hooks/useImagePacks';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useRecentEmoji } from '../../hooks/useRecentEmoji';
import { editableActiveElement, targetFromEvent } from '../../utils/dom';
import { useAsyncSearch, UseAsyncSearchOptions } from '../../hooks/useAsyncSearch';
import { useDebounce } from '../../hooks/useDebounce';
import { useThrottle } from '../../hooks/useThrottle';
import { addRecentEmoji } from '../../plugins/recent-emoji';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import {
  ImagePack,
  ImageUsage,
  PackImageReader,
  setPersonalPackOrder,
} from '../../plugins/custom-emoji';
import { getEmoticonSearchStr } from '../../plugins/utils';
import {
  primeDesktopMediaAssetUrl,
  warmDesktopMediaAssetCache,
} from '../../utils/desktopMediaAssetCache';
import { isDesktopUpdaterSupported } from '../../utils/desktopUpdater';
import {
  SearchInput,
  EmojiBoardTabs,
  SidebarStack,
  SidebarDivider,
  Sidebar,
  NoStickerPacks,
  createPreviewDataAtom,
  Preview,
  PreviewData,
  EmojiItem,
  StickerItem,
  CustomEmojiItem,
  ImageGroupIcon,
  GroupIcon,
  getEmojiItemInfo,
  EmojiGroup,
  EmojiBoardLayout,
} from './components';
import * as css from './components/styles.css';
import { CloudSendMode, EmojiBoardTab, EmojiType } from './types';
import { VirtualTile } from '../virtualizer';
import { getEmojiBoardMediaCandidates, getEmojiBoardMediaUrls } from './components/media';
import {
  getRemoteStickerPackId,
  getRemoteStickerPackName,
  getRemoteStickerPreviewUrl,
  useRemoteStickerIndex,
} from './useRemoteStickerIndex';
import { isHttpUrl } from '../../utils/matrix';

const RECENT_GROUP_ID = 'recent_group';
const SEARCH_GROUP_ID = 'search_group';
const PRIORITY_PACK_PRELOAD_COUNT = 4;
const PRIORITY_PACK_VISIBLE_URL_LIMIT = 160;
const WEB_PRIORITY_PACK_PRELOAD_COUNT = 2;
const WEB_PRIORITY_PACK_VISIBLE_URL_LIMIT = 96;

type ImagePackMode = 'contextual' | 'personal';

type EmojiGroupItem = {
  id: string;
  name: string;
  items: Array<IEmoji | PackImageReader>;
};
type StickerGroupItem = {
  id: string;
  name: string;
  items: Array<PackImageReader>;
};

type PackDropPosition = 'before' | 'after';

type PersonalPackDropTarget = {
  packId: string;
  position: PackDropPosition;
};

const getRemoteStickerGroups = (remoteStickerImages: PackImageReader[]): StickerGroupItem[] => {
  const remoteGroups = new Map<string, StickerGroupItem>();

  remoteStickerImages.forEach((image) => {
    const packId = getRemoteStickerPackId(image) ?? 'remote';
    const packName = getRemoteStickerPackName(image) ?? '\u4e91\u7aef';
    const groupId = `remote:${packId}`;
    const group = remoteGroups.get(groupId);
    if (group) {
      group.items.push(image);
      return;
    }
    remoteGroups.set(groupId, {
      id: groupId,
      name: packName,
      items: [image],
    });
  });

  return Array.from(remoteGroups.values());
};

const useGroups = (
  tab: EmojiBoardTab,
  imagePacks: ImagePack[],
  remoteStickerImages: PackImageReader[]
): [EmojiGroupItem[], StickerGroupItem[], StickerGroupItem[]] => {
  const mx = useMatrixClient();

  const recentEmojis = useRecentEmoji(mx, 21);
  const labels = useEmojiGroupLabels();

  const emojiGroupItems = useMemo(() => {
    const g: EmojiGroupItem[] = [];
    if (tab !== EmojiBoardTab.Emoji) return g;

    g.push({
      id: RECENT_GROUP_ID,
      name: '最近',
      items: recentEmojis,
    });

    imagePacks.forEach((pack) => {
      let label = pack.meta.name;
      if (!label) label = !pack.address ? '\u4e2a\u4eba\u5206\u7c7b' : mx.getRoom(pack.id)?.name;

      g.push({
        id: pack.id,
        name: label ?? 'Unknown',
        items: pack.getImages(ImageUsage.Emoticon),
      });
    });

    emojiGroups.forEach((group) => {
      g.push({
        id: group.id,
        name: labels[group.id],
        items: group.emojis,
      });
    });

    return g;
  }, [mx, recentEmojis, labels, imagePacks, tab]);

  const stickerGroupItems = useMemo(() => {
    const g: StickerGroupItem[] = [];
    if (tab !== EmojiBoardTab.Sticker) return g;

    imagePacks.forEach((pack) => {
      let label = pack.meta.name;
      if (!label) label = !pack.address ? '\u4e2a\u4eba\u5206\u7c7b' : mx.getRoom(pack.id)?.name;

      g.push({
        id: pack.id,
        name: label ?? 'Unknown',
        items: pack.getImages(ImageUsage.Sticker),
      });
    });

    return g;
  }, [mx, imagePacks, tab]);

  const cloudGroupItems = useMemo(
    () => getRemoteStickerGroups(remoteStickerImages),
    [remoteStickerImages]
  );

  return [emojiGroupItems, stickerGroupItems, cloudGroupItems];
};

const useItemRenderer = (usage: ImageUsage) => {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const renderItem = (emoji: IEmoji | PackImageReader, index: number) => {
    if ('unicode' in emoji) {
      return <EmojiItem key={emoji.unicode + index} emoji={emoji} />;
    }
    if (usage === ImageUsage.Sticker) {
      return (
        <StickerItem
          key={emoji.shortcode + index}
          mx={mx}
          useAuthentication={useAuthentication}
          image={emoji}
        />
      );
    }
    return (
      <CustomEmojiItem
        key={emoji.shortcode + index}
        mx={mx}
        useAuthentication={useAuthentication}
        image={emoji}
      />
    );
  };

  return renderItem;
};

type EmojiSidebarProps = {
  activeGroupAtom: PrimitiveAtom<string | undefined>;
  packs: ImagePack[];
  onScrollToGroup: (groupId: string) => void;
  draggingPackId?: string;
  dropTarget?: PersonalPackDropTarget;
  reorderEnabled?: boolean;
  onPackDragStart?: (packId: string, evt: React.DragEvent<HTMLDivElement>) => void;
  onPackDragOver?: (packId: string, evt: React.DragEvent<HTMLDivElement>) => void;
  onPackDrop?: (packId: string, evt: React.DragEvent<HTMLDivElement>) => void;
  onPackDragEnd?: () => void;
};
type PersonalPackSidebarItemProps = {
  active: boolean;
  pack: ImagePack;
  label: string;
  url?: string;
  fallbackUrl?: string;
  reorderEnabled: boolean;
  draggingPackId?: string;
  dropTarget?: PersonalPackDropTarget;
  onClick: (id: string) => void;
  onDragStart?: (packId: string, evt: React.DragEvent<HTMLDivElement>) => void;
  onDragOver?: (packId: string, evt: React.DragEvent<HTMLDivElement>) => void;
  onDrop?: (packId: string, evt: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
};

function PersonalPackSidebarItem({
  active,
  pack,
  label,
  url,
  fallbackUrl,
  reorderEnabled,
  draggingPackId,
  dropTarget,
  onClick,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: PersonalPackSidebarItemProps) {
  const dragging = draggingPackId === pack.id;
  const dropAbove = dropTarget?.packId === pack.id && dropTarget.position === 'before';
  const dropBelow = dropTarget?.packId === pack.id && dropTarget.position === 'after';

  return (
    <div
      className={css.SortablePackItem}
      draggable={reorderEnabled}
      data-dragging={dragging || undefined}
      data-drop-above={dropAbove || undefined}
      data-drop-below={dropBelow || undefined}
      onDragStart={reorderEnabled && onDragStart ? (evt) => onDragStart(pack.id, evt) : undefined}
      onDragOver={reorderEnabled && onDragOver ? (evt) => onDragOver(pack.id, evt) : undefined}
      onDrop={reorderEnabled && onDrop ? (evt) => onDrop(pack.id, evt) : undefined}
      onDragEnd={reorderEnabled ? onDragEnd : undefined}
    >
      <ImageGroupIcon
        active={active}
        id={pack.id}
        label={label}
        url={url}
        fallbackUrl={fallbackUrl}
        onClick={onClick}
      />
    </div>
  );
}

function EmojiSidebar({
  activeGroupAtom,
  packs,
  onScrollToGroup,
  draggingPackId,
  dropTarget,
  reorderEnabled = false,
  onPackDragStart,
  onPackDragOver,
  onPackDrop,
  onPackDragEnd,
}: EmojiSidebarProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const [activeGroupId, setActiveGroupId] = useAtom(activeGroupAtom);
  const usage = ImageUsage.Emoticon;
  const labels = useEmojiGroupLabels();
  const icons = useEmojiGroupIcons();

  const handleScrollToGroup = (groupId: string) => {
    setActiveGroupId(groupId);
    onScrollToGroup(groupId);
  };

  return (
    <Sidebar>
      <SidebarStack>
        <GroupIcon
          active={activeGroupId === RECENT_GROUP_ID}
          id={RECENT_GROUP_ID}
          label="Recent"
          icon={Icons.RecentClock}
          onClick={handleScrollToGroup}
        />
      </SidebarStack>
      {packs.length > 0 && (
        <SidebarStack>
          <SidebarDivider />
          {packs.map((pack) => {
            let label = pack.meta.name;
            if (!label)
              label = !pack.address ? '\u4e2a\u4eba\u5206\u7c7b' : mx.getRoom(pack.id)?.name;

            const avatarUrl = pack.meta.avatar
              ? getEmojiBoardMediaUrls({
                  mx,
                  mxc: pack.meta.avatar,
                  useAuthentication,
                  width: 64,
                  height: 64,
                }).primaryUrl
              : undefined;
            const firstImage = pack.getImages(usage)[0];
            const { primaryUrl: fallbackUrl, fallbackUrl: fallbackOriginalUrl } =
              getEmojiBoardMediaUrls({
                mx,
                mxc: firstImage?.url,
                useAuthentication,
                info: firstImage?.info,
                width: 64,
                height: 64,
              });

            return (
              <PersonalPackSidebarItem
                key={pack.id}
                active={activeGroupId === pack.id}
                pack={pack}
                label={label ?? 'Unknown Pack'}
                url={avatarUrl ?? fallbackUrl}
                fallbackUrl={avatarUrl ? fallbackUrl ?? fallbackOriginalUrl : fallbackOriginalUrl}
                reorderEnabled={reorderEnabled}
                draggingPackId={draggingPackId}
                dropTarget={dropTarget}
                onClick={handleScrollToGroup}
                onDragStart={onPackDragStart}
                onDragOver={onPackDragOver}
                onDrop={onPackDrop}
                onDragEnd={onPackDragEnd}
              />
            );
          })}
        </SidebarStack>
      )}
      <SidebarStack
        style={{
          position: 'sticky',
          bottom: '-67%',
          zIndex: 1,
        }}
      >
        <SidebarDivider />
        {emojiGroups.map((group) => (
          <GroupIcon
            key={group.id}
            active={activeGroupId === group.id}
            id={group.id}
            label={labels[group.id]}
            icon={icons[group.id]}
            onClick={handleScrollToGroup}
          />
        ))}
      </SidebarStack>
    </Sidebar>
  );
}

type StickerSidebarProps = {
  activeGroupAtom: PrimitiveAtom<string | undefined>;
  packs: ImagePack[];
  onScrollToGroup: (groupId: string) => void;
  draggingPackId?: string;
  dropTarget?: PersonalPackDropTarget;
  reorderEnabled?: boolean;
  onPackDragStart?: (packId: string, evt: React.DragEvent<HTMLDivElement>) => void;
  onPackDragOver?: (packId: string, evt: React.DragEvent<HTMLDivElement>) => void;
  onPackDrop?: (packId: string, evt: React.DragEvent<HTMLDivElement>) => void;
  onPackDragEnd?: () => void;
};
function StickerSidebar({
  activeGroupAtom,
  packs,
  onScrollToGroup,
  draggingPackId,
  dropTarget,
  reorderEnabled = false,
  onPackDragStart,
  onPackDragOver,
  onPackDrop,
  onPackDragEnd,
}: StickerSidebarProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const [activeGroupId, setActiveGroupId] = useAtom(activeGroupAtom);
  const usage = ImageUsage.Sticker;

  const handleScrollToGroup = (groupId: string) => {
    setActiveGroupId(groupId);
    onScrollToGroup(groupId);
  };

  return (
    <Sidebar>
      <SidebarStack>
        {packs.map((pack) => {
          let label = pack.meta.name;
          if (!label)
            label = !pack.address ? '\u4e2a\u4eba\u5206\u7c7b' : mx.getRoom(pack.id)?.name;

          const avatarUrl = pack.meta.avatar
            ? getEmojiBoardMediaUrls({
                mx,
                mxc: pack.meta.avatar,
                useAuthentication,
                width: 64,
                height: 64,
              }).primaryUrl
            : undefined;
          const firstImage = pack.getImages(usage)[0];
          const { primaryUrl: fallbackUrl, fallbackUrl: fallbackOriginalUrl } =
            getEmojiBoardMediaUrls({
              mx,
              mxc: firstImage?.url,
              useAuthentication,
              info: firstImage?.info,
              width: 64,
              height: 64,
              preferOriginal: true,
            });

          return (
            <PersonalPackSidebarItem
              key={pack.id}
              active={activeGroupId === pack.id}
              pack={pack}
              label={label ?? 'Unknown Pack'}
              url={avatarUrl ?? fallbackUrl}
              fallbackUrl={avatarUrl ? fallbackUrl ?? fallbackOriginalUrl : fallbackOriginalUrl}
              reorderEnabled={reorderEnabled}
              draggingPackId={draggingPackId}
              dropTarget={dropTarget}
              onClick={handleScrollToGroup}
              onDragStart={onPackDragStart}
              onDragOver={onPackDragOver}
              onDrop={onPackDrop}
              onDragEnd={onPackDragEnd}
            />
          );
        })}
      </SidebarStack>
    </Sidebar>
  );
}

type RemoteStickerSidebarProps = {
  activeGroupAtom: PrimitiveAtom<string | undefined>;
  groups: StickerGroupItem[];
  onScrollToGroup: (groupId: string) => void;
};
function RemoteStickerSidebar({
  activeGroupAtom,
  groups,
  onScrollToGroup,
}: RemoteStickerSidebarProps) {
  const [activeGroupId, setActiveGroupId] = useAtom(activeGroupAtom);

  const handleScrollToGroup = (groupId: string) => {
    setActiveGroupId(groupId);
    onScrollToGroup(groupId);
  };

  return (
    <Sidebar>
      <SidebarStack>
        {groups.map((group) => {
          const firstImage = group.items[0];
          const previewUrl = firstImage
            ? getRemoteStickerPreviewUrl(firstImage) ?? firstImage.url
            : undefined;

          return (
            <ImageGroupIcon
              key={group.id}
              active={activeGroupId === group.id}
              id={group.id}
              label={group.name}
              url={previewUrl}
              onClick={handleScrollToGroup}
            />
          );
        })}
      </SidebarStack>
    </Sidebar>
  );
}

type RemoteStickerStatusProps = {
  loading: boolean;
  error?: string;
  onRetry: () => void;
};
function RemoteStickerStatus({ loading, error, onRetry }: RemoteStickerStatusProps) {
  let title = '暂无云端表情包';
  if (loading) title = '正在加载云端表情包';
  else if (error) title = '云端表情包加载失败';

  return (
    <Box
      style={{ padding: `${config.space.S700} ${config.space.S500}` }}
      alignItems="Center"
      justifyContent="Center"
      direction="Column"
      gap="300"
    >
      {loading ? <Spinner size="400" /> : <Icon size="600" src={Icons.Sticker} />}
      <Box direction="Column" alignItems="Center" gap="100" style={{ maxWidth: '100%' }}>
        <Text align="Center">{title}</Text>
        {error && (
          <Text
            priority="300"
            align="Center"
            size="T200"
            style={{ maxWidth: '100%', wordBreak: 'break-word' }}
          >
            {error}
          </Text>
        )}
      </Box>
      {error && (
        <Button size="300" variant="Secondary" radii="300" onClick={onRetry}>
          <Text size="B300">重试</Text>
        </Button>
      )}
    </Box>
  );
}

type EmojiGroupHolderProps = {
  contentScrollRef: RefObject<HTMLDivElement>;
  previewAtom: PrimitiveAtom<PreviewData | undefined>;
  children?: ReactNode;
  onGroupItemClick: MouseEventHandler;
};
function EmojiGroupHolder({
  contentScrollRef,
  previewAtom,
  onGroupItemClick,
  children,
}: EmojiGroupHolderProps) {
  const setPreviewData = useSetAtom(previewAtom);

  const handleEmojiPreview = useCallback(
    (element: HTMLButtonElement) => {
      const emojiInfo = getEmojiItemInfo(element);
      if (!emojiInfo) return;

      setPreviewData({
        key: emojiInfo.previewUrl ?? emojiInfo.data,
        shortcode: emojiInfo.shortcode,
        info: emojiInfo.info,
        preferOriginal: emojiInfo.type === EmojiType.Sticker,
      });
    },
    [setPreviewData]
  );

  const throttleEmojiHover = useThrottle(handleEmojiPreview, {
    wait: 200,
    immediate: true,
  });

  const handleEmojiHover: MouseEventHandler = (evt) => {
    const targetEl = targetFromEvent(evt.nativeEvent, 'button') as HTMLButtonElement | undefined;
    if (!targetEl) return;
    throttleEmojiHover(targetEl);
  };

  const handleEmojiFocus: FocusEventHandler = (evt) => {
    const targetEl = evt.target as HTMLButtonElement;
    handleEmojiPreview(targetEl);
  };

  return (
    <Scroll ref={contentScrollRef} size="400" onKeyDown={preventScrollWithArrowKey} hideTrack>
      <Box
        onClick={onGroupItemClick}
        onMouseMove={handleEmojiHover}
        onFocus={handleEmojiFocus}
        direction="Column"
      >
        {children}
      </Box>
    </Scroll>
  );
}

const DefaultEmojiPreview: PreviewData = { key: '🙂', shortcode: 'slight_smile' };

const SEARCH_OPTIONS: UseAsyncSearchOptions = {
  limit: 1000,
  matchOptions: {
    contain: true,
  },
};

const VIRTUAL_OVER_SCAN = 2;

type EmojiBoardProps = {
  tab?: EmojiBoardTab;
  onTabChange?: (tab: EmojiBoardTab) => void;
  imagePackRooms: Room[];
  imagePackMode?: ImagePackMode;
  requestClose: () => void;
  returnFocusOnDeactivate?: boolean;
  closeOnOutsideClick?: boolean;
  onEmojiSelect?: (unicode: string, shortcode: string) => void;
  onCustomEmojiSelect?: (mxc: string, shortcode: string) => void;
  onCloudEmojiSelect?: (url: string, shortcode: string, info?: IImageInfo) => void;
  onStickerSelect?: (mxc: string, label: string, info?: IImageInfo) => void;
  cloudAutoSendMode?: CloudSendMode.Emoji | CloudSendMode.Sticker;
  allowTextCustomEmoji?: boolean;
  addToRecentEmoji?: boolean;
};

export function EmojiBoard({
  tab = EmojiBoardTab.Emoji,
  onTabChange,
  imagePackRooms,
  imagePackMode = 'contextual',
  requestClose,
  returnFocusOnDeactivate,
  closeOnOutsideClick = true,
  onEmojiSelect,
  onCustomEmojiSelect,
  onCloudEmojiSelect,
  onStickerSelect,
  cloudAutoSendMode = CloudSendMode.Sticker,
  allowTextCustomEmoji,
  addToRecentEmoji = true,
}: EmojiBoardProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const desktopSupported = isDesktopUpdaterSupported();

  const emojiTab = tab === EmojiBoardTab.Emoji;
  const cloudTab = tab === EmojiBoardTab.Cloud;
  const [cloudSendMode, setCloudSendMode] = useState(CloudSendMode.Auto);
  const effectiveCloudSendMode =
    cloudSendMode === CloudSendMode.Auto ? cloudAutoSendMode : cloudSendMode;
  const cloudUsage =
    effectiveCloudSendMode === CloudSendMode.Emoji ? ImageUsage.Emoticon : ImageUsage.Sticker;
  let usage = ImageUsage.Sticker;
  if (cloudTab) usage = cloudUsage;
  else if (emojiTab) usage = ImageUsage.Emoticon;
  const priorityPackPreloadCount = desktopSupported
    ? PRIORITY_PACK_PRELOAD_COUNT
    : WEB_PRIORITY_PACK_PRELOAD_COUNT;
  const priorityPackVisibleUrlLimit = desktopSupported
    ? PRIORITY_PACK_VISIBLE_URL_LIMIT
    : WEB_PRIORITY_PACK_VISIBLE_URL_LIMIT;

  const previewAtom = useMemo(
    () =>
      createPreviewDataAtom(
        emojiTab && usage === ImageUsage.Emoticon ? DefaultEmojiPreview : undefined
      ),
    [emojiTab, usage]
  );
  const activeGroupIdAtom = useMemo(() => atom<string | undefined>(undefined), []);
  const [activeGroupId, setActiveGroupId] = useAtom(activeGroupIdAtom);
  const contextualImagePacks = useRelevantImagePacks(usage, imagePackRooms);
  const allPersonalImagePacks = useAllPersonalImagePacks();
  const personalImagePacks = usePersonalImagePacks(usage);
  const imagePacks = imagePackMode === 'personal' ? personalImagePacks : contextualImagePacks;
  const [draggingPackId, setDraggingPackId] = useState<string>();
  const [packDropTarget, setPackDropTarget] = useState<PersonalPackDropTarget>();
  const [searchTerm, setSearchTerm] = useState('');
  const {
    stickers: remoteStickerImages,
    loading: remoteStickerLoading,
    error: remoteStickerError,
    retry: retryRemoteStickers,
  } = useRemoteStickerIndex(cloudTab);
  const [emojiGroupItems, stickerGroupItems, cloudGroupItems] = useGroups(
    tab,
    imagePacks,
    remoteStickerImages
  );
  let groups: EmojiGroupItem[] = stickerGroupItems;
  if (cloudTab) groups = cloudGroupItems;
  else if (emojiTab) groups = emojiGroupItems;
  const renderItem = useItemRenderer(usage);

  const searchList = useMemo(() => {
    let list: Array<PackImageReader | IEmoji> = [];
    if (cloudTab) {
      return list.concat(remoteStickerImages);
    }
    list = list.concat(imagePacks.flatMap((pack) => pack.getImages(usage)));
    if (emojiTab) list = list.concat(emojis);
    return list;
  }, [cloudTab, emojiTab, usage, imagePacks, remoteStickerImages]);

  const [result, search, resetSearch] = useAsyncSearch(
    searchList,
    getEmoticonSearchStr,
    SEARCH_OPTIONS
  );

  const searchedItems = result?.items.slice(0, 100);
  let searchResultLabel = '没有结果';
  if (searchedItems?.length) searchResultLabel = '搜索结果';

  const getPackMediaUrls = useCallback(
    (pack: ImagePack) => {
      const size = usage === ImageUsage.Sticker ? 256 : 64;
      const mediaUrls = new Set<string>();
      const avatarMxc = pack.getAvatarUrl(usage);

      if (avatarMxc) {
        getEmojiBoardMediaCandidates({
          mx,
          mxc: avatarMxc,
          useAuthentication,
          width: 64,
          height: 64,
        }).forEach((url) => {
          mediaUrls.add(url);
        });
      }

      pack.getImages(usage).forEach((image) => {
        getEmojiBoardMediaCandidates({
          mx,
          mxc: image.url,
          useAuthentication,
          info: image.info,
          width: size,
          height: size,
          preferOriginal: usage === ImageUsage.Sticker,
        }).forEach((url) => {
          mediaUrls.add(url);
        });
      });

      return Array.from(mediaUrls);
    },
    [mx, usage, useAuthentication]
  );

  const priorityPacks = useMemo(() => {
    if (cloudTab) {
      return [];
    }

    const packs: ImagePack[] = [];
    const pushPack = (pack: ImagePack | undefined) => {
      if (!pack || packs.find((item) => item.id === pack.id)) {
        return;
      }
      packs.push(pack);
    };

    pushPack(imagePacks.find((pack) => pack.id === activeGroupId));
    imagePacks.slice(0, priorityPackPreloadCount).forEach(pushPack);

    return packs;
  }, [activeGroupId, cloudTab, imagePacks, priorityPackPreloadCount]);

  const handleOnChange: ChangeEventHandler<HTMLInputElement> = useDebounce(
    useCallback((evt) => {
      setSearchTerm(evt.target.value);
    }, []),
    { wait: 200 }
  );

  useEffect(() => {
    if (searchTerm) search(searchTerm);
    else resetSearch();
  }, [resetSearch, search, searchTerm]);

  useEffect(() => {
    setSearchTerm('');
  }, [tab]);

  const contentScrollRef = useRef<HTMLDivElement>(null);
  const virtualBaseRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: groups.length,
    getScrollElement: () => contentScrollRef.current,
    estimateSize: () => 40,
    overscan: VIRTUAL_OVER_SCAN,
  });
  const vItems = virtualizer.getVirtualItems();

  const handleGroupItemClick: MouseEventHandler = (evt) => {
    const targetEl = targetFromEvent(evt.nativeEvent, 'button');
    const emojiInfo = targetEl && getEmojiItemInfo(targetEl);
    if (!emojiInfo) return;

    if (emojiInfo.type === EmojiType.Emoji) {
      onEmojiSelect?.(emojiInfo.data, emojiInfo.shortcode);
      if (!evt.altKey && !evt.shiftKey && addToRecentEmoji) {
        addRecentEmoji(mx, emojiInfo.data);
      }
    }
    if (emojiInfo.type === EmojiType.CustomEmoji) {
      if (cloudTab || isHttpUrl(emojiInfo.data)) {
        onCloudEmojiSelect?.(emojiInfo.data, emojiInfo.shortcode, emojiInfo.info);
      } else {
        onCustomEmojiSelect?.(emojiInfo.data, emojiInfo.shortcode);
      }
    }
    if (emojiInfo.type === EmojiType.Sticker) {
      onStickerSelect?.(emojiInfo.data, emojiInfo.label, emojiInfo.info);
    }
  };

  const handleTextCustomEmojiSelect = (textEmoji: string) => {
    onCustomEmojiSelect?.(textEmoji, textEmoji);
  };

  const resetPackDragState = useCallback(() => {
    setDraggingPackId(undefined);
    setPackDropTarget(undefined);
  }, []);

  const handlePersonalPackReorder = useCallback(
    (sourceId: string, targetId: string, position: PackDropPosition) => {
      const currentOrder = allPersonalImagePacks.map((pack) => pack.id);
      const sourceIndex = currentOrder.indexOf(sourceId);
      const targetIndex = currentOrder.indexOf(targetId);

      if (sourceIndex < 0 || targetIndex < 0 || sourceId === targetId) {
        return;
      }

      const nextOrder = [...currentOrder];
      nextOrder.splice(sourceIndex, 1);

      const nextTargetIndex = nextOrder.indexOf(targetId);
      nextOrder.splice(position === 'after' ? nextTargetIndex + 1 : nextTargetIndex, 0, sourceId);

      if (nextOrder.every((packId, index) => packId === currentOrder[index])) {
        return;
      }

      setPersonalPackOrder(mx, nextOrder).catch(() => undefined);
    },
    [allPersonalImagePacks, mx]
  );

  const handlePackDragStart = useCallback(
    (packId: string, evt: React.DragEvent<HTMLDivElement>) => {
      setDraggingPackId(packId);
      setPackDropTarget(undefined);
      const { dataTransfer } = evt;
      dataTransfer.effectAllowed = 'move';
      dataTransfer.setData('text/plain', packId);
    },
    []
  );

  const handlePackDragOver = useCallback(
    (packId: string, evt: React.DragEvent<HTMLDivElement>) => {
      const sourceId = draggingPackId ?? evt.dataTransfer.getData('text/plain');
      if (!sourceId || sourceId === packId) {
        return;
      }

      evt.preventDefault();
      const { dataTransfer } = evt;
      dataTransfer.dropEffect = 'move';

      const { top, height } = evt.currentTarget.getBoundingClientRect();
      const position: PackDropPosition = evt.clientY < top + height / 2 ? 'before' : 'after';

      setPackDropTarget((current) =>
        current?.packId === packId && current.position === position ? current : { packId, position }
      );
    },
    [draggingPackId]
  );

  const handlePackDrop = useCallback(
    (packId: string, evt: React.DragEvent<HTMLDivElement>) => {
      evt.preventDefault();

      const sourceId = draggingPackId ?? evt.dataTransfer.getData('text/plain');
      const { top, height } = evt.currentTarget.getBoundingClientRect();
      const position: PackDropPosition = evt.clientY < top + height / 2 ? 'before' : 'after';

      resetPackDragState();

      if (!sourceId || sourceId === packId) {
        return;
      }

      handlePersonalPackReorder(sourceId, packId, position);
    },
    [draggingPackId, handlePersonalPackReorder, resetPackDragState]
  );

  const handleScrollToGroup = (groupId: string) => {
    const groupIndex = groups.findIndex((group) => group.id === groupId);
    virtualizer.scrollToIndex(groupIndex, { align: 'start' });
  };

  useEffect(() => {
    if (!desktopSupported || priorityPacks.length === 0) {
      return undefined;
    }

    let disposed = false;
    const preloadTimer = window.setTimeout(() => {
      if (disposed) {
        return;
      }

      priorityPacks.forEach((pack, packIndex) => {
        getPackMediaUrls(pack).forEach((mediaUrl, mediaIndex) => {
          const priority =
            packIndex === 0 && mediaIndex < priorityPackVisibleUrlLimit ? 'visible' : 'background';

          if (priority === 'visible') {
            primeDesktopMediaAssetUrl(mediaUrl, priority)?.catch(() => undefined);
          } else {
            warmDesktopMediaAssetCache(mediaUrl)?.catch(() => undefined);
          }
        });
      });
    }, 0);

    return () => {
      disposed = true;
      window.clearTimeout(preloadTimer);
    };
  }, [desktopSupported, getPackMediaUrls, priorityPackVisibleUrlLimit, priorityPacks]);

  // sync active sidebar tab with scroll
  useEffect(() => {
    const scrollElement = contentScrollRef.current;
    if (scrollElement) {
      const scrollTop = scrollElement.offsetTop + scrollElement.scrollTop;
      const offsetTop = virtualBaseRef.current?.offsetTop ?? 0;
      const inViewVItem = vItems.find((vItem) => scrollTop < offsetTop + vItem.end);

      const group = inViewVItem ? groups[inViewVItem?.index] : undefined;
      setActiveGroupId(group?.id);
    }
  }, [vItems, groups, setActiveGroupId, result?.query]);

  // reset scroll position on search
  useEffect(() => {
    const scrollElement = contentScrollRef.current;
    if (scrollElement) {
      scrollElement.scrollTo({ top: 0 });
    }
  }, [result?.query]);

  // reset scroll position on tab change
  useEffect(() => {
    if (groups.length > 0) {
      virtualizer.scrollToIndex(0, { align: 'start' });
    }
  }, [tab, virtualizer, groups]);

  let sidebar: ReactNode;
  if (cloudTab) {
    sidebar = (
      <RemoteStickerSidebar
        activeGroupAtom={activeGroupIdAtom}
        groups={cloudGroupItems}
        onScrollToGroup={handleScrollToGroup}
      />
    );
  } else if (emojiTab) {
    sidebar = (
      <EmojiSidebar
        activeGroupAtom={activeGroupIdAtom}
        packs={imagePacks}
        onScrollToGroup={handleScrollToGroup}
        reorderEnabled={imagePackMode === 'personal'}
        draggingPackId={draggingPackId}
        dropTarget={packDropTarget}
        onPackDragStart={handlePackDragStart}
        onPackDragOver={handlePackDragOver}
        onPackDrop={handlePackDrop}
        onPackDragEnd={resetPackDragState}
      />
    );
  } else {
    sidebar = (
      <StickerSidebar
        activeGroupAtom={activeGroupIdAtom}
        packs={imagePacks}
        onScrollToGroup={handleScrollToGroup}
        reorderEnabled={imagePackMode === 'personal'}
        draggingPackId={draggingPackId}
        dropTarget={packDropTarget}
        onPackDragStart={handlePackDragStart}
        onPackDragOver={handlePackDragOver}
        onPackDrop={handlePackDrop}
        onPackDragEnd={resetPackDragState}
      />
    );
  }

  return (
    <FocusTrap
      focusTrapOptions={{
        returnFocusOnDeactivate,
        initialFocus: false,
        onDeactivate: requestClose,
        clickOutsideDeactivates: closeOnOutsideClick,
        allowOutsideClick: true,
        isKeyForward: (evt: KeyboardEvent) =>
          !editableActiveElement() && isKeyHotkey(['arrowdown', 'arrowright'], evt),
        isKeyBackward: (evt: KeyboardEvent) =>
          !editableActiveElement() && isKeyHotkey(['arrowup', 'arrowleft'], evt),
        escapeDeactivates: stopPropagation,
      }}
    >
      <EmojiBoardLayout
        header={
          <Box direction="Column" gap="200">
            {onTabChange && <EmojiBoardTabs tab={tab} onTabChange={onTabChange} />}
            {cloudTab && onCloudEmojiSelect && onStickerSelect && (
              <Box alignItems="Center" justifyContent="SpaceBetween" gap="200">
                <Text as="span" size="T300">
                  {'\u53d1\u9001\u65b9\u5f0f'}
                </Text>
                <Box alignItems="Center" gap="100">
                  <Badge
                    as="button"
                    type="button"
                    variant="Secondary"
                    fill={cloudSendMode === CloudSendMode.Auto ? 'Solid' : 'None'}
                    size="400"
                    style={{ cursor: 'pointer' }}
                    aria-pressed={cloudSendMode === CloudSendMode.Auto}
                    title={
                      effectiveCloudSendMode === CloudSendMode.Emoji
                        ? '\u81ea\u52a8\uff1a\u8f93\u5165\u6846\u6709\u5185\u5bb9\uff0c\u5c06\u4f5c\u4e3a\u8868\u60c5\u63d2\u5165'
                        : '\u81ea\u52a8\uff1a\u8f93\u5165\u6846\u4e3a\u7a7a\uff0c\u5c06\u4f5c\u4e3a\u8d34\u7eb8\u53d1\u9001'
                    }
                    onClick={() => setCloudSendMode(CloudSendMode.Auto)}
                  >
                    <Text as="span" size="L400">
                      {effectiveCloudSendMode === CloudSendMode.Emoji
                        ? '\u81ea\u52a8\u00b7\u8868\u60c5'
                        : '\u81ea\u52a8\u00b7\u8d34\u7eb8'}
                    </Text>
                  </Badge>
                  <Badge
                    as="button"
                    type="button"
                    variant="Secondary"
                    fill={cloudSendMode === CloudSendMode.Emoji ? 'Solid' : 'None'}
                    size="400"
                    style={{ cursor: 'pointer' }}
                    aria-pressed={cloudSendMode === CloudSendMode.Emoji}
                    title={'\u59cb\u7ec8\u4f5c\u4e3a\u8868\u60c5\u63d2\u5165\u8f93\u5165\u6846'}
                    onClick={() => setCloudSendMode(CloudSendMode.Emoji)}
                  >
                    <Text as="span" size="L400">
                      {'\u8868\u60c5'}
                    </Text>
                  </Badge>
                  <Badge
                    as="button"
                    type="button"
                    variant="Secondary"
                    fill={cloudSendMode === CloudSendMode.Sticker ? 'Solid' : 'None'}
                    size="400"
                    style={{ cursor: 'pointer' }}
                    aria-pressed={cloudSendMode === CloudSendMode.Sticker}
                    title={'\u59cb\u7ec8\u4f5c\u4e3a\u8d34\u7eb8\u7acb\u5373\u53d1\u9001'}
                    onClick={() => setCloudSendMode(CloudSendMode.Sticker)}
                  >
                    <Text as="span" size="L400">
                      {'\u8d34\u7eb8'}
                    </Text>
                  </Badge>
                </Box>
              </Box>
            )}
            <SearchInput
              key={tab}
              query={result?.query}
              onChange={handleOnChange}
              allowTextCustomEmoji={allowTextCustomEmoji}
              onTextCustomEmojiSelect={handleTextCustomEmojiSelect}
            />
          </Box>
        }
        sidebar={sidebar}
      >
        <Box grow="Yes">
          <EmojiGroupHolder
            key={`${tab}:${usage}`}
            contentScrollRef={contentScrollRef}
            previewAtom={previewAtom}
            onGroupItemClick={handleGroupItemClick}
          >
            {searchedItems && (
              <EmojiGroup id={SEARCH_GROUP_ID} label={searchResultLabel}>
                {searchedItems.map(renderItem)}
              </EmojiGroup>
            )}
            <div
              ref={virtualBaseRef}
              style={{
                position: 'relative',
                height: virtualizer.getTotalSize(),
              }}
            >
              {vItems.map((vItem) => {
                const group = groups[vItem.index];

                return (
                  <VirtualTile
                    virtualItem={vItem}
                    style={{ paddingTop: config.space.S200 }}
                    ref={virtualizer.measureElement}
                    key={vItem.index}
                  >
                    <EmojiGroup key={group.id} id={group.id} label={group.name}>
                      {group.items.map(renderItem)}
                    </EmojiGroup>
                  </VirtualTile>
                );
              })}
            </div>
            {cloudTab && groups.length === 0 && !searchedItems && (
              <RemoteStickerStatus
                loading={remoteStickerLoading}
                error={remoteStickerError}
                onRetry={retryRemoteStickers}
              />
            )}
            {tab === EmojiBoardTab.Sticker && groups.length === 0 && <NoStickerPacks />}
          </EmojiGroupHolder>
        </Box>
        <Preview previewAtom={previewAtom} />
      </EmojiBoardLayout>
    </FocusTrap>
  );
}
