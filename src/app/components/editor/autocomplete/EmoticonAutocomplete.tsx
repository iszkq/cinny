import React, {
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Editor, RangeRef, Transforms } from 'slate';
import { Badge, Box, Icon, IconButton, Icons, MenuItem, Spinner, Text, toRem } from 'folds';
import { Room } from 'matrix-js-sdk';

import { AutocompleteQuery } from './autocompleteQuery';
import { AutocompleteMenu } from './AutocompleteMenu';
import * as css from './EmoticonAutocomplete.css';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { UseAsyncSearchOptions, useAsyncSearch } from '../../../hooks/useAsyncSearch';
import { onTabPress } from '../../../utils/keyboard';
import { createEmoticonElement, moveCursor, replaceWithElement } from '../utils';
import { useRecentEmoji } from '../../../hooks/useRecentEmoji';
import { usePersonalImagePacks, useRelevantImagePacks } from '../../../hooks/useImagePacks';
import { IEmoji, emojis } from '../../../plugins/emoji';
import { useKeyDown } from '../../../hooks/useKeyDown';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { ImageUsage, PackImageReader } from '../../../plugins/custom-emoji';
import { getEmoticonSearchStr } from '../../../plugins/utils';
import { useCachedMediaUrl } from '../../../hooks/useCachedMediaUrl';
import { getEmojiBoardMediaUrls } from '../../emoji-board/components/media';
import { useRemoteStickerIndex } from '../../emoji-board/useRemoteStickerIndex';
import { isHttpUrl } from '../../../utils/matrix';
import { normalize } from '../../../utils/AsyncSearch';

type EmoticonSearchItem = PackImageReader | IEmoji;

type EmoticonHoverPreviewData = {
  key: string;
  src?: string;
  shortcode: string;
  customEmoji: boolean;
  anchor: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
};

type EmoticonAutocompleteProps = {
  imagePackRooms: Room[];
  imagePackMode?: 'contextual' | 'personal';
  editor: Editor;
  query: AutocompleteQuery<string>;
  requestClose: () => void;
  resolveCustomEmojiKey?: (image: PackImageReader) => string | Promise<string>;
  onStickerSelect?: (image: PackImageReader) => void | Promise<void>;
};

const MAX_AUTOCOMPLETE_RESULTS = 60;
const SCROLL_EDGE_TOLERANCE = 2;

const SEARCH_OPTIONS: UseAsyncSearchOptions = {
  matchOptions: {
    contain: true,
  },
};

const getCustomEmojiIdentity = (image: PackImageReader): string =>
  `${image.url}\u0000${image.shortcode}`;

const deduplicateCustomEmoji = (images: PackImageReader[]): PackImageReader[] => {
  const identities = new Set<string>();

  return images.filter((image) => {
    const identity = getCustomEmojiIdentity(image);
    if (identities.has(identity)) return false;
    identities.add(identity);
    return true;
  });
};

function EmoticonHoverPreview({ preview }: { preview?: EmoticonHoverPreviewData }) {
  if (!preview || typeof document === 'undefined') return null;

  const previewWidth = 160;
  const viewportPadding = 12;
  const anchorCenter = (preview.anchor.left + preview.anchor.right) / 2;
  const left = Math.min(
    window.innerWidth - viewportPadding - previewWidth / 2,
    Math.max(viewportPadding + previewWidth / 2, anchorCenter)
  );
  const showBelow = preview.anchor.top < 180;
  const top = showBelow ? preview.anchor.bottom + 8 : preview.anchor.top - 8;

  return createPortal(
    <div
      className={css.HoverPreview}
      style={{
        left,
        top,
        transform: showBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
      }}
      aria-hidden="true"
    >
      {preview.customEmoji && preview.src ? (
        <img
          className={css.HoverPreviewImage}
          src={preview.src}
          alt=""
          loading="eager"
          decoding="async"
          referrerPolicy={isHttpUrl(preview.key) ? 'no-referrer' : undefined}
        />
      ) : (
        <span className={css.HoverPreviewUnicode}>{preview.key}</span>
      )}
      <span className={css.HoverPreviewLabel}>:{preview.shortcode}:</span>
    </div>,
    document.body
  );
}

function CustomEmojiOptionMedia({
  src,
  alt,
  noReferrer,
  load,
}: {
  src: string;
  alt: string;
  noReferrer: boolean;
  load: boolean;
}) {
  const cachedMediaUrl = useCachedMediaUrl(load ? src : undefined);

  if (!load) {
    return <Box shrink="No" aria-hidden style={{ width: toRem(32), height: toRem(32) }} />;
  }

  return (
    <Box
      shrink="No"
      as="img"
      src={cachedMediaUrl ?? src}
      alt={alt}
      loading="lazy"
      referrerPolicy={noReferrer ? 'no-referrer' : undefined}
      style={{ width: toRem(32), height: toRem(32), objectFit: 'contain' }}
    />
  );
}

export function EmoticonAutocomplete({
  imagePackRooms,
  imagePackMode = 'contextual',
  editor,
  query,
  requestClose,
  resolveCustomEmojiKey,
  onStickerSelect,
}: EmoticonAutocompleteProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const contextualEmoticonPacks = useRelevantImagePacks(ImageUsage.Emoticon, imagePackRooms);
  const contextualStickerPacks = useRelevantImagePacks(ImageUsage.Sticker, imagePackRooms);
  const personalEmoticonPacks = usePersonalImagePacks(ImageUsage.Emoticon);
  const personalStickerPacks = usePersonalImagePacks(ImageUsage.Sticker);
  const emoticonPacks =
    imagePackMode === 'personal' ? personalEmoticonPacks : contextualEmoticonPacks;
  const stickerPacks = imagePackMode === 'personal' ? personalStickerPacks : contextualStickerPacks;
  const remoteEnabled = Boolean(resolveCustomEmojiKey && query.text.trim());
  const { stickers: remoteStickers, loading: remoteLoading } = useRemoteStickerIndex(remoteEnabled);
  const recentEmoji = useRecentEmoji(mx, 20);

  const searchList = useMemo(() => {
    const customEmoji = deduplicateCustomEmoji(
      emoticonPacks
        .flatMap((pack) => pack.getImages(ImageUsage.Emoticon))
        .concat(
          stickerPacks.flatMap((pack) => pack.getImages(ImageUsage.Sticker)),
          remoteEnabled ? remoteStickers : []
        )
    );

    return (customEmoji as EmoticonSearchItem[]).concat(emojis);
  }, [emoticonPacks, remoteEnabled, remoteStickers, stickerPacks]);

  const [result, search, resetSearch] = useAsyncSearch(
    searchList,
    getEmoticonSearchStr,
    SEARCH_OPTIONS
  );
  const currentResult =
    result?.query === normalize(query.text, SEARCH_OPTIONS.normalizeOptions) ? result : undefined;
  const autoCompleteEmoticon = useMemo(
    () =>
      query.text
        ? currentResult?.items.slice(0, MAX_AUTOCOMPLETE_RESULTS) ?? []
        : recentEmoji.slice(0, MAX_AUTOCOMPLETE_RESULTS),
    [currentResult, query.text, recentEmoji]
  );

  useEffect(() => {
    if (query.text) search(query.text);
    else resetSearch();
  }, [query.text, search, resetSearch]);

  const carouselBaseRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const completingRef = useRef(false);
  const aliveRef = useRef(true);
  const activeQueryRangeRef = useRef<RangeRef>();
  const [resolving, setResolving] = useState(false);
  const [stickerMode, setStickerMode] = useState(false);
  const [canScrollPrevious, setCanScrollPrevious] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const [visibleOptionIndexes, setVisibleOptionIndexes] = useState(() => new Set([0, 1, 2, 3]));
  const [hoverPreview, setHoverPreview] = useState<EmoticonHoverPreviewData>();

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      activeQueryRangeRef.current?.unref();
      activeQueryRangeRef.current = undefined;
      completingRef.current = false;
    };
  }, []);

  const updateScrollState = useCallback(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    setCanScrollPrevious(carousel.scrollLeft > SCROLL_EDGE_TOLERANCE);
    setCanScrollNext(
      carousel.scrollLeft + carousel.clientWidth < carousel.scrollWidth - SCROLL_EDGE_TOLERANCE
    );
  }, []);

  useEffect(() => {
    optionRefs.current.length = autoCompleteEmoticon.length;
    setHoverPreview(undefined);
    const carousel = carouselRef.current;
    if (!carousel) return undefined;

    carousel.scrollTo({ left: 0, behavior: 'auto' });
    const frameId = window.requestAnimationFrame(updateScrollState);
    window.addEventListener('resize', updateScrollState);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [autoCompleteEmoticon.length, query.text, updateScrollState]);

  const showOptionPreview = useCallback(
    (
      element: HTMLButtonElement,
      emoticon: EmoticonSearchItem,
      src: string | undefined,
      customEmoji: boolean
    ) => {
      const { top, bottom, left, right } = element.getBoundingClientRect();
      setHoverPreview({
        key: customEmoji ? (emoticon as PackImageReader).url : (emoticon as IEmoji).unicode,
        src,
        shortcode: emoticon.shortcode,
        customEmoji,
        anchor: { top, bottom, left, right },
      });
    },
    []
  );

  const handleCarouselScroll = useCallback(() => {
    setHoverPreview(undefined);
    updateScrollState();
  }, [updateScrollState]);

  useEffect(() => {
    const initialIndexes = Array.from(
      { length: Math.min(4, autoCompleteEmoticon.length) },
      (_, index) => index
    );
    setVisibleOptionIndexes(new Set(initialIndexes));

    const carousel = carouselRef.current;
    if (!carousel) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setVisibleOptionIndexes(new Set(autoCompleteEmoticon.map((_, index) => index)));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const intersectingIndexes = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => Number((entry.target as HTMLElement).dataset.optionIndex))
          .filter(Number.isInteger);
        if (intersectingIndexes.length === 0) return;

        setVisibleOptionIndexes((current) => {
          const next = new Set(current);
          intersectingIndexes.forEach((index) => next.add(index));
          return next.size === current.size ? current : next;
        });
      },
      { root: carousel, rootMargin: '0px 256px', threshold: 0.01 }
    );

    optionRefs.current.forEach((option) => {
      if (option) observer.observe(option);
    });

    return () => observer.disconnect();
  }, [autoCompleteEmoticon]);

  const completeWithKey = useCallback(
    (key: string, shortcode: string, range = query.range) => {
      if (!key) return;

      const emoticonEl = createEmoticonElement(key, shortcode);
      replaceWithElement(editor, range, emoticonEl);
      moveCursor(editor, true);
      requestClose();
    },
    [editor, query.range, requestClose]
  );

  const handleAutocomplete = useCallback(
    async (emoticon: EmoticonSearchItem) => {
      if (completingRef.current) return;

      if (stickerMode && emoticon instanceof PackImageReader && onStickerSelect) {
        completingRef.current = true;
        Transforms.delete(editor, { at: query.range });
        moveCursor(editor, true);
        requestClose();
        try {
          await onStickerSelect(emoticon);
        } finally {
          completingRef.current = false;
        }
        return;
      }

      const defaultKey = emoticon instanceof PackImageReader ? emoticon.url : emoticon.unicode;
      if (!(emoticon instanceof PackImageReader) || !resolveCustomEmojiKey) {
        completeWithKey(defaultKey, emoticon.shortcode);
        return;
      }

      completingRef.current = true;
      const sourceQuery = Editor.string(editor, query.range);
      const queryRangeRef = Editor.rangeRef(editor, query.range, { affinity: 'inward' });
      activeQueryRangeRef.current = queryRangeRef;
      const releaseQueryRange = () => {
        if (activeQueryRangeRef.current !== queryRangeRef) return null;
        activeQueryRangeRef.current = undefined;
        return queryRangeRef.unref();
      };
      let resolvedKey: string;

      try {
        const resolution = resolveCustomEmojiKey(emoticon);
        if (typeof resolution !== 'string') setResolving(true);
        resolvedKey = await resolution;
      } catch {
        releaseQueryRange();
        completingRef.current = false;
        if (aliveRef.current) setResolving(false);
        return;
      }

      const trackedRange = releaseQueryRange();
      completingRef.current = false;
      if (!aliveRef.current) return;
      setResolving(false);

      if (!trackedRange || Editor.string(editor, trackedRange) !== sourceQuery) return;
      completeWithKey(resolvedKey, emoticon.shortcode, trackedRange);
    },
    [
      completeWithKey,
      editor,
      onStickerSelect,
      query.range,
      requestClose,
      resolveCustomEmojiKey,
      stickerMode,
    ]
  );

  const scrollCarousel = useCallback((direction: -1 | 1) => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    carousel.scrollBy({
      left: direction * Math.max(carousel.clientWidth * 0.8, 144),
      behavior: 'smooth',
    });
  }, []);

  const handleCarouselWheel = useCallback((evt: ReactWheelEvent<HTMLDivElement>) => {
    const carousel = carouselRef.current;
    if (!carousel || carousel.scrollWidth <= carousel.clientWidth) return;

    const delta = Math.abs(evt.deltaX) >= Math.abs(evt.deltaY) ? evt.deltaX : evt.deltaY;
    const canMove =
      (delta < 0 && carousel.scrollLeft > SCROLL_EDGE_TOLERANCE) ||
      (delta > 0 &&
        carousel.scrollLeft + carousel.clientWidth < carousel.scrollWidth - SCROLL_EDGE_TOLERANCE);
    if (!canMove) return;

    evt.preventDefault();
    carousel.scrollLeft += delta;
  }, []);

  const focusOption = useCallback((index: number) => {
    const target = optionRefs.current[index];
    if (!target) return;

    target.focus();
    target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, []);

  const handleOptionKeyDown = useCallback(
    (evt: ReactKeyboardEvent<HTMLButtonElement>, index: number, emoticon: EmoticonSearchItem) => {
      if (evt.nativeEvent.isComposing || evt.keyCode === 229) return;

      if (evt.key === 'ArrowLeft' || evt.key === 'ArrowRight') {
        evt.preventDefault();
        evt.stopPropagation();
        const offset = evt.key === 'ArrowLeft' ? -1 : 1;
        focusOption(Math.min(Math.max(index + offset, 0), autoCompleteEmoticon.length - 1));
        return;
      }
      if (evt.key === 'Home' || evt.key === 'End') {
        evt.preventDefault();
        evt.stopPropagation();
        focusOption(evt.key === 'Home' ? 0 : autoCompleteEmoticon.length - 1);
        return;
      }
      if (evt.key === 'Tab') {
        evt.stopPropagation();
        onTabPress(evt, () => {
          handleAutocomplete(emoticon).catch(() => undefined);
        });
      }
    },
    [autoCompleteEmoticon.length, focusOption, handleAutocomplete]
  );

  useKeyDown(window, (evt: KeyboardEvent) => {
    if (evt.isComposing || evt.keyCode === 229) return;

    onTabPress(evt, () => {
      if (
        autoCompleteEmoticon.length === 0 ||
        completingRef.current ||
        carouselBaseRef.current?.contains(document.activeElement)
      ) {
        return;
      }
      handleAutocomplete(autoCompleteEmoticon[0]).catch(() => undefined);
    });
  });

  const showRemoteLoading = remoteEnabled && remoteLoading;
  const totalResultCount = query.text ? currentResult?.items.length ?? 0 : recentEmoji.length;
  const resultCountLabel =
    totalResultCount > MAX_AUTOCOMPLETE_RESULTS
      ? `\u524d ${MAX_AUTOCOMPLETE_RESULTS} \u9879`
      : `${autoCompleteEmoticon.length}`;

  if (autoCompleteEmoticon.length === 0 && !showRemoteLoading) return null;

  return (
    <AutocompleteMenu
      headerContent={
        <Box alignItems="Center" justifyContent="SpaceBetween" gap="200">
          <Text size="L400">
            {autoCompleteEmoticon.length > 0
              ? `\u8868\u60c5\u4e0e\u8d34\u7eb8 (${resultCountLabel})`
              : '\u8868\u60c5\u4e0e\u8d34\u7eb8'}
          </Text>
          {onStickerSelect && (
            <Box alignItems="Center" gap="100">
              <Badge
                as="button"
                type="button"
                variant="Secondary"
                fill={!stickerMode ? 'Solid' : 'None'}
                size="400"
                style={{ cursor: 'pointer' }}
                aria-pressed={!stickerMode}
                title="将图片候选插入编辑器作为表情"
                onClick={() => setStickerMode(false)}
              >
                <Text as="span" size="L400">
                  表情
                </Text>
              </Badge>
              <Badge
                as="button"
                type="button"
                variant="Secondary"
                fill={stickerMode ? 'Solid' : 'None'}
                size="400"
                style={{ cursor: 'pointer' }}
                aria-pressed={stickerMode}
                title="将图片候选作为贴纸立即发送"
                onClick={() => setStickerMode(true)}
              >
                <Text as="span" size="L400">
                  贴纸
                </Text>
              </Badge>
            </Box>
          )}
        </Box>
      }
      requestClose={requestClose}
    >
      {autoCompleteEmoticon.length === 0 ? (
        <Box className={css.EmptyState} gap="200">
          <Spinner size="100" />
          <Text size="T300">{'\u6b63\u5728\u641c\u7d22\u4e91\u7aef\u8868\u60c5...'}</Text>
        </Box>
      ) : (
        <div ref={carouselBaseRef} className={css.Carousel} aria-busy={resolving}>
          <IconButton
            className={css.CarouselNav}
            type="button"
            size="300"
            variant="SurfaceVariant"
            radii="Pill"
            aria-label="\u5411\u5de6\u6d4f\u89c8\u8868\u60c5\u5019\u9009"
            disabled={!canScrollPrevious}
            onClick={() => scrollCarousel(-1)}
          >
            <Icon src={Icons.ArrowLeft} size="50" />
          </IconButton>
          <div
            ref={carouselRef}
            className={css.CarouselTrack}
            role="group"
            aria-label="\u8868\u60c5\u4e0e\u8d34\u7eb8\u641c\u7d22\u7ed3\u679c"
            onScroll={handleCarouselScroll}
            onWheel={handleCarouselWheel}
          >
            {autoCompleteEmoticon.map((emoticon, index) => {
              const isCustomEmoji = emoticon instanceof PackImageReader;
              const key = isCustomEmoji ? emoticon.url : emoticon.unicode;
              const customEmojiUrl = isCustomEmoji
                ? getEmojiBoardMediaUrls({
                    mx,
                    mxc: key,
                    useAuthentication,
                    info: emoticon.info,
                    width: 64,
                    height: 64,
                  }).primaryUrl
                : undefined;
              const customEmojiPreviewUrl = isCustomEmoji
                ? getEmojiBoardMediaUrls({
                    mx,
                    mxc: key,
                    useAuthentication,
                    info: emoticon.info,
                    width: 256,
                    height: 256,
                    preferOriginal: true,
                  }).primaryUrl
                : undefined;

              return (
                <MenuItem
                  key={
                    isCustomEmoji
                      ? getCustomEmojiIdentity(emoticon)
                      : `${key}\u0000${emoticon.shortcode}`
                  }
                  ref={(element: HTMLButtonElement | null) => {
                    optionRefs.current[index] = element;
                  }}
                  className={css.CarouselItem}
                  as="button"
                  type="button"
                  data-option-index={index}
                  radii="300"
                  title={`:${emoticon.shortcode}:`}
                  aria-label={
                    stickerMode && isCustomEmoji
                      ? `\u53d1\u9001\u8d34\u7eb8 ${emoticon.shortcode}`
                      : `\u63d2\u5165\u8868\u60c5 ${emoticon.shortcode}`
                  }
                  disabled={resolving}
                  onMouseEnter={(evt: ReactMouseEvent<HTMLButtonElement>) =>
                    showOptionPreview(
                      evt.currentTarget,
                      emoticon,
                      customEmojiPreviewUrl,
                      isCustomEmoji
                    )
                  }
                  onMouseLeave={() => setHoverPreview(undefined)}
                  onFocus={(evt: ReactFocusEvent<HTMLButtonElement>) =>
                    showOptionPreview(
                      evt.currentTarget,
                      emoticon,
                      customEmojiPreviewUrl,
                      isCustomEmoji
                    )
                  }
                  onBlur={() => setHoverPreview(undefined)}
                  onKeyDown={(evt: ReactKeyboardEvent<HTMLButtonElement>) =>
                    handleOptionKeyDown(evt, index, emoticon)
                  }
                  onClick={() => {
                    handleAutocomplete(emoticon).catch(() => undefined);
                  }}
                  before={
                    isCustomEmoji && customEmojiUrl ? (
                      <CustomEmojiOptionMedia
                        src={customEmojiUrl}
                        alt={emoticon.shortcode}
                        noReferrer={isHttpUrl(key)}
                        load={visibleOptionIndexes.has(index)}
                      />
                    ) : (
                      <Box
                        shrink="No"
                        as="span"
                        display="InlineFlex"
                        style={{ fontSize: toRem(28), lineHeight: toRem(32) }}
                      >
                        {key}
                      </Box>
                    )
                  }
                >
                  <Text style={{ flexGrow: 1 }} size="B300" truncate>
                    :{emoticon.shortcode}:
                  </Text>
                </MenuItem>
              );
            })}
          </div>
          <IconButton
            className={css.CarouselNav}
            type="button"
            size="300"
            variant="SurfaceVariant"
            radii="Pill"
            aria-label="\u5411\u53f3\u6d4f\u89c8\u8868\u60c5\u5019\u9009"
            disabled={!canScrollNext}
            onClick={() => scrollCarousel(1)}
          >
            <Icon src={Icons.ArrowRight} size="50" />
          </IconButton>
          <EmoticonHoverPreview preview={hoverPreview} />
        </div>
      )}
    </AutocompleteMenu>
  );
}
