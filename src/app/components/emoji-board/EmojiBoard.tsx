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
import { Box, config, Icons, Scroll } from 'folds';
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
  primeCachedMediaObjectUrl,
  primePersistentMediaUrl,
} from '../../utils/mediaUrlCache';
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
import { EmojiBoardTab, EmojiType } from './types';
import { VirtualTile } from '../virtualizer';
import { getEmojiBoardMediaCandidates, getEmojiBoardMediaUrls } from './components/media';

const RECENT_GROUP_ID = 'recent_group';
const SEARCH_GROUP_ID = 'search_group';
const PRIORITY_PACK_PRELOAD_COUNT = 4;
const PRIORITY_PACK_VISIBLE_URL_LIMIT = 160;
const WEB_PRIORITY_PACK_PRELOAD_COUNT = 2;
const WEB_PRIORITY_PACK_VISIBLE_URL_LIMIT = 48;
const WEB_VISIBLE_WARM_BATCH_SIZE = 8;
const WEB_VISIBLE_WARM_BATCH_DELAY_MS = 120;
const WEB_VISIBLE_PERSISTENT_WARM_DELAY_MS = 520;

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

const useGroups = (
  tab: EmojiBoardTab,
  imagePacks: ImagePack[]
): [EmojiGroupItem[], StickerGroupItem[]] => {
  const mx = useMatrixClient();

  const recentEmojis = useRecentEmoji(mx, 21);
  const labels = useEmojiGroupLabels();

  const emojiGroupItems = useMemo(() => {
    const g: EmojiGroupItem[] = [];
    if (tab !== EmojiBoardTab.Emoji) return g;

    g.push({
      id: RECENT_GROUP_ID,
      name: 'Recent',
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

  return [emojiGroupItems, stickerGroupItems];
};

const useItemRenderer = (tab: EmojiBoardTab) => {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const renderItem = (emoji: IEmoji | PackImageReader, index: number) => {
    if ('unicode' in emoji) {
      return <EmojiItem key={emoji.unicode + index} emoji={emoji} />;
    }
    if (tab === EmojiBoardTab.Sticker) {
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
      onDragStart={
        reorderEnabled && onDragStart ? (evt) => onDragStart(pack.id, evt) : undefined
      }
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
        key: emojiInfo.data,
        shortcode: emojiInfo.shortcode,
        info: emojiInfo.info,
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
  onEmojiSelect?: (unicode: string, shortcode: string) => void;
  onCustomEmojiSelect?: (mxc: string, shortcode: string) => void;
  onStickerSelect?: (mxc: string, label: string, info?: IImageInfo) => void;
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
  onEmojiSelect,
  onCustomEmojiSelect,
  onStickerSelect,
  allowTextCustomEmoji,
  addToRecentEmoji = true,
}: EmojiBoardProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const desktopSupported = isDesktopUpdaterSupported();

  const emojiTab = tab === EmojiBoardTab.Emoji;
  const usage = emojiTab ? ImageUsage.Emoticon : ImageUsage.Sticker;
  const priorityPackPreloadCount = desktopSupported
    ? PRIORITY_PACK_PRELOAD_COUNT
    : WEB_PRIORITY_PACK_PRELOAD_COUNT;
  const priorityPackVisibleUrlLimit = desktopSupported
    ? PRIORITY_PACK_VISIBLE_URL_LIMIT
    : WEB_PRIORITY_PACK_VISIBLE_URL_LIMIT;

  const previewAtom = useMemo(
    () => createPreviewDataAtom(emojiTab ? DefaultEmojiPreview : undefined),
    [emojiTab]
  );
  const activeGroupIdAtom = useMemo(() => atom<string | undefined>(undefined), []);
  const [activeGroupId, setActiveGroupId] = useAtom(activeGroupIdAtom);
  const contextualImagePacks = useRelevantImagePacks(usage, imagePackRooms);
  const allPersonalImagePacks = useAllPersonalImagePacks();
  const personalImagePacks = usePersonalImagePacks(usage);
  const imagePacks = imagePackMode === 'personal' ? personalImagePacks : contextualImagePacks;
  const [draggingPackId, setDraggingPackId] = useState<string>();
  const [packDropTarget, setPackDropTarget] = useState<PersonalPackDropTarget>();
  const [emojiGroupItems, stickerGroupItems] = useGroups(tab, imagePacks);
  const groups = emojiTab ? emojiGroupItems : stickerGroupItems;
  const renderItem = useItemRenderer(tab);

  const searchList = useMemo(() => {
    let list: Array<PackImageReader | IEmoji> = [];
    list = list.concat(imagePacks.flatMap((pack) => pack.getImages(usage)));
    if (emojiTab) list = list.concat(emojis);
    return list;
  }, [emojiTab, usage, imagePacks]);

  const [result, search, resetSearch] = useAsyncSearch(
    searchList,
    getEmoticonSearchStr,
    SEARCH_OPTIONS
  );

  const searchedItems = result?.items.slice(0, 100);

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
        }).forEach((url) => {
          mediaUrls.add(url);
        });
      });

      return Array.from(mediaUrls);
    },
    [mx, usage, useAuthentication]
  );

  const getPackPrimaryMediaUrls = useCallback(
    (pack: ImagePack) => {
      const size = usage === ImageUsage.Sticker ? 256 : 64;
      const mediaUrls = new Set<string>();
      const avatarMxc = pack.getAvatarUrl(usage);

      if (avatarMxc) {
        const { primaryUrl } = getEmojiBoardMediaUrls({
          mx,
          mxc: avatarMxc,
          useAuthentication,
          width: 64,
          height: 64,
        });

        if (primaryUrl) {
          mediaUrls.add(primaryUrl);
        }
      }

      pack.getImages(usage).forEach((image) => {
        const { primaryUrl } = getEmojiBoardMediaUrls({
          mx,
          mxc: image.url,
          useAuthentication,
          info: image.info,
          width: size,
          height: size,
        });

        if (primaryUrl) {
          mediaUrls.add(primaryUrl);
        }
      });

      return Array.from(mediaUrls);
    },
    [mx, usage, useAuthentication]
  );

  const priorityPacks = useMemo(() => {
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
  }, [activeGroupId, imagePacks, priorityPackPreloadCount]);

  const handleOnChange: ChangeEventHandler<HTMLInputElement> = useDebounce(
    useCallback(
      (evt) => {
        const term = evt.target.value;
        if (term) search(term);
        else resetSearch();
      },
      [search, resetSearch]
    ),
    { wait: 200 }
  );

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
      onCustomEmojiSelect?.(emojiInfo.data, emojiInfo.shortcode);
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

      void setPersonalPackOrder(mx, nextOrder).catch(() => undefined);
    },
    [allPersonalImagePacks, mx]
  );

  const handlePackDragStart = useCallback(
    (packId: string, evt: React.DragEvent<HTMLDivElement>) => {
      setDraggingPackId(packId);
      setPackDropTarget(undefined);
      evt.dataTransfer.effectAllowed = 'move';
      evt.dataTransfer.setData('text/plain', packId);
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
      evt.dataTransfer.dropEffect = 'move';

      const { top, height } = evt.currentTarget.getBoundingClientRect();
      const position: PackDropPosition = evt.clientY < top + height / 2 ? 'before' : 'after';

      setPackDropTarget((current) =>
        current?.packId === packId && current.position === position
          ? current
          : { packId, position }
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
    if (priorityPacks.length === 0) {
      return undefined;
    }

    let disposed = false;
    const backgroundTimers: number[] = [];
    const preloadTimer = window.setTimeout(() => {
      if (disposed) {
        return;
      }

      if (desktopSupported) {
        priorityPacks.forEach((pack, packIndex) => {
          getPackMediaUrls(pack).forEach((mediaUrl, mediaIndex) => {
            const priority =
              packIndex === 0 && mediaIndex < priorityPackVisibleUrlLimit
                ? 'visible'
                : 'background';

            if (priority === 'visible') {
              void primeDesktopMediaAssetUrl(mediaUrl, priority);
            } else {
              void warmDesktopMediaAssetCache(mediaUrl);
            }
          });
        });
        return;
      }

      const priorityPrimaryUrls = Array.from(
        new Set(priorityPacks.flatMap((pack) => getPackPrimaryMediaUrls(pack)))
      ).slice(0, priorityPackVisibleUrlLimit);
      const priorityPrimaryUrlSet = new Set(priorityPrimaryUrls);
      const persistentUrls = Array.from(
        new Set(priorityPacks.flatMap((pack) => getPackMediaUrls(pack)))
      ).filter((mediaUrl) => !priorityPrimaryUrlSet.has(mediaUrl));

      for (
        let batchStart = 0;
        batchStart < priorityPrimaryUrls.length;
        batchStart += WEB_VISIBLE_WARM_BATCH_SIZE
      ) {
        const batch = priorityPrimaryUrls.slice(
          batchStart,
          batchStart + WEB_VISIBLE_WARM_BATCH_SIZE
        );
        const batchIndex = batchStart / WEB_VISIBLE_WARM_BATCH_SIZE;

        backgroundTimers.push(
          window.setTimeout(() => {
            if (disposed) {
              return;
            }

            batch.forEach((mediaUrl) => {
              void primeCachedMediaObjectUrl(mediaUrl, 'visible');
            });
          }, batchIndex * WEB_VISIBLE_WARM_BATCH_DELAY_MS)
        );
      }

      if (persistentUrls.length > 0) {
        backgroundTimers.push(
          window.setTimeout(() => {
            if (disposed) {
              return;
            }

            persistentUrls.forEach((mediaUrl) => {
              void primePersistentMediaUrl(mediaUrl, 'background');
            });
          }, WEB_VISIBLE_PERSISTENT_WARM_DELAY_MS)
        );
      }
    }, 0);

    return () => {
      disposed = true;
      window.clearTimeout(preloadTimer);
      backgroundTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [
    desktopSupported,
    getPackMediaUrls,
    getPackPrimaryMediaUrls,
    priorityPackVisibleUrlLimit,
    priorityPacks,
  ]);

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

  return (
    <FocusTrap
      focusTrapOptions={{
        returnFocusOnDeactivate,
        initialFocus: false,
        onDeactivate: requestClose,
        clickOutsideDeactivates: true,
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
            <SearchInput
              key={tab}
              query={result?.query}
              onChange={handleOnChange}
              allowTextCustomEmoji={allowTextCustomEmoji}
              onTextCustomEmojiSelect={handleTextCustomEmojiSelect}
            />
          </Box>
        }
        sidebar={
          emojiTab ? (
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
          ) : (
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
          )
        }
      >
        <Box grow="Yes">
          <EmojiGroupHolder
            key={tab}
            contentScrollRef={contentScrollRef}
            previewAtom={previewAtom}
            onGroupItemClick={handleGroupItemClick}
          >
            {searchedItems && (
              <EmojiGroup
                id={SEARCH_GROUP_ID}
                label={searchedItems.length ? 'Search Results' : 'No Results found'}
              >
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
            {tab === EmojiBoardTab.Sticker && groups.length === 0 && <NoStickerPacks />}
          </EmojiGroupHolder>
        </Box>
        <Preview previewAtom={previewAtom} />
      </EmojiBoardLayout>
    </FocusTrap>
  );
}
