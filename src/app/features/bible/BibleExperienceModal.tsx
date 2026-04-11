import React, { CSSProperties, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import {
  Box,
  Button,
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
const BLUE_ACCENT = '#3b82f6';
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
  copyPage: '复制本页',
  insert: '插入聊天框',
  reset: '清空选择',
  browseTitle: '卷章浏览',
  browseHelp: '先选卷名，再选章节；选中章节后浏览区会自动收起。',
  expand: '展开卷章',
  collapse: '收起卷章',
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
  fontSize: number;
  onToggle: (verse: BibleVerse) => void;
  onCopy: (verse: BibleVerse) => void;
  onJump?: (verse: BibleVerse) => void;
  highlightPattern?: RegExp;
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

function VerseRow({
  verse,
  selected,
  fontSize,
  onToggle,
  onCopy,
  onJump,
  highlightPattern,
}: VerseRowProps) {
  return (
    <Box
      as="button"
      type="button"
      onClick={() => onToggle(verse)}
      direction="Column"
      gap="250"
      style={{
        width: '100%',
        border: 'none',
        borderBottom: SOFT_LINE,
        background: selected ? 'rgba(219, 234, 254, 0.78)' : 'transparent',
        boxShadow: selected ? `inset 3px 0 0 ${BLUE_ACCENT}` : 'none',
        padding: `${config.space.S350} ${config.space.S450}`,
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <Box gap="300" alignItems="Start">
        <Box grow="Yes" direction="Column" gap="150" style={{ minWidth: 0 }}>
          <Text size="L400" style={{ color: RED_REFERENCE }}>
            <b>{verse.copyReference}</b>
          </Text>
          <Text
            size="T300"
            style={{ fontSize, lineHeight: 1.95, whiteSpace: 'pre-wrap', color: '#0f172a' }}
          >
            {highlightText(verse.text, highlightPattern)}
          </Text>
        </Box>
        <Box shrink="No" wrap="Wrap" gap="150" justifyContent="End">
          <Button
            size="300"
            variant="Secondary"
            fill="Soft"
            radii="300"
            onClick={(evt) => {
              evt.stopPropagation();
              onCopy(verse);
            }}
          >
            <Text size="B300">{CN.copy}</Text>
          </Button>
          {onJump && (
            <Button
              size="300"
              variant="Primary"
              fill="Soft"
              radii="300"
              onClick={(evt) => {
                evt.stopPropagation();
                onJump(verse);
              }}
            >
              <Text size="B300">{CN.jump}</Text>
            </Button>
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
  const [browserCollapsed, setBrowserCollapsed] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [fontSize, setFontSize] = useState(17);
  const [pageJumpOpen, setPageJumpOpen] = useState<'start-ellipsis' | 'end-ellipsis'>();
  const [pageJumpValue, setPageJumpValue] = useState('');
  const verseScrollRef = useRef<HTMLDivElement>(null);

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
  const pageText = useMemo(
    () => pageVerses.map((verse) => formatBibleVerse(verse)).join('\n'),
    [pageVerses]
  );
  const previewText = useMemo(() => {
    if (selectedVerses.length === 0) return CN.selectionHelp;
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
    openChapter(verse.book, verse.chapter, page, true);
  };

  const handleCopySelected = () => {
    if (!selectedText) return;
    copyToClipboard(selectedText);
  };

  const handleCopyPage = () => {
    if (!pageText) return;
    copyToClipboard(pageText);
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

      if (evt.key === '-' && canGoPrevChapter) {
        evt.preventDefault();
        changeChapter(-1);
        return;
      }

      if ((evt.key === '+' || evt.key === '=') && canGoNextChapter) {
        evt.preventDefault();
        changeChapter(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canGoNextChapter, canGoPrevChapter, currentPage, fontSize, selectedText, totalPages]);

  if (!open) return null;

  const sectionTitle = isSearchMode
    ? `搜索：${searchResult.keywords.join(' ')}`
    : `${selectedBook?.name ?? ''} 第 ${selectedChapter} 章`;
  const sectionDescription = isSearchMode
    ? `共找到 ${activeVerses.length} 节匹配经文，当前范围：${scopeLabel}。${CN.searchHintSuffix}`
    : `本章共 ${chapterVerses.length} 节，支持多选复制，并可通过底部分页继续浏览。`;

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
              style={{ padding: `${config.space.S300} ${config.space.S350}`, borderBottom: SOFT_LINE }}
            >
              <Box grow="Yes" direction="Column" gap="100">
                <Text size="H4">{CN.title}</Text>
                <Text size="T300" priority="300">
                  {CN.keyboardHint}
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
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: config.space.S350 }}>
                  <Box direction="Column" gap="300">
                    <SequenceCard variant="SurfaceVariant" direction="Column" gap="300" style={CARD_STYLE}>
                      <Box wrap="Wrap" gap="250" alignItems="Start">
                        <Box grow="Yes" direction="Column" gap="100">
                          <Text size="H4">{CN.title}</Text>
                          <Text size="T300" priority="300" style={{ lineHeight: 1.75 }}>
                            {CN.intro}
                          </Text>
                        </Box>
                        <Box wrap="Wrap" gap="100" justifyContent="End">
                          <Button
                            size="300"
                            variant="Secondary"
                            fill="Soft"
                            radii="300"
                            onClick={() =>
                              setFontSize((size) =>
                                clamp(size - FONT_SIZE_STEP, FONT_SIZE_MIN, FONT_SIZE_MAX)
                              )
                            }
                            disabled={fontSize <= FONT_SIZE_MIN}
                          >
                            <Text size="B300">{CN.fontSmaller}</Text>
                          </Button>
                          <Button
                            size="300"
                            variant="Secondary"
                            fill="Soft"
                            radii="300"
                            onClick={() => setFontSize(17)}
                            disabled={fontSize === 17}
                          >
                            <Text size="B300">{CN.fontReset}</Text>
                          </Button>
                          <Button
                            size="300"
                            variant="Secondary"
                            fill="Soft"
                            radii="300"
                            onClick={() =>
                              setFontSize((size) =>
                                clamp(size + FONT_SIZE_STEP, FONT_SIZE_MIN, FONT_SIZE_MAX)
                              )
                            }
                            disabled={fontSize >= FONT_SIZE_MAX}
                          >
                            <Text size="B300">{CN.fontLarger}</Text>
                          </Button>
                        </Box>
                      </Box>

                      <Input
                        value={searchInput}
                        onChange={(evt) => {
                          setSearchInput(evt.currentTarget.value);
                          setCurrentPage(1);
                        }}
                        placeholder={CN.searchPlaceholder}
                        variant="Background"
                        outlined
                        size="400"
                      />
                      <Text size="T300" priority="300">
                        {CN.searchHelp}
                      </Text>

                      <Box direction="Column" gap="150">
                        <Text size="T300" priority="300">
                          {CN.rangeTitle}
                        </Text>
                        <Box wrap="Wrap" gap="100">
                          {scopeOptions.map((option) => (
                            <Button
                              key={option.value}
                              size="300"
                              variant={scopeMode === option.value ? 'Primary' : 'Secondary'}
                              fill={scopeMode === option.value ? 'Solid' : 'Soft'}
                              radii="300"
                              onClick={() => {
                                setScopeMode(option.value);
                                setCurrentPage(1);
                              }}
                            >
                              <Text size="B300">{option.label}</Text>
                            </Button>
                          ))}
                        </Box>
                      </Box>

                      {scopeMode === 'custom' && (
                        <Box direction="Column" gap="200">
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
                                    <Button
                                      key={book.bookNumber}
                                      size="300"
                                      variant={active ? 'Primary' : 'Secondary'}
                                      fill={active ? 'Solid' : 'Soft'}
                                      radii="300"
                                      onClick={() => toggleCustomBook(book.name)}
                                    >
                                      <Text size="B300">{book.name}</Text>
                                    </Button>
                                  );
                                })}
                              </Box>
                            </Box>
                          ))}
                        </Box>
                      )}

                      <Box
                        wrap="Wrap"
                        gap="250"
                        alignItems="Start"
                        style={{
                          borderRadius: toRem(18),
                          border: '1px solid rgba(219, 234, 254, 0.95)',
                          background: 'rgba(239, 246, 255, 0.82)',
                          padding: config.space.S300,
                        }}
                      >
                        <Box grow="Yes" direction="Column" gap="100" style={{ minWidth: 0 }}>
                          <Text size="L400">
                            <b>{`${CN.selected} ${selectedVerses.length} ${CN.verses}`}</b>
                          </Text>
                          <Text
                            size="T300"
                            priority="300"
                            style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                          >
                            {previewText}
                          </Text>
                        </Box>
                        <Box shrink="No" wrap="Wrap" gap="100" justifyContent="End">
                          <Button
                            size="300"
                            variant="Secondary"
                            fill="Soft"
                            radii="300"
                            onClick={handleCopySelected}
                            disabled={!selectedText}
                          >
                            <Text size="B300">{CN.copySelected}</Text>
                          </Button>
                          {onInsertSelected && (
                            <Button
                              size="300"
                              variant="Primary"
                              radii="300"
                              onClick={handleInsert}
                              disabled={!selectedText}
                            >
                              <Text size="B300">{CN.insert}</Text>
                            </Button>
                          )}
                          <Button
                            size="300"
                            variant="Secondary"
                            fill="Soft"
                            radii="300"
                            onClick={() => setSelectedKeys([])}
                            disabled={selectedKeys.length === 0}
                          >
                            <Text size="B300">{CN.reset}</Text>
                          </Button>
                        </Box>
                      </Box>
                    </SequenceCard>

                    <SequenceCard variant="SurfaceVariant" direction="Column" gap="250" style={CARD_STYLE}>
                      <Box wrap="Wrap" gap="250" alignItems="Center">
                        <Box grow="Yes" direction="Column" gap="100">
                          <Text size="L400">
                            <b>{CN.browseTitle}</b>
                          </Text>
                          <Text size="T300" priority="300">
                            {browserCollapsed
                              ? `${CN.currentLocation}：${selectedBook.name} 第 ${selectedChapter} 章`
                              : CN.browseHelp}
                          </Text>
                        </Box>
                        <Button
                          size="300"
                          variant="Secondary"
                          fill="Soft"
                          radii="300"
                          onClick={() => changeChapter(-1)}
                          disabled={!canGoPrevChapter}
                        >
                          <Text size="B300">{CN.prevChapter}</Text>
                        </Button>
                        <Button
                          size="300"
                          variant="Secondary"
                          fill="Soft"
                          radii="300"
                          onClick={() => setBrowserCollapsed((state) => !state)}
                        >
                          <Text size="B300">{browserCollapsed ? CN.expand : CN.collapse}</Text>
                        </Button>
                        <Button
                          size="300"
                          variant="Secondary"
                          fill="Soft"
                          radii="300"
                          onClick={() => changeChapter(1)}
                          disabled={!canGoNextChapter}
                        >
                          <Text size="B300">{CN.nextChapter}</Text>
                        </Button>
                      </Box>

                      {!browserCollapsed && (
                        <>
                          <Box wrap="Wrap" gap="100">
                            <Button
                              size="400"
                              variant={activeTestament === 'old' ? 'Primary' : 'Secondary'}
                              fill={activeTestament === 'old' ? 'Solid' : 'Soft'}
                              radii="300"
                              onClick={() => setActiveTestament('old')}
                            >
                              <Text size="B300">{CN.old}</Text>
                            </Button>
                            <Button
                              size="400"
                              variant={activeTestament === 'new' ? 'Primary' : 'Secondary'}
                              fill={activeTestament === 'new' ? 'Solid' : 'Soft'}
                              radii="300"
                              onClick={() => setActiveTestament('new')}
                            >
                              <Text size="B300">{CN.new}</Text>
                            </Button>
                          </Box>

                          <Box
                            wrap="Wrap"
                            gap="100"
                            style={{
                              maxHeight: toRem(170),
                              overflowY: 'auto',
                              paddingRight: config.space.S100,
                            }}
                          >
                            {visibleBooks.map((book) => (
                              <Button
                                key={book.bookNumber}
                                size="300"
                                variant={book.name === selectedBook.name ? 'Primary' : 'Secondary'}
                                fill={book.name === selectedBook.name ? 'Solid' : 'Soft'}
                                radii="300"
                                onClick={() => openBook(book)}
                              >
                                <Text size="B300">{book.name}</Text>
                              </Button>
                            ))}
                          </Box>

                          <Line size="300" variant="Surface" />

                          <Box direction="Column" gap="150">
                            <Text size="T300" priority="300">
                              {`${selectedBook.name} · ${CN.chapterTitle}`}
                            </Text>
                            <Box
                              wrap="Wrap"
                              gap="100"
                              style={{
                                maxHeight: toRem(164),
                                overflowY: 'auto',
                                paddingRight: config.space.S100,
                              }}
                            >
                              {selectedBook.chapters.map((chapter) => (
                                <Button
                                  key={chapter}
                                  size="300"
                                  variant={chapter === selectedChapter ? 'Primary' : 'Secondary'}
                                  fill={chapter === selectedChapter ? 'Solid' : 'Soft'}
                                  radii="300"
                                  onClick={() => openChapter(selectedBook.name, chapter, 1, true)}
                                >
                                  <Text size="B300">{chapter}</Text>
                                </Button>
                              ))}
                            </Box>
                          </Box>
                        </>
                      )}
                    </SequenceCard>

                    <SequenceCard
                      variant="SurfaceVariant"
                      direction="Column"
                      gap="0"
                      style={{ ...CARD_STYLE, padding: 0, overflow: 'hidden' }}
                    >
                      <Box wrap="Wrap" gap="250" alignItems="Start" style={{ padding: config.space.S450 }}>
                        <Box grow="Yes" direction="Column" gap="100">
                          <Text size="H3">{sectionTitle}</Text>
                          <Text size="T300" priority="300" style={{ lineHeight: 1.75 }}>
                            {sectionDescription}
                          </Text>
                        </Box>
                        <Box shrink="No" wrap="Wrap" gap="100" justifyContent="End">
                          <Text size="T300" priority="300">
                            {isSearchMode
                              ? `${CN.searchSummary} ${activeVerses.length} ${CN.verses} · 第 ${currentPage}/${totalPages} ${CN.page}`
                              : `${CN.chapterSummary} ${chapterVerses.length} ${CN.verses} · 第 ${currentPage}/${totalPages} ${CN.page}`}
                          </Text>
                          {isSearchMode && (
                            <Button
                              size="300"
                              variant="Secondary"
                              fill="Soft"
                              radii="300"
                              onClick={() => {
                                setSearchInput('');
                                setCurrentPage(1);
                              }}
                            >
                              <Text size="B300">{CN.backToChapter}</Text>
                            </Button>
                          )}
                          <Button
                            size="300"
                            variant="Secondary"
                            fill="Soft"
                            radii="300"
                            onClick={handleCopyPage}
                            disabled={!pageText}
                          >
                            <Text size="B300">{CN.copyPage}</Text>
                          </Button>
                        </Box>
                      </Box>

                      <Line size="300" variant="Surface" />

                      <div
                        ref={verseScrollRef}
                        style={{ minHeight: toRem(360), maxHeight: '56vh', overflowY: 'auto' }}
                      >
                        {pageVerses.length === 0 && (
                          <Box
                            alignItems="Center"
                            justifyContent="Center"
                            style={{ minHeight: toRem(240), padding: config.space.S500 }}
                          >
                            <Text size="L400">{CN.noResult}</Text>
                          </Box>
                        )}

                        {pageVerses.map((verse) => (
                          <VerseRow
                            key={verse.key}
                            verse={verse}
                            selected={selectedSet.has(verse.key)}
                            fontSize={fontSize}
                            onToggle={handleToggleVerse}
                            onCopy={(targetVerse) => copyToClipboard(formatBibleVerse(targetVerse))}
                            onJump={isSearchMode ? handleJumpToVerse : undefined}
                            highlightPattern={isSearchMode ? highlightPattern : undefined}
                          />
                        ))}
                      </div>

                      <Line size="300" variant="Surface" />

                      <Box
                        wrap="Wrap"
                        gap="250"
                        alignItems="Center"
                        justifyContent="SpaceBetween"
                        style={{ padding: `${config.space.S250} ${config.space.S400}` }}
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
                            style={{ padding: `${config.space.S300} ${config.space.S400}` }}
                          >
                            <Button
                              size="300"
                              variant="Secondary"
                              fill="Soft"
                              radii="300"
                              onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
                              disabled={currentPage <= 1}
                            >
                              <Text size="B300">上一页</Text>
                            </Button>

                            {pageItems.map((item) =>
                              typeof item === 'number' ? (
                                <Button
                                  key={item}
                                  size="300"
                                  variant={item === currentPage ? 'Primary' : 'Secondary'}
                                  fill={item === currentPage ? 'Solid' : 'Soft'}
                                  radii="300"
                                  onClick={() => setCurrentPage(item)}
                                >
                                  <Text size="B300">{item}</Text>
                                </Button>
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
                                  style={INPUT_STYLE}
                                />
                              ) : (
                                <Button
                                  key={item}
                                  size="300"
                                  variant="Secondary"
                                  fill="Soft"
                                  radii="300"
                                  onClick={() => {
                                    setPageJumpOpen(item);
                                    setPageJumpValue('');
                                  }}
                                >
                                  <Text size="B300">...</Text>
                                </Button>
                              )
                            )}

                            <Button
                              size="300"
                              variant="Secondary"
                              fill="Soft"
                              radii="300"
                              onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
                              disabled={currentPage >= totalPages}
                            >
                              <Text size="B300">下一页</Text>
                            </Button>
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
