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
  Scroll,
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
  BibleReference,
  BibleSearchScopeMode,
  BibleVerse,
  formatBibleVerse,
  getAdjacentChapter,
  getChapterVerses,
  loadBibleData,
  resolveBibleBook,
  searchBible,
} from './data';
import { BibleExperienceModal } from './BibleExperienceModal';

const PAGE_SIZE = 40;
const SOFT_LINE = '1px solid rgba(148, 163, 184, 0.18)';
const RED_REFERENCE = '#ff5a4f';
const BLUE_ACCENT = '#3b82f6';
const SELECT_STYLE: CSSProperties = {
  minHeight: 44,
  borderRadius: 14,
  border: '1px solid rgba(148, 163, 184, 0.28)',
  padding: `0 ${config.space.S300}`,
  background: 'rgba(255, 255, 255, 0.92)',
  color: 'inherit',
  outline: 'none',
};
const CARD_STYLE: CSSProperties = {
  borderRadius: toRem(28),
  padding: config.space.S400,
  border: SOFT_LINE,
  background:
    'linear-gradient(180deg, rgba(255,255,255,0.97) 0%, rgba(247,250,255,0.95) 100%)',
  boxShadow: '0 24px 64px rgba(148, 163, 184, 0.14)',
};
const PREVIEW_STYLE: CSSProperties = {
  borderRadius: toRem(18),
  border: '1px solid rgba(219, 234, 254, 0.95)',
  background: 'rgba(239, 246, 255, 0.72)',
  padding: config.space.S300,
  minHeight: toRem(88),
  maxHeight: toRem(164),
  overflowY: 'auto',
};
const CHAPTER_WRAP_STYLE: CSSProperties = {
  maxHeight: toRem(156),
  overflowY: 'auto',
  paddingRight: config.space.S100,
};
const LIST_STYLE: CSSProperties = {
  minHeight: 0,
  borderTop: SOFT_LINE,
};
const EMPTY_STYLE: CSSProperties = {
  minHeight: toRem(220),
  padding: config.space.S500,
};
const HIGHLIGHT_STYLE: CSSProperties = {
  background: 'rgba(253, 224, 71, 0.52)',
  borderRadius: 6,
  padding: '0 2px',
};

const CN = {
  title: '圣经',
  loading: '正在载入圣经数据...',
  loadFailed: '圣经数据加载失败',
  selected: '已选',
  verses: '节',
  copySelected: '复制已选 (Ctrl+C)',
  copyPage: '复制本页',
  insert: '插入聊天框',
  reset: '重置',
  selectedHelp: '点击经文即可多选，支持跨卷跨章累计选择；按 Ctrl+X 可快速清空选择。',
  previewPlaceholder: '可跨不同卷、不同章节累计选择经文，再一次性复制或插入聊天框。',
  browseTitle: '卷章浏览',
  searchTitle: '关键词搜索',
  searchPlaceholder: '输入经文内容关键词，多个关键词用空格分隔',
  searchHelp: '搜索框只搜索经文内容；卷和章请在下方单独选择。',
  bookLabel: '卷名',
  chapterLabel: '章节',
  searchRange: '筛选范围',
  all: '全部',
  old: '旧约',
  new: '新约',
  current: '当前卷',
  custom: '自定义多卷',
  customBooks: '选择卷范围',
  searchingIn: '搜索范围',
  chapterSummary: '本章共',
  searchSummary: '共找到',
  page: '页',
  prevPage: '上一页',
  nextPage: '下一页',
  prevChapter: '上一章 (-)',
  nextChapter: '下一章 (+)',
  chapterBrowse: '返回章节浏览',
  noResult: '没有找到匹配经文，请换个关键词或调整筛选范围。',
  noSelection: '请先选中一节或多节经文。',
  jump: '跳转',
  copy: '复制',
  keyboardHint: '方向键上下滚动、左右翻页，+/- 切换章节。',
  searchHintSuffix: '可继续调整约别或卷范围，再通过“跳转”回到原章节。',
} as const;

const scopeOptions: Array<{ value: BibleSearchScopeMode; label: string }> = [
  { value: 'all', label: CN.all },
  { value: 'old', label: CN.old },
  { value: 'new', label: CN.new },
  { value: 'current', label: CN.current },
  { value: 'custom', label: CN.custom },
];

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
};

const sortVerses = (verses: BibleVerse[]): BibleVerse[] =>
  [...verses].sort((a, b) => a.order - b.order);

const scrollToTop = (ref: React.RefObject<HTMLDivElement>) => {
  ref.current?.scrollTo({ top: 0, behavior: 'auto' });
};

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

const highlightText = (text: string, pattern?: RegExp): ReactNode => {
  if (!pattern) return text;

  const segments = text.split(pattern);
  if (segments.length <= 1) return text;

  return segments.map((segment, index) => {
    if (!segment) return null;
    if (pattern.test(segment)) {
      pattern.lastIndex = 0;
      return (
        <mark key={`${segment}-${index}`} style={HIGHLIGHT_STYLE}>
          {segment}
        </mark>
      );
    }
    pattern.lastIndex = 0;
    return <React.Fragment key={`${segment}-${index}`}>{segment}</React.Fragment>;
  });
};

type VerseRowProps = {
  verse: BibleVerse;
  selected: boolean;
  onToggle: (verse: BibleVerse) => void;
  onCopy: (verse: BibleVerse) => void;
  onJump?: (verse: BibleVerse) => void;
  highlightPattern?: RegExp;
};

function VerseRow({
  verse,
  selected,
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
      gap="200"
      style={{
        width: '100%',
        border: 'none',
        borderBottom: SOFT_LINE,
        background: selected ? 'rgba(219, 234, 254, 0.72)' : 'transparent',
        boxShadow: selected ? `inset 3px 0 0 ${BLUE_ACCENT}` : 'none',
        padding: `${config.space.S350} ${config.space.S400}`,
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <Box gap="300" alignItems="Start">
        <Box grow="Yes" direction="Column" gap="150" style={{ minWidth: 0 }}>
          <Text size="L400" style={{ color: RED_REFERENCE }}>
            <b>{verse.reference}</b>
          </Text>
          <Text size="T300" style={{ lineHeight: 1.85, whiteSpace: 'pre-wrap' }}>
            {highlightText(verse.text, highlightPattern)}
          </Text>
        </Box>
        <Box shrink="No" wrap="Wrap" gap="200" justifyContent="End">
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

type BibleViewProps = {
  requestClose: () => void;
  onInsertSelected?: (text: string) => void;
};

function BibleView({ requestClose, onInsertSelected }: BibleViewProps) {
  const [data, setData] = useState<BibleData>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [selectedBookName, setSelectedBookName] = useState('');
  const [selectedChapter, setSelectedChapter] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [scopeMode, setScopeMode] = useState<BibleSearchScopeMode>('all');
  const [customScopeBooks, setCustomScopeBooks] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const verseScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;

    loadBibleData()
      .then((nextData) => {
        if (!mounted) return;
        setData(nextData);
        if (nextData.books[0]) {
          setSelectedBookName(nextData.books[0].name);
        }
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : CN.loadFailed);
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const selectedBook = useMemo(
    () => (data ? resolveBibleBook(data, selectedBookName) ?? data.books[0] : undefined),
    [data, selectedBookName]
  );

  useEffect(() => {
    if (!selectedBook) return;
    if (selectedChapter < 1 || selectedChapter > selectedBook.chapterCount) {
      setSelectedChapter(1);
    }
  }, [selectedBook, selectedChapter]);

  const chapterReference = useMemo<BibleReference | undefined>(() => {
    if (!selectedBook) return undefined;
    return {
      book: selectedBook,
      chapter: selectedChapter,
    };
  }, [selectedBook, selectedChapter]);

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

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const viewSignature = isSearchMode
    ? `search:${searchInput.trim()}:${scopeMode}:${customScopeBooks.join('|')}`
    : `chapter:${selectedBook?.name ?? ''}:${selectedChapter}`;

  useEffect(() => {
    setCurrentPage(1);
    scrollToTop(verseScrollRef);
  }, [viewSignature]);

  useEffect(() => {
    scrollToTop(verseScrollRef);
  }, [currentPage]);

  const pageVerses = useMemo(
    () =>
      activeVerses.slice((currentPage - 1) * PAGE_SIZE, (currentPage - 1) * PAGE_SIZE + PAGE_SIZE),
    [activeVerses, currentPage]
  );

  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const selectedVerses = useMemo(() => {
    if (!data) return [];
    return sortVerses(data.verses.filter((verse) => selectedSet.has(verse.key)));
  }, [data, selectedSet]);
  const selectedText = useMemo(
    () => selectedVerses.map((verse) => formatBibleVerse(verse)).join('\n'),
    [selectedVerses]
  );
  const pageText = useMemo(() => pageVerses.map((verse) => formatBibleVerse(verse)).join('\n'), [pageVerses]);
  const selectedPreview = useMemo(
    () =>
      selectedText || CN.previewPlaceholder,
    [selectedText]
  );
  const highlightPattern = useMemo(
    () => getHighlightPattern(searchResult.keywords),
    [searchResult.keywords]
  );
  const scopeLabel = useMemo(
    () => getScopeLabel(scopeMode, selectedBook, customScopeBooks),
    [customScopeBooks, scopeMode, selectedBook]
  );
  const canGoPrevChapter = useMemo(
    () => !!(data && chapterReference && getAdjacentChapter(data, chapterReference, -1)),
    [chapterReference, data]
  );
  const canGoNextChapter = useMemo(
    () => !!(data && chapterReference && getAdjacentChapter(data, chapterReference, 1)),
    [chapterReference, data]
  );

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

  const clearSelection = () => setSelectedKeys([]);

  const handleVerseToggle = (verse: BibleVerse) => {
    setSelectedKeys((current) =>
      current.includes(verse.key)
        ? current.filter((item) => item !== verse.key)
        : current.concat(verse.key)
    );
  };

  const handleCopySingleVerse = (verse: BibleVerse) => {
    copyToClipboard(formatBibleVerse(verse));
  };

  const openChapter = (bookName: string, chapter: number) => {
    setSelectedBookName(bookName);
    setSelectedChapter(chapter);
    setSearchInput('');
  };

  const handleJumpToVerse = (verse: BibleVerse) => {
    openChapter(verse.book, verse.chapter);
  };

  const changeChapter = (direction: 1 | -1) => {
    if (!data || !chapterReference) return;
    const nextReference = getAdjacentChapter(data, chapterReference, direction);
    if (!nextReference) return;
    openChapter(nextReference.book.name, nextReference.chapter);
  };

  const toggleCustomBook = (bookName: string) => {
    setCustomScopeBooks((current) =>
      current.includes(bookName)
        ? current.filter((item) => item !== bookName)
        : current.concat(bookName)
    );
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
        clearSelection();
        return;
      }

      if (editable) return;

      if (evt.key === 'ArrowDown') {
        evt.preventDefault();
        verseScrollRef.current?.scrollBy({ top: 180, behavior: 'smooth' });
        return;
      }

      if (evt.key === 'ArrowUp') {
        evt.preventDefault();
        verseScrollRef.current?.scrollBy({ top: -180, behavior: 'smooth' });
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
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    canGoNextChapter,
    canGoPrevChapter,
    changeChapter,
    clearSelection,
    currentPage,
    handleCopySelected,
    selectedText,
    totalPages,
  ]);

  const sectionTitle = isSearchMode
    ? `搜索：${searchResult.keywords.join(' ')}`
    : `${selectedBook?.name ?? ''} 第 ${selectedChapter} 章`;
  const sectionDescription = isSearchMode
    ? `共找到 ${activeVerses.length} 节匹配经文，当前范围：${scopeLabel}。${CN.searchHintSuffix}`
    : `本章共 ${chapterVerses.length} 节，经文支持点击多选、复制，并可通过 - / + 或按钮快速切章。`;

  return (
    <Modal
      className={ModalWide}
      style={{ display: 'flex', flexDirection: 'column', minHeight: '92vh' }}
      variant="Background"
    >
      <Header
        variant="Surface"
        size="500"
        style={{ padding: config.space.S300, borderBottom: SOFT_LINE }}
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
          <Scroll size="300" hideTrack style={{ minHeight: 0 }}>
            <Box direction="Column" gap="300" style={{ padding: config.space.S300 }}>
              <SequenceCard
                variant="SurfaceVariant"
                direction="Column"
                gap="300"
                style={CARD_STYLE}
              >
                <Box wrap="Wrap" gap="250" alignItems="Center">
                  <Box grow="Yes" direction="Column" gap="100">
                    <Text size="H4">{`${CN.selected} ${selectedVerses.length} ${CN.verses}`}</Text>
                    <Text size="T300" priority="300">
                      {CN.selectedHelp}
                    </Text>
                  </Box>
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
                    onClick={clearSelection}
                    disabled={selectedKeys.length === 0}
                  >
                    <Text size="B300">{CN.reset}</Text>
                  </Button>
                </Box>

                <Box style={PREVIEW_STYLE}>
                  <Text size="T300" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                    {selectedPreview}
                  </Text>
                </Box>
              </SequenceCard>

              <SequenceCard
                variant="SurfaceVariant"
                direction="Column"
                gap="350"
                style={CARD_STYLE}
              >
                <Box wrap="Wrap" gap="250" alignItems="Center">
                  <Text size="L400">
                    <b>{CN.browseTitle}</b>
                  </Text>
                  <Box grow="Yes" />
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
                    onClick={() => changeChapter(1)}
                    disabled={!canGoNextChapter}
                  >
                    <Text size="B300">{CN.nextChapter}</Text>
                  </Button>
                </Box>

                <Box direction="Column" gap="150">
                  <Text size="T300" priority="300">
                    {CN.bookLabel}
                  </Text>
                  <select
                    value={selectedBook.name}
                    onChange={(evt) => openChapter(evt.currentTarget.value, 1)}
                    style={SELECT_STYLE}
                  >
                    {data.booksByTestament.map((group) => (
                      <optgroup key={group.name} label={group.name}>
                        {group.books.map((book) => (
                          <option key={book.bookNumber} value={book.name}>
                            {book.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </Box>

                <Box direction="Column" gap="150">
                  <Text size="T300" priority="300">
                    {`${CN.chapterLabel} · ${selectedBook.chapterCount} 章`}
                  </Text>
                  <Box wrap="Wrap" gap="100" style={CHAPTER_WRAP_STYLE}>
                    {selectedBook.chapters.map((chapter) => (
                      <Button
                        key={chapter}
                        size="300"
                        variant={chapter === selectedChapter ? 'Primary' : 'Secondary'}
                        fill={chapter === selectedChapter ? 'Solid' : 'Soft'}
                        radii="300"
                        onClick={() => openChapter(selectedBook.name, chapter)}
                      >
                        <Text size="B300">{chapter}</Text>
                      </Button>
                    ))}
                  </Box>
                </Box>

                <Line size="300" variant="Surface" />

                <Box direction="Column" gap="150">
                  <Text size="L400">
                    <b>{CN.searchTitle}</b>
                  </Text>
                  <Input
                    value={searchInput}
                    onChange={(evt) => setSearchInput(evt.currentTarget.value)}
                    placeholder={CN.searchPlaceholder}
                    variant="Background"
                    outlined
                    size="400"
                  />
                  <Text size="T300" priority="300">
                    {CN.searchHelp}
                  </Text>
                </Box>

                <Box direction="Column" gap="150">
                  <Text size="T300" priority="300">
                    {CN.searchRange}
                  </Text>
                  <Box wrap="Wrap" gap="100">
                    {scopeOptions.map((option) => (
                      <Button
                        key={option.value}
                        size="300"
                        variant={scopeMode === option.value ? 'Primary' : 'Secondary'}
                        fill={scopeMode === option.value ? 'Solid' : 'Soft'}
                        radii="300"
                        onClick={() => setScopeMode(option.value)}
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
                    {data.booksByTestament.map((group) => (
                      <Box key={group.name} direction="Column" gap="100">
                        <Text size="T300" priority="300">
                          {group.name}
                        </Text>
                        <Box wrap="Wrap" gap="100">
                          {group.books.map((book) => {
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
              </SequenceCard>

              <SequenceCard
                variant="SurfaceVariant"
                direction="Column"
                gap="0"
                style={{ ...CARD_STYLE, padding: 0, overflow: 'hidden' }}
              >
                <Box wrap="Wrap" gap="250" alignItems="Center" style={{ padding: config.space.S400 }}>
                  <Box grow="Yes" direction="Column" gap="100">
                    <Text size="H3">{sectionTitle}</Text>
                    <Text size="T300" priority="300">
                      {sectionDescription}
                    </Text>
                  </Box>
                  <Box shrink="No" wrap="Wrap" gap="200" justifyContent="End">
                    <Text size="T300" priority="300">
                      {isSearchMode
                        ? `${CN.searchSummary} ${activeVerses.length} ${CN.verses} • 第 ${currentPage}/${totalPages} 页`
                        : `${CN.chapterSummary} ${chapterVerses.length} ${CN.verses} • 第 ${currentPage}/${totalPages} 页`}
                    </Text>
                    {isSearchMode && (
                      <Button
                        size="300"
                        variant="Secondary"
                        fill="Soft"
                        radii="300"
                        onClick={() => setSearchInput('')}
                      >
                        <Text size="B300">{CN.chapterBrowse}</Text>
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

                {totalPages > 1 && (
                  <Box wrap="Wrap" gap="200" style={{ padding: `0 ${config.space.S400} ${config.space.S300}` }}>
                    <Button
                      size="300"
                      variant="Secondary"
                      fill="Soft"
                      radii="300"
                      onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
                      disabled={currentPage <= 1}
                    >
                      <Text size="B300">{CN.prevPage}</Text>
                    </Button>
                    <Button
                      size="300"
                      variant="Secondary"
                      fill="Soft"
                      radii="300"
                      onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
                      disabled={currentPage >= totalPages}
                    >
                      <Text size="B300">{CN.nextPage}</Text>
                    </Button>
                  </Box>
                )}

                <Line size="300" variant="Surface" />

                <Scroll ref={verseScrollRef} size="300" hideTrack style={{ minHeight: 0 }}>
                  <Box direction="Column" style={LIST_STYLE}>
                    {pageVerses.length === 0 && (
                      <Box alignItems="Center" justifyContent="Center" style={EMPTY_STYLE}>
                        <Text size="L400">{CN.noResult}</Text>
                      </Box>
                    )}

                    {pageVerses.map((verse) => (
                      <VerseRow
                        key={verse.key}
                        verse={verse}
                        selected={selectedSet.has(verse.key)}
                        onToggle={handleVerseToggle}
                        onCopy={handleCopySingleVerse}
                        onJump={isSearchMode ? handleJumpToVerse : undefined}
                        highlightPattern={isSearchMode ? highlightPattern : undefined}
                      />
                    ))}
                  </Box>
                </Scroll>

                {!selectedText && (
                  <Box style={{ padding: `${config.space.S250} ${config.space.S400}`, borderTop: SOFT_LINE }}>
                    <Text size="T300" priority="300">
                      {CN.noSelection}
                    </Text>
                  </Box>
                )}
              </SequenceCard>
            </Box>
          </Scroll>
        )}
      </Box>
    </Modal>
  );
}

type BibleModalProps = {
  open: boolean;
  requestClose: () => void;
  onInsertSelected?: (text: string) => void;
};

export function BibleModal({ open, requestClose, onInsertSelected }: BibleModalProps) {
  return (
    <BibleExperienceModal
      open={open}
      requestClose={requestClose}
      onInsertSelected={onInsertSelected}
    />
  );
}

export const getBibleChapterReference = (
  data: BibleData,
  bookName: string,
  chapter: number
): BibleReference | undefined => {
  const book = resolveBibleBook(data, bookName);
  if (!book || chapter < 1 || chapter > book.chapterCount) return undefined;

  if (getChapterVerses(data, book.name, chapter).length === 0) return undefined;

  return {
    book,
    chapter,
  };
};
