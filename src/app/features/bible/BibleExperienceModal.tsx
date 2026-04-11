import React, { CSSProperties, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import {
  Box,
  Header,
  Icon,
  IconButton,
  Icons,
  Input,
  Line,
  Modal,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Text,
  config,
  toRem,
} from 'folds';
import { isKeyHotkey } from 'is-hotkey';
import { SequenceCard } from '../../components/sequence-card';
import { ModalWide } from '../../styles/Modal.css';
import { copyToClipboard } from '../../utils/dom';
import { stopPropagation } from '../../utils/keyboard';
import {
  BibleBook,
  BibleData,
  BibleSearchScopeMode,
  BibleVerse,
  formatBibleVerse,
  getChapterVerses,
  loadBibleData,
  resolveBibleBook,
  searchBible,
} from './data';

const PAGE_SIZE = 40;
const FONT_SIZE_MIN = 15;
const FONT_SIZE_MAX = 23;
const FONT_SIZE_STEP = 2;
const SOFT_LINE = '1px solid rgba(148, 163, 184, 0.18)';
const RED_REFERENCE = '#d93025';
const TEXT_MAIN = '#0f172a';
const BUTTON_TRANSITION =
  'transform 120ms ease, box-shadow 120ms ease, background-color 120ms ease, border-color 120ms ease, color 120ms ease';
const MARK_STYLE: CSSProperties = {
  background: 'rgba(253, 224, 71, 0.5)',
  borderRadius: 6,
  padding: '0 2px',
};
const CARD_STYLE: CSSProperties = {
  borderRadius: toRem(28),
  padding: config.space.S400,
  border: SOFT_LINE,
  background:
    'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(247,250,255,0.96) 100%)',
  boxShadow: '0 24px 64px rgba(148, 163, 184, 0.12)',
};
const INPUT_STYLE: CSSProperties = {
  width: toRem(68),
  minHeight: 34,
  borderRadius: 12,
  border: '1px solid rgba(148, 163, 184, 0.24)',
  padding: `0 ${config.space.S200}`,
  textAlign: 'center',
  outline: 'none',
};
const SEGMENT_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: config.space.S100,
  padding: config.space.S100,
  borderRadius: toRem(28),
  background: 'rgba(241, 245, 249, 0.86)',
  border: '1px solid rgba(226, 232, 240, 0.95)',
  width: 'fit-content',
  maxWidth: '100%',
};
const PANEL_STYLE: CSSProperties = {
  borderRadius: toRem(24),
  border: '1px solid rgba(226, 232, 240, 0.92)',
  background: 'rgba(248, 250, 252, 0.92)',
  padding: toRem(20),
};
const SOFT_SCROLL_PANEL_STYLE: CSSProperties = {
  borderRadius: toRem(22),
  border: '1px solid rgba(226, 232, 240, 0.9)',
  background: 'rgba(255, 255, 255, 0.74)',
  padding: toRem(14),
};

const CN = {
  title: '圣经',
  loading: '正在载入圣经数据...',
  loadFailed: '圣经数据加载失败',
  intro: '输入关键词可搜索经文内容；卷章浏览在选中章节后会自动收起，把更多空间留给经文。',
  selectionHelp: '点击经文即可多选，支持跨卷跨章累计选择；Ctrl+C 复制，Ctrl+X 清空选择。',
  searchPlaceholder: '输入经文内容关键词，多个关键词用空格分隔',
  searchHelp: '搜索框只搜索经文内容；卷名和章节请在下方卷章浏览中选择。',
  rangeTitle: '筛选范围',
  all: '全部',
  old: '旧约',
  new: '新约',
  current: '当前卷',
  custom: '自定义多卷',
  customBooks: '选择搜索书卷',
  fontSmaller: 'A-',
  fontReset: '默认',
  fontLarger: 'A+',
  selected: '已选',
  verses: '节',
  copySelected: '复制已选',
  insert: '插入聊天框',
  reset: '清空选择',
  browseTitle: '卷章浏览',
  browseHelp: '先选卷名，再选章节；选中章节后浏览区会自动收起。',
  expand: '展开卷章',
  collapse: '收起卷章',
  expandToolbar: '展开搜索',
  collapseToolbar: '收起搜索',
  chapterTitle: '章节',
  prevChapter: '上一章 (-)',
  nextChapter: '下一章 (+)',
  searchSummary: '共找到',
  chapterSummary: '本章共',
  noResult: '没有找到匹配经文，请换个关键词或调整筛选范围。',
  jump: '跳转',
  copy: '复制',
  backToChapter: '返回本章',
  keyboardHint: '方向键上下滚动，左右翻页，+/- 切换章节。',
  searchHintSuffix: '可点击“跳转”回到该节经文所在章节。',
  currentLocation: '当前定位',
  page: '页',
  pageJump: '跳页',
} as const;

const scopeOptions: Array<{ value: BibleSearchScopeMode; label: string }> = [
  { value: 'all', label: CN.all },
  { value: 'old', label: CN.old },
  { value: 'new', label: CN.new },
  { value: 'current', label: CN.current },
  { value: 'custom', label: CN.custom },
];

type TestamentTab = 'old' | 'new';
type PageItem = number | 'start-ellipsis' | 'end-ellipsis';

type BibleExperienceModalProps = {
  open: boolean;
  requestClose: () => void;
  onInsertSelected?: (text: string) => void;
};

type VerseRowProps = {
  verse: BibleVerse;
  selected: boolean;
  focused: boolean;
  fontSize: number;
  onToggle: (verse: BibleVerse) => void;
  onCopy: (verse: BibleVerse) => void;
  onJump?: (verse: BibleVerse) => void;
  highlightPattern?: RegExp;
  rowRef?: (node: HTMLButtonElement | null) => void;
};

type BiblePillButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'style'> & {
  active?: boolean;
  style?: CSSProperties;
};

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
};

const scrollToTop = (ref: React.RefObject<HTMLDivElement>) => {
  ref.current?.scrollTo({ top: 0, behavior: 'auto' });
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isPrevChapterKey = (evt: KeyboardEvent): boolean =>
  evt.key === '-' || evt.key === '_' || evt.code === 'Minus' || evt.code === 'NumpadSubtract';
const isNextChapterKey = (evt: KeyboardEvent): boolean =>
  evt.key === '+' ||
  evt.key === '=' ||
  evt.key === '＋' ||
  evt.key === 'Add' ||
  evt.code === 'NumpadAdd' ||
  evt.code === 'Equal';

const getHighlightPattern = (keywords: string[]): RegExp | undefined => {
  const parts = Array.from(
    new Set(
      keywords
        .map((item) => item.trim())
        .filter(Boolean)
        .sort((a, b) => b.length - a.length)
    )
  );
  if (!parts.length) return undefined;
  return new RegExp(`(${parts.map(escapeRegExp).join('|')})`, 'gi');
};

const highlightText = (text: string, pattern?: RegExp): ReactNode => {
  if (!pattern) return text;
  const segments = text.split(pattern);

  return segments.map((segment, index) => {
    if (!segment) return null;
    if (pattern.test(segment)) {
      pattern.lastIndex = 0;
      return (
        <mark key={`${segment}-${index}`} style={MARK_STYLE}>
          {segment}
        </mark>
      );
    }
    pattern.lastIndex = 0;
    return <React.Fragment key={`${segment}-${index}`}>{segment}</React.Fragment>;
  });
};

const getScopeLabel = (
  mode: BibleSearchScopeMode,
  currentBook: BibleBook | undefined,
  customBooks: string[]
): string => {
  if (mode === 'old') return CN.old;
  if (mode === 'new') return CN.new;
  if (mode === 'current') return currentBook?.name ?? CN.current;
  if (mode === 'custom') {
    if (customBooks.length === 0) return currentBook?.name ?? CN.custom;
    if (customBooks.length === 1) return customBooks[0];
    return `已选 ${customBooks.length} 卷`;
  }
  return CN.all;
};

const buildPageItems = (currentPage: number, totalPages: number): PageItem[] => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const items: PageItem[] = [1];
  const left = Math.max(2, currentPage - 1);
  const right = Math.min(totalPages - 1, currentPage + 1);

  if (left > 2) items.push('start-ellipsis');
  for (let page = left; page <= right; page += 1) items.push(page);
  if (right < totalPages - 1) items.push('end-ellipsis');
  items.push(totalPages);

  return items;
};

function BiblePillButton({
  active = false,
  children,
  disabled,
  style,
  ...props
}: BiblePillButtonProps) {
  const [hovered, setHovered] = useState(false);
  const interactive = hovered && !disabled;

  return (
    <button
      type="button"
      aria-pressed={active || undefined}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        minHeight: 38,
        padding: `0 ${toRem(16)}`,
        borderRadius: toRem(999),
        border: active
          ? '1px solid rgba(15, 23, 42, 0.96)'
          : '1px solid rgba(148, 163, 184, 0.24)',
        background: disabled
          ? 'rgba(226, 232, 240, 0.45)'
          : active
          ? TEXT_MAIN
          : interactive
          ? 'rgba(255, 255, 255, 0.96)'
          : 'rgba(255, 255, 255, 0.72)',
        color: disabled ? 'rgba(15, 23, 42, 0.36)' : active ? '#ffffff' : TEXT_MAIN,
        fontSize: toRem(13),
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: active
          ? '0 14px 26px rgba(15, 23, 42, 0.16)'
          : interactive
          ? '0 10px 24px rgba(148, 163, 184, 0.16)'
          : '0 1px 2px rgba(148, 163, 184, 0.08)',
        transform: interactive ? 'translateY(-1px)' : 'translateY(0)',
        transition: BUTTON_TRANSITION,
        flexShrink: 0,
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}

function VerseRow({
  verse,
  selected,
  focused,
  fontSize,
  onToggle,
  onCopy,
  onJump,
  highlightPattern,
  rowRef,
}: VerseRowProps) {
  return (
    <Box
      as="button"
      type="button"
      ref={rowRef}
      onClick={() => onToggle(verse)}
      direction="Column"
      gap="250"
      style={{
        width: '100%',
        border: 'none',
        borderBottom: SOFT_LINE,
        background: focused
          ? 'rgba(219, 234, 254, 0.92)'
          : selected
          ? 'rgba(219, 234, 254, 0.72)'
          : 'transparent',
        borderInlineStart: focused
          ? '3px solid rgba(59, 130, 246, 0.88)'
          : selected
          ? '2px solid rgba(59, 130, 246, 0.68)'
          : '2px solid transparent',
        padding: `${toRem(18)} ${toRem(28)} ${toRem(20)} ${toRem(34)}`,
        textAlign: 'left',
        cursor: 'pointer',
        boxShadow: focused ? '0 14px 32px rgba(59, 130, 246, 0.12)' : 'none',
        scrollMarginBlock: toRem(28),
        transition: 'background-color 120ms ease, border-color 120ms ease, box-shadow 180ms ease',
      }}
    >
      <Box gap="300" alignItems="Start" wrap="Wrap">
        <Box grow="Yes" direction="Column" gap="150" style={{ minWidth: 0 }}>
          <Text size="L400" style={{ color: RED_REFERENCE }}>
            <b>{verse.copyReference}</b>
          </Text>
          <Text
            size="T300"
            style={{
              fontSize,
              lineHeight: 2,
              whiteSpace: 'pre-wrap',
              color: TEXT_MAIN,
              paddingInlineEnd: toRem(6),
              wordBreak: 'break-word',
            }}
          >
            {highlightText(verse.text, highlightPattern)}
          </Text>
        </Box>
        <Box shrink="No" wrap="Wrap" gap="150" justifyContent="End">
          <BiblePillButton
            onClick={(evt) => {
              evt.stopPropagation();
              onCopy(verse);
            }}
            style={{ minHeight: 34, paddingInline: toRem(14) }}
          >
            {CN.copy}
          </BiblePillButton>
          {onJump && (
            <BiblePillButton
              onClick={(evt) => {
                evt.stopPropagation();
                onJump(verse);
              }}
              style={{ minHeight: 34, paddingInline: toRem(14) }}
            >
              {CN.jump}
            </BiblePillButton>
          )}
        </Box>
      </Box>
    </Box>
  );
}

export function BibleExperienceModal({
  open,
  requestClose,
  onInsertSelected,
}: BibleExperienceModalProps) {
  const [data, setData] = useState<BibleData>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [selectedBookName, setSelectedBookName] = useState('');
  const [selectedChapter, setSelectedChapter] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [scopeMode, setScopeMode] = useState<BibleSearchScopeMode>('all');
  const [customScopeBooks, setCustomScopeBooks] = useState<string[]>([]);
  const [activeTestament, setActiveTestament] = useState<TestamentTab>('old');
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const [browserCollapsed, setBrowserCollapsed] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [focusedVerseKey, setFocusedVerseKey] = useState<string>();
  const [pendingFocusVerseKey, setPendingFocusVerseKey] = useState<string>();
  const [currentPage, setCurrentPage] = useState(1);
  const [fontSize, setFontSize] = useState(17);
  const [pageJumpOpen, setPageJumpOpen] = useState<'start-ellipsis' | 'end-ellipsis'>();
  const [pageJumpValue, setPageJumpValue] = useState('');
  const verseScrollRef = useRef<HTMLDivElement>(null);
  const verseRowRefMap = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    let mounted = true;

    loadBibleData()
      .then((nextData) => {
        if (!mounted) return;
        setData(nextData);
        const initialBook =
          nextData.books.find((book) => book.testament === CN.old) ?? nextData.books[0];
        if (initialBook) {
          setSelectedBookName(initialBook.name);
          setActiveTestament(initialBook.testament === CN.new ? 'new' : 'old');
        }
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : CN.loadFailed);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const selectedBook = useMemo(
    () => (data ? resolveBibleBook(data, selectedBookName) ?? data.books[0] : undefined),
    [data, selectedBookName]
  );
  const oldBooks = useMemo(
    () => data?.books.filter((book) => book.testament === CN.old) ?? [],
    [data]
  );
  const newBooks = useMemo(
    () => data?.books.filter((book) => book.testament === CN.new) ?? [],
    [data]
  );
  const visibleBooks = activeTestament === 'old' ? oldBooks : newBooks;
  const chapterVerses = useMemo(() => {
    if (!data || !selectedBook) return [];
    return getChapterVerses(data, selectedBook.name, selectedChapter);
  }, [data, selectedBook, selectedChapter]);
  const isSearchMode = searchInput.trim().length > 0;
  const searchResult = useMemo(
    () =>
      data
        ? searchBible(data, searchInput, {
            mode: scopeMode,
            currentBookName: selectedBook?.name,
            bookNames: customScopeBooks,
          })
        : { verses: [], keywords: [] },
    [customScopeBooks, data, scopeMode, searchInput, selectedBook]
  );
  const activeVerses = isSearchMode ? searchResult.verses : chapterVerses;
  const totalPages = Math.max(1, Math.ceil(activeVerses.length / PAGE_SIZE));
  const pageVerses = useMemo(
    () =>
      activeVerses.slice((currentPage - 1) * PAGE_SIZE, (currentPage - 1) * PAGE_SIZE + PAGE_SIZE),
    [activeVerses, currentPage]
  );
  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const selectedVerses = useMemo(
    () => data?.verses.filter((verse) => selectedSet.has(verse.key)) ?? [],
    [data, selectedSet]
  );
  const selectedText = useMemo(
    () => selectedVerses.map((verse) => formatBibleVerse(verse)).join('\n'),
    [selectedVerses]
  );
  const previewText = useMemo(() => {
    if (selectedVerses.length === 0) return '暂未选择经文，可直接点击下方经文开始多选。';
    const preview = selectedVerses
      .slice(0, 2)
      .map((verse) => formatBibleVerse(verse))
      .join(' ');
    return selectedVerses.length > 2 ? `${preview} ...` : preview;
  }, [selectedVerses]);
  const highlightPattern = useMemo(
    () => getHighlightPattern(searchResult.keywords),
    [searchResult.keywords]
  );
  const scopeLabel = useMemo(
    () => getScopeLabel(scopeMode, selectedBook, customScopeBooks),
    [customScopeBooks, scopeMode, selectedBook]
  );
  const canGoPrevChapter = !!selectedBook && selectedChapter > 1;
  const canGoNextChapter = !!selectedBook && selectedChapter < selectedBook.chapterCount;
  const pageItems = useMemo(() => buildPageItems(currentPage, totalPages), [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    scrollToTop(verseScrollRef);
  }, [currentPage, selectedBook?.name, selectedChapter, isSearchMode]);

  useEffect(() => {
    if (!pendingFocusVerseKey) return;
    if (!pageVerses.some((verse) => verse.key === pendingFocusVerseKey)) return;

    const node = verseRowRefMap.current[pendingFocusVerseKey];
    if (!node) return;

    if (typeof node.focus === 'function') {
      node.focus({ preventScroll: true });
    }
    node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setFocusedVerseKey(pendingFocusVerseKey);
    setPendingFocusVerseKey(undefined);
  }, [pageVerses, pendingFocusVerseKey]);

  useEffect(() => {
    if (!focusedVerseKey) return;

    const timerId = window.setTimeout(() => {
      setFocusedVerseKey((current) => (current === focusedVerseKey ? undefined : current));
    }, 2400);

    return () => window.clearTimeout(timerId);
  }, [focusedVerseKey]);

  const openBook = (book: BibleBook) => {
    setSelectedBookName(book.name);
    setActiveTestament(book.testament === CN.new ? 'new' : 'old');
    setSelectedChapter(1);
    setCurrentPage(1);
  };

  const openChapter = (bookName: string, chapter: number, page = 1, collapseBrowser = true) => {
    const targetBook = data ? resolveBibleBook(data, bookName) : undefined;
    setSelectedBookName(bookName);
    setSelectedChapter(chapter);
    setSearchInput('');
    setCurrentPage(page);
    if (targetBook) {
      setActiveTestament(targetBook.testament === CN.new ? 'new' : 'old');
    }
    if (collapseBrowser) {
      setBrowserCollapsed(true);
    }
  };

  const changeChapter = (direction: -1 | 1) => {
    if (!selectedBook) return;
    const nextChapter = selectedChapter + direction;
    if (nextChapter < 1 || nextChapter > selectedBook.chapterCount) return;
    openChapter(selectedBook.name, nextChapter, 1, false);
  };

  const toggleCustomBook = (bookName: string) => {
    setCustomScopeBooks((current) =>
      current.includes(bookName)
        ? current.filter((item) => item !== bookName)
        : current.concat(bookName)
    );
    setCurrentPage(1);
  };

  const handleJumpToVerse = (verse: BibleVerse) => {
    if (!data) return;
    const targetChapterVerses = getChapterVerses(data, verse.book, verse.chapter);
    const verseIndex = targetChapterVerses.findIndex((item) => item.key === verse.key);
    const page = verseIndex >= 0 ? Math.floor(verseIndex / PAGE_SIZE) + 1 : 1;
    setSelectedKeys((current) => (current.includes(verse.key) ? current : current.concat(verse.key)));
    setPendingFocusVerseKey(verse.key);
    setFocusedVerseKey(verse.key);
    openChapter(verse.book, verse.chapter, page, true);
  };

  const handleCopySelected = () => {
    if (!selectedText) return;
    copyToClipboard(selectedText);
  };

  const handleInsert = () => {
    if (!selectedText || !onInsertSelected) return;
    onInsertSelected(selectedText);
    requestClose();
  };

  const handleToggleVerse = (verse: BibleVerse) => {
    setSelectedKeys((current) =>
      current.includes(verse.key)
        ? current.filter((item) => item !== verse.key)
        : current.concat(verse.key)
    );
  };

  const handlePageJumpCommit = () => {
    const nextPage = Number(pageJumpValue);
    if (!Number.isFinite(nextPage)) return;
    setCurrentPage(clamp(Math.trunc(nextPage), 1, totalPages));
    setPageJumpOpen(undefined);
    setPageJumpValue('');
  };

  useEffect(() => {
    const handleKeyDown = (evt: KeyboardEvent) => {
      const editable = isEditableTarget(evt.target);

      if (isKeyHotkey('mod+c', evt)) {
        if (editable || !selectedText) return;
        evt.preventDefault();
        handleCopySelected();
        return;
      }

      if (isKeyHotkey('mod+x', evt)) {
        if (editable) return;
        evt.preventDefault();
        setSelectedKeys([]);
        return;
      }

      if (editable) return;

      const wantsPrevChapter = isPrevChapterKey(evt);
      const wantsNextChapter = isNextChapterKey(evt);

      if ((wantsPrevChapter || wantsNextChapter) && evt.repeat) {
        evt.preventDefault();
        return;
      }

      if (evt.key === 'ArrowDown') {
        evt.preventDefault();
        verseScrollRef.current?.scrollBy({ top: fontSize * 5.5, behavior: 'smooth' });
        return;
      }

      if (evt.key === 'ArrowUp') {
        evt.preventDefault();
        verseScrollRef.current?.scrollBy({ top: fontSize * -5.5, behavior: 'smooth' });
        return;
      }

      if (evt.key === 'ArrowLeft' && currentPage > 1) {
        evt.preventDefault();
        setCurrentPage((page) => Math.max(page - 1, 1));
        return;
      }

      if (evt.key === 'ArrowRight' && currentPage < totalPages) {
        evt.preventDefault();
        setCurrentPage((page) => Math.min(page + 1, totalPages));
        return;
      }

      if (wantsPrevChapter) {
        evt.preventDefault();
        if (canGoPrevChapter) {
          changeChapter(-1);
        }
        return;
      }

      if (wantsNextChapter) {
        evt.preventDefault();
        if (canGoNextChapter) {
          changeChapter(1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    canGoNextChapter,
    canGoPrevChapter,
    currentPage,
    fontSize,
    selectedBook?.chapterCount,
    selectedBook?.name,
    selectedChapter,
    selectedText,
    totalPages,
  ]);

  if (!open) return null;

  const sectionTitle = isSearchMode
    ? `搜索：${searchResult.keywords.join(' ')}`
    : `${selectedBook?.name ?? ''} 第 ${selectedChapter} 章`;
  const sectionDescription = isSearchMode
    ? `共找到 ${activeVerses.length} 节匹配经文，当前范围：${scopeLabel}。${CN.searchHintSuffix}`
    : `本章共 ${chapterVerses.length} 节，支持多选复制，并可通过底部分页继续浏览。`;
  const headerHint = `${CN.keyboardHint} ${CN.selectionHelp}`;

  return (
    <Overlay open backdrop={<OverlayBackdrop onClick={requestClose} />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: requestClose,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Modal
            className={ModalWide}
            variant="Background"
            style={{ display: 'flex', flexDirection: 'column', minHeight: '92vh', maxHeight: '92vh' }}
          >
            <Header
              variant="Surface"
              size="500"
              style={{ padding: `${toRem(28)} ${toRem(28)} ${toRem(32)}`, borderBottom: SOFT_LINE }}
            >
              <Box grow="Yes" direction="Column" gap="200" style={{ paddingBlock: toRem(8) }}>
                <Text size="H4">{CN.title}</Text>
                <Text size="T300" priority="300" style={{ lineHeight: 1.85 }}>
                  {headerHint}
                </Text>
              </Box>
              <IconButton onClick={requestClose} size="300" radii="300">
                <Icon src={Icons.Cross} />
              </IconButton>
            </Header>

            <Box grow="Yes" direction="Column" style={{ minHeight: 0 }}>
              {loading && (
                <Box grow="Yes" alignItems="Center" justifyContent="Center">
                  <Text size="L400">{CN.loading}</Text>
                </Box>
              )}

              {!loading && error && (
                <Box grow="Yes" alignItems="Center" justifyContent="Center" direction="Column" gap="200">
                  <Text size="L400">{CN.loadFailed}</Text>
                  <Text size="T300">{error}</Text>
                </Box>
              )}

              {!loading && !error && data && selectedBook && (
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: `${toRem(18)} ${toRem(20)}` }}>
                  <Box direction="Column" gap="300">
                    {!toolbarCollapsed && (
                      <SequenceCard
                        variant="SurfaceVariant"
                        direction="Column"
                        gap="220"
                        style={{ ...CARD_STYLE, padding: `${toRem(22)} ${toRem(24)}` }}
                      >
                        <Box direction="Column" gap="220">
                          <Box wrap="Wrap" gap="220" alignItems="Start" justifyContent="SpaceBetween">
                            <Box
                              grow="Yes"
                              direction="Column"
                              gap="120"
                              style={{ minWidth: 0, paddingBlock: `${toRem(4)} ${toRem(2)}` }}
                            >
                              <Text size="H4">{CN.title}</Text>
                              <Text
                                size="T300"
                                priority="300"
                                style={{ lineHeight: 1.78, color: TEXT_MAIN }}
                              >
                                {CN.intro}
                              </Text>
                            </Box>
                            <BiblePillButton onClick={() => setToolbarCollapsed(true)}>
                              {CN.collapseToolbar}
                            </BiblePillButton>
                          </Box>

                          <Box direction="Column" gap="250" style={PANEL_STYLE}>
                            <Input
                              value={searchInput}
                              onChange={(evt) => {
                                setSearchInput(evt.currentTarget.value);
                                setCurrentPage(1);
                              }}
                              onKeyDown={(evt) => {
                                if (evt.key !== 'Enter') return;
                                if (!browserCollapsed) {
                                  setBrowserCollapsed(true);
                                }
                              }}
                              placeholder={CN.searchPlaceholder}
                              variant="Background"
                              outlined
                              size="400"
                              style={{ background: 'rgba(255, 255, 255, 0.88)', borderRadius: toRem(18) }}
                            />

                            <Box wrap="Wrap" gap="200" alignItems="Start" justifyContent="SpaceBetween">
                              <Text
                                size="T300"
                                priority="300"
                                style={{ lineHeight: 1.75, color: TEXT_MAIN, maxWidth: toRem(560) }}
                              >
                                {CN.searchHelp}
                              </Text>
                              <Text size="T300" priority="300">
                                {`${CN.selected} ${selectedVerses.length} ${CN.verses}`}
                              </Text>
                            </Box>

                            <Box wrap="Wrap" gap="200" alignItems="Start" justifyContent="SpaceBetween">
                              <Box grow="Yes" direction="Column" gap="100" style={{ minWidth: 0 }}>
                                <Text size="T300" priority="300">
                                  {CN.rangeTitle}
                                </Text>
                                <Box wrap="Wrap" gap="100" style={SEGMENT_STYLE}>
                                  {scopeOptions.map((option) => (
                                    <BiblePillButton
                                      key={option.value}
                                      active={scopeMode === option.value}
                                      onClick={() => {
                                        setScopeMode(option.value);
                                        setCurrentPage(1);
                                      }}
                                    >
                                      {option.label}
                                    </BiblePillButton>
                                  ))}
                                </Box>
                              </Box>
                              <Box shrink="No" wrap="Wrap" gap="100" justifyContent="End">
                                <BiblePillButton onClick={handleCopySelected} disabled={!selectedText}>
                                  {CN.copySelected}
                                </BiblePillButton>
                                {onInsertSelected && (
                                  <BiblePillButton onClick={handleInsert} disabled={!selectedText}>
                                    {CN.insert}
                                  </BiblePillButton>
                                )}
                                <BiblePillButton
                                  onClick={() => setSelectedKeys([])}
                                  disabled={selectedKeys.length === 0}
                                >
                                  {CN.reset}
                                </BiblePillButton>
                              </Box>
                            </Box>

                            {scopeMode === 'custom' && (
                              <Box direction="Column" gap="200" style={SOFT_SCROLL_PANEL_STYLE}>
                                <Text size="T300" priority="300">
                                  {CN.customBooks}
                                </Text>
                                {[oldBooks, newBooks].map((books, index) => (
                                  <Box key={index === 0 ? CN.old : CN.new} direction="Column" gap="100">
                                    <Text size="T300" priority="300">
                                      {index === 0 ? CN.old : CN.new}
                                    </Text>
                                    <Box wrap="Wrap" gap="100">
                                      {books.map((book) => {
                                        const active = customScopeBooks.includes(book.name);
                                        return (
                                          <BiblePillButton
                                            key={book.bookNumber}
                                            active={active}
                                            onClick={() => toggleCustomBook(book.name)}
                                          >
                                            {book.name}
                                          </BiblePillButton>
                                        );
                                      })}
                                    </Box>
                                  </Box>
                                ))}
                              </Box>
                            )}

                            <Box
                              direction="Column"
                              gap="100"
                              style={{
                                borderRadius: toRem(20),
                                border: '1px solid rgba(191, 219, 254, 0.96)',
                                background: 'rgba(239, 246, 255, 0.78)',
                                padding: toRem(18),
                              }}
                            >
                              <Text size="T300" style={{ color: TEXT_MAIN }}>
                                <b>{`${CN.selected} ${selectedVerses.length} ${CN.verses}`}</b>
                              </Text>
                              <Text
                                size="T300"
                                priority="300"
                                style={{
                                  lineHeight: 1.8,
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-word',
                                  color: TEXT_MAIN,
                                }}
                              >
                                {previewText}
                              </Text>
                            </Box>
                          </Box>
                        </Box>
                      </SequenceCard>
                    )}

                    {!browserCollapsed && (
                      <SequenceCard
                        variant="SurfaceVariant"
                        direction="Column"
                        gap="220"
                        style={{ ...CARD_STYLE, padding: `${toRem(22)} ${toRem(24)}` }}
                      >
                        <Box direction="Column" gap="200">
                          <Box wrap="Wrap" gap="220" alignItems="Start" justifyContent="SpaceBetween">
                            <Box grow="Yes" direction="Column" gap="100" style={{ minWidth: 0 }}>
                              <Text size="L400">
                                <b>{CN.browseTitle}</b>
                              </Text>
                              <Text size="T300" priority="300" style={{ lineHeight: 1.75 }}>
                                {CN.browseHelp}
                              </Text>
                            </Box>
                            <BiblePillButton onClick={() => setBrowserCollapsed(true)}>
                              {CN.collapse}
                            </BiblePillButton>
                          </Box>

                          <Box direction="Column" gap="200" style={PANEL_STYLE}>
                            <Box wrap="Wrap" gap="100" style={SEGMENT_STYLE}>
                              <BiblePillButton
                                active={activeTestament === 'old'}
                                onClick={() => setActiveTestament('old')}
                              >
                                {CN.old}
                              </BiblePillButton>
                              <BiblePillButton
                                active={activeTestament === 'new'}
                                onClick={() => setActiveTestament('new')}
                              >
                                {CN.new}
                              </BiblePillButton>
                            </Box>

                            <Box direction="Column" gap="120">
                              <Text size="T300" priority="300">
                                书卷
                              </Text>
                              <Box
                                wrap="Wrap"
                                gap="100"
                                style={{
                                  ...SOFT_SCROLL_PANEL_STYLE,
                                  maxHeight: toRem(182),
                                  overflowY: 'auto',
                                  paddingRight: toRem(10),
                                }}
                              >
                                {visibleBooks.map((book) => (
                                  <BiblePillButton
                                    key={book.bookNumber}
                                    active={book.name === selectedBook.name}
                                    onClick={() => openBook(book)}
                                  >
                                    {book.name}
                                  </BiblePillButton>
                                ))}
                              </Box>
                            </Box>

                            <Box direction="Column" gap="120">
                              <Text size="T300" priority="300">
                                {`${selectedBook.name} · ${CN.chapterTitle}`}
                              </Text>
                              <Box
                                wrap="Wrap"
                                gap="100"
                                style={{
                                  ...SOFT_SCROLL_PANEL_STYLE,
                                  maxHeight: toRem(176),
                                  overflowY: 'auto',
                                  paddingRight: toRem(10),
                                }}
                              >
                                {selectedBook.chapters.map((chapter) => (
                                  <BiblePillButton
                                    key={chapter}
                                    active={chapter === selectedChapter}
                                    onClick={() => openChapter(selectedBook.name, chapter, 1, true)}
                                  >
                                    {chapter}
                                  </BiblePillButton>
                                ))}
                              </Box>
                            </Box>
                          </Box>
                        </Box>
                      </SequenceCard>
                    )}

                    <SequenceCard
                      variant="SurfaceVariant"
                      direction="Column"
                      gap="0"
                      style={{ ...CARD_STYLE, padding: 0, overflow: 'hidden' }}
                    >
                      <Box direction="Column" gap="220" style={{ padding: `${toRem(24)} ${toRem(28)}` }}>
                        <Box wrap="Wrap" gap="250" alignItems="Start" justifyContent="SpaceBetween">
                          <Box grow="Yes" direction="Column" gap="100" style={{ minWidth: 0 }}>
                            <Text size="H3">{sectionTitle}</Text>
                            <Text size="T300" priority="300" style={{ lineHeight: 1.8 }}>
                              {sectionDescription}
                            </Text>
                          </Box>
                          <Text size="T300" priority="300">
                            {isSearchMode
                              ? `${CN.searchSummary} ${activeVerses.length} ${CN.verses} · 第 ${currentPage}/${totalPages} ${CN.page}`
                              : `${CN.chapterSummary} ${chapterVerses.length} ${CN.verses} · 第 ${currentPage}/${totalPages} ${CN.page}`}
                          </Text>
                        </Box>

                        <Box wrap="Wrap" gap="120" alignItems="End" justifyContent="SpaceBetween">
                          <Box wrap="Wrap" gap="100" alignItems="Center">
                            <BiblePillButton
                              onClick={() => changeChapter(-1)}
                              disabled={!canGoPrevChapter}
                            >
                              {CN.prevChapter}
                            </BiblePillButton>
                            <BiblePillButton
                              onClick={() => changeChapter(1)}
                              disabled={!canGoNextChapter}
                            >
                              {CN.nextChapter}
                            </BiblePillButton>
                            <BiblePillButton onClick={() => setBrowserCollapsed((state) => !state)}>
                              {browserCollapsed ? CN.expand : CN.collapse}
                            </BiblePillButton>
                            {toolbarCollapsed && (
                              <BiblePillButton onClick={() => setToolbarCollapsed(false)}>
                                {CN.expandToolbar}
                              </BiblePillButton>
                            )}
                          </Box>

                          <Box shrink="No" wrap="Wrap" gap="100" alignItems="Center" justifyContent="End">
                            {isSearchMode && (
                              <BiblePillButton
                                onClick={() => {
                                  setSearchInput('');
                                  setCurrentPage(1);
                                }}
                              >
                                {CN.backToChapter}
                              </BiblePillButton>
                            )}
                            <Text size="T300" priority="300">
                              字体大小
                            </Text>
                            <Box wrap="Wrap" gap="100" style={SEGMENT_STYLE}>
                              <BiblePillButton
                                onClick={() =>
                                  setFontSize((size) =>
                                    clamp(size - FONT_SIZE_STEP, FONT_SIZE_MIN, FONT_SIZE_MAX)
                                  )
                                }
                                disabled={fontSize <= FONT_SIZE_MIN}
                              >
                                {CN.fontSmaller}
                              </BiblePillButton>
                              <BiblePillButton
                                active={fontSize === 17}
                                onClick={() => setFontSize(17)}
                              >
                                {CN.fontReset}
                              </BiblePillButton>
                              <BiblePillButton
                                onClick={() =>
                                  setFontSize((size) =>
                                    clamp(size + FONT_SIZE_STEP, FONT_SIZE_MIN, FONT_SIZE_MAX)
                                  )
                                }
                                disabled={fontSize >= FONT_SIZE_MAX}
                              >
                                {CN.fontLarger}
                              </BiblePillButton>
                            </Box>
                          </Box>
                        </Box>
                      </Box>

                      <Line size="300" variant="Surface" />

                      <div
                        ref={verseScrollRef}
                        style={{
                          minHeight: toRem(360),
                          maxHeight: '56vh',
                          overflowY: 'auto',
                          paddingInline: toRem(10),
                          scrollPaddingTop: toRem(20),
                        }}
                      >
                        {pageVerses.length === 0 && (
                          <Box
                            alignItems="Center"
                            justifyContent="Center"
                            style={{ minHeight: toRem(240), padding: `${toRem(24)} ${toRem(28)}` }}
                          >
                            <Text size="L400">{CN.noResult}</Text>
                          </Box>
                        )}

                        {pageVerses.map((verse) => (
                          <VerseRow
                            key={verse.key}
                            verse={verse}
                            selected={selectedSet.has(verse.key)}
                            focused={focusedVerseKey === verse.key}
                            fontSize={fontSize}
                            onToggle={handleToggleVerse}
                            onCopy={(targetVerse) => copyToClipboard(formatBibleVerse(targetVerse))}
                            onJump={isSearchMode ? handleJumpToVerse : undefined}
                            highlightPattern={isSearchMode ? highlightPattern : undefined}
                            rowRef={(node) => {
                              verseRowRefMap.current[verse.key] = node;
                            }}
                          />
                        ))}
                      </div>

                      <Line size="300" variant="Surface" />

                      <Box
                        wrap="Wrap"
                        gap="250"
                        alignItems="Center"
                        justifyContent="SpaceBetween"
                        style={{ padding: `${toRem(16)} ${toRem(28)}` }}
                      >
                        <Text size="T300" priority="300">
                          {CN.keyboardHint}
                        </Text>
                        <Text size="T300" priority="300">
                          {`${CN.selected} ${selectedVerses.length} ${CN.verses}`}
                        </Text>
                      </Box>

                      {totalPages > 1 && (
                        <>
                          <Line size="300" variant="Surface" />
                          <Box
                            wrap="Wrap"
                            gap="100"
                            alignItems="Center"
                            justifyContent="Center"
                            style={{ padding: `${toRem(18)} ${toRem(28)} ${toRem(24)}` }}
                          >
                            <BiblePillButton
                              onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
                              disabled={currentPage <= 1}
                            >
                              上一页
                            </BiblePillButton>

                            {pageItems.map((item) =>
                              typeof item === 'number' ? (
                                <BiblePillButton
                                  key={item}
                                  active={item === currentPage}
                                  onClick={() => setCurrentPage(item)}
                                >
                                  {item}
                                </BiblePillButton>
                              ) : pageJumpOpen === item ? (
                                <input
                                  key={item}
                                  value={pageJumpValue}
                                  onChange={(evt) =>
                                    setPageJumpValue(evt.currentTarget.value.replace(/[^\d]/g, ''))
                                  }
                                  onBlur={handlePageJumpCommit}
                                  onKeyDown={(evt) => {
                                    if (evt.key === 'Enter') {
                                      evt.preventDefault();
                                      handlePageJumpCommit();
                                    }
                                    if (evt.key === 'Escape') {
                                      setPageJumpOpen(undefined);
                                      setPageJumpValue('');
                                    }
                                  }}
                                  placeholder={CN.pageJump}
                                  autoFocus
                                  style={{
                                    ...INPUT_STYLE,
                                    minHeight: 38,
                                    width: toRem(76),
                                    background: 'rgba(255, 255, 255, 0.9)',
                                  }}
                                />
                              ) : (
                                <BiblePillButton
                                  key={item}
                                  onClick={() => {
                                    setPageJumpOpen(item);
                                    setPageJumpValue('');
                                  }}
                                >
                                  ...
                                </BiblePillButton>
                              )
                            )}

                            <BiblePillButton
                              onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
                              disabled={currentPage >= totalPages}
                            >
                              下一页
                            </BiblePillButton>
                          </Box>
                        </>
                      )}
                    </SequenceCard>
                  </Box>
                </div>
              )}
            </Box>
          </Modal>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
