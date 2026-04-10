import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { ModalWide } from '../../styles/Modal.css';
import { copyToClipboard } from '../../utils/dom';
import { stopPropagation } from '../../utils/keyboard';
import {
  BibleData,
  BibleReference,
  BibleVerse,
  formatBibleVerse,
  getAdjacentChapter,
  getChapterVerses,
  loadBibleData,
  searchBible,
} from './data';

const PAGE_SIZE = 40;

const CN = {
  title: '\u5723\u7ecf',
  searchPlaceholder:
    '\u8f93\u5165\u5173\u952e\u8bcd\uff0c\u6216\u8005\u4f7f\u7528\u201c\u5377\u540d-\u7ae0\u201d\u5b9a\u4f4d\uff0c\u4f8b\u5982\uff1a\u521b\u4e16\u8bb0-1 \u5149',
  loading: '\u6b63\u5728\u8f7d\u5165\u5723\u7ecf\u6570\u636e...',
  loadFailed: '\u5723\u7ecf\u6570\u636e\u52a0\u8f7d\u5931\u8d25',
  books: '\u5377\u76ee',
  keyboard: '\u952e\u76d8\u5feb\u6377\u952e',
  keywordHelp:
    '\u591a\u4e2a\u5173\u952e\u8bcd\u7528\u7a7a\u683c\u5206\u9694\uff0c\u4f8b\u5982\uff1a\u7231 \u5149 \u751f\u547d',
  chapterHelp:
    '\u201c+\u201d / \u201c-\u201d \u5207\u6362\u4e0a\u4e0b\u7ae0\uff0c\u5de6\u53f3\u65b9\u5411\u952e\u7ffb\u9875\uff0c\u4e0a\u4e0b\u65b9\u5411\u952e\u6eda\u52a8',
  copyHelp: 'Ctrl+C \u590d\u5236\u6240\u9009\u7ecf\u6587\uff0cCtrl+X \u6e05\u7a7a\u9009\u62e9',
  noResult: '\u672a\u627e\u5230\u5339\u914d\u7684\u7ecf\u6587',
  chapterSummary: '\u5f53\u524d\u7ae0',
  searchSummary: '\u641c\u7d22\u7ed3\u679c',
  selected: '\u5df2\u9009',
  verses: '\u8282',
  copy: '\u590d\u5236',
  insert: '\u63d2\u5165\u5230\u804a\u5929\u6846',
  reset: '\u91cd\u7f6e\u9009\u62e9',
  prevChapter: '\u4e0a\u4e00\u7ae0 (-)',
  nextChapter: '\u4e0b\u4e00\u7ae0 (+)',
  prevPage: '\u4e0a\u4e00\u9875',
  nextPage: '\u4e0b\u4e00\u9875',
  page: '\u9875',
  selectHint: '\u5355\u51fb\u7ecf\u6587\u5373\u53ef\u591a\u9009',
  emptySelection: '\u8bf7\u5148\u9009\u4e2d\u4e00\u8282\u6216\u591a\u8282\u7ecf\u6587',
} as const;

const buildReferenceQuery = (reference: BibleReference, keywords: string[]): string =>
  [`${reference.book.name}-${reference.chapter}`, ...keywords].join(' ').trim();

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
};

const sortVerses = (verses: BibleVerse[]): BibleVerse[] =>
  [...verses].sort((a, b) => a.order - b.order);

type BibleViewProps = {
  requestClose: () => void;
  onInsertSelected?: (text: string) => void;
};

function BibleView({ requestClose, onInsertSelected }: BibleViewProps) {
  const [data, setData] = useState<BibleData>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [query, setQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const verseScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;

    loadBibleData()
      .then((nextData) => {
        if (!mounted) return;
        setData(nextData);
        if (!query && nextData.books[0]) {
          setQuery(`${nextData.books[0].name}-1`);
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

  const searchResult = useMemo(() => {
    if (!data) {
      return {
        verses: [],
        keywords: [],
        reference: undefined as BibleReference | undefined,
      };
    }

    return searchBible(data, query);
  }, [data, query]);

  useEffect(() => {
    setCurrentPage(1);
    verseScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [query]);

  const totalPages = Math.max(1, Math.ceil(searchResult.verses.length / PAGE_SIZE));
  const pageVerses = useMemo(
    () =>
      searchResult.verses.slice((currentPage - 1) * PAGE_SIZE, (currentPage - 1) * PAGE_SIZE + PAGE_SIZE),
    [currentPage, searchResult.verses]
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

  const handleCopy = () => {
    if (!selectedText) return;
    copyToClipboard(selectedText);
  };

  const handleInsert = () => {
    if (!selectedText || !onInsertSelected) return;
    onInsertSelected(selectedText);
    requestClose();
  };

  const clearSelection = () => {
    setSelectedKeys([]);
  };

  const handleVerseToggle = (verse: BibleVerse) => {
    setSelectedKeys((current) =>
      current.includes(verse.key)
        ? current.filter((item) => item !== verse.key)
        : current.concat(verse.key)
    );
  };

  const setReferenceQuery = (reference: BibleReference, keywords = searchResult.keywords) => {
    setQuery(buildReferenceQuery(reference, keywords));
  };

  const jumpChapter = (direction: 1 | -1) => {
    if (!data || !searchResult.reference) return;
    const nextReference = getAdjacentChapter(data, searchResult.reference, direction);
    if (!nextReference) return;
    setReferenceQuery(nextReference);
  };

  useEffect(() => {
    const handleKeyDown = (evt: KeyboardEvent) => {
      const editable = isEditableTarget(evt.target);

      if (isKeyHotkey('mod+c', evt)) {
        if (editable || !selectedText) return;
        evt.preventDefault();
        handleCopy();
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
      if ((evt.key === '+' || evt.key === '=') && searchResult.reference) {
        evt.preventDefault();
        jumpChapter(1);
        return;
      }
      if (evt.key === '-' && searchResult.reference) {
        evt.preventDefault();
        jumpChapter(-1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentPage, searchResult.reference, selectedText, totalPages]);

  const selectedSummary = `${CN.selected} ${selectedVerses.length} ${CN.verses}`;
  const pageSummary = `${CN.page} ${currentPage}/${totalPages}`;

  return (
    <Modal
      className={ModalWide}
      style={{ display: 'flex', flexDirection: 'column', minHeight: '90vh' }}
      variant="Background"
    >
      <Header
        variant="Surface"
        size="500"
        style={{ padding: config.space.S300, borderBottom: '1px solid rgba(0, 0, 0, 0.08)' }}
      >
        <Box grow="Yes" direction="Column" gap="100">
          <Text size="H4">{CN.title}</Text>
          <Text size="T300" priority="300">
            {CN.selectHint}
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

        {!loading && !error && data && (
          <>
            <Box
              shrink="No"
              direction="Column"
              gap="200"
              style={{ padding: config.space.S300 }}
            >
              <Input
                value={query}
                onChange={(evt) => setQuery(evt.currentTarget.value)}
                placeholder={CN.searchPlaceholder}
                variant="Background"
                outlined
                size="400"
              />
              <Box wrap="Wrap" gap="200" alignItems="Center">
                <Text size="T300" priority="300">
                  {searchResult.reference
                    ? `${CN.chapterSummary}\uff1a${searchResult.reference.book.name} ${searchResult.reference.chapter}\u7ae0`
                    : `${CN.searchSummary}\uff1a${searchResult.verses.length} ${CN.verses}`}
                </Text>
                <Text size="T300" priority="300">
                  {pageSummary}
                </Text>
                <Text size="T300" priority="300">
                  {selectedSummary}
                </Text>
                <Box grow="Yes" />
                <Button
                  size="300"
                  variant="Secondary"
                  fill="Soft"
                  radii="300"
                  onClick={handleCopy}
                  disabled={!selectedText}
                >
                  <Text size="B300">{CN.copy}</Text>
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
            </Box>

            <Line size="300" variant="Surface" />

            <Box grow="Yes" style={{ minHeight: 0 }}>
              <Box
                grow="Yes"
                style={{
                  minHeight: 0,
                  display: 'grid',
                  gridTemplateColumns: 'minmax(240px, 280px) minmax(0, 1fr)',
                }}
              >
                <Scroll size="300" hideTrack style={{ minHeight: 0 }}>
                  <Box direction="Column" gap="300" style={{ padding: config.space.S300 }}>
                    <Box direction="Column" gap="100">
                      <Text size="L400">{CN.keyboard}</Text>
                      <Text size="T300" priority="300">
                        {CN.keywordHelp}
                      </Text>
                      <Text size="T300" priority="300">
                        {CN.chapterHelp}
                      </Text>
                      <Text size="T300" priority="300">
                        {CN.copyHelp}
                      </Text>
                    </Box>

                    <Box direction="Column" gap="200">
                      <Text size="L400">{CN.books}</Text>
                      {data.booksByTestament.map((group) => (
                        <Box key={group.name} direction="Column" gap="100">
                          <Text size="T300" priority="300">
                            {group.name}
                          </Text>
                          <Box wrap="Wrap" gap="100">
                            {group.books.map((book) => {
                              const active = searchResult.reference?.book.name === book.name;

                              return (
                                <Button
                                  key={book.bookNumber}
                                  size="300"
                                  variant={active ? 'Success' : 'Secondary'}
                                  fill={active ? 'Solid' : 'Soft'}
                                  radii="300"
                                  onClick={() =>
                                    setReferenceQuery({
                                      book,
                                      chapter: 1,
                                    })
                                  }
                                >
                                  <Text size="T200">{book.name}</Text>
                                </Button>
                              );
                            })}
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                </Scroll>

                <Box direction="Column" style={{ minWidth: 0, minHeight: 0 }}>
                  <Box
                    shrink="No"
                    direction="Column"
                    gap="200"
                    style={{ padding: config.space.S300 }}
                  >
                    <Box wrap="Wrap" gap="200" alignItems="Center">
                      <Text size="L400">
                        {searchResult.reference
                          ? `${searchResult.reference.book.name} ${searchResult.reference.chapter}\u7ae0`
                          : CN.searchSummary}
                      </Text>
                      <Text size="T300" priority="300">
                        {`${searchResult.verses.length} ${CN.verses}`}
                      </Text>
                      <Box grow="Yes" />
                      <Button
                        size="300"
                        variant="Secondary"
                        fill="Soft"
                        radii="300"
                        onClick={() => jumpChapter(-1)}
                        disabled={!searchResult.reference || !getAdjacentChapter(data, searchResult.reference, -1)}
                      >
                        <Text size="B300">{CN.prevChapter}</Text>
                      </Button>
                      <Button
                        size="300"
                        variant="Secondary"
                        fill="Soft"
                        radii="300"
                        onClick={() => jumpChapter(1)}
                        disabled={!searchResult.reference || !getAdjacentChapter(data, searchResult.reference, 1)}
                      >
                        <Text size="B300">{CN.nextChapter}</Text>
                      </Button>
                    </Box>

                    <Box wrap="Wrap" gap="200">
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
                  </Box>

                  <Line size="300" variant="Surface" />

                  <Scroll ref={verseScrollRef} size="300" hideTrack style={{ minHeight: 0 }}>
                    <Box direction="Column" gap="200" style={{ padding: config.space.S300 }}>
                      {pageVerses.length === 0 && (
                        <Box
                          style={{
                            minHeight: toRem(180),
                            borderRadius: config.radii.R400,
                            border: `1px dashed currentColor`,
                            padding: config.space.S400,
                          }}
                          alignItems="Center"
                          justifyContent="Center"
                        >
                          <Text size="L400">{CN.noResult}</Text>
                        </Box>
                      )}

                      {pageVerses.map((verse) => {
                        const selected = selectedSet.has(verse.key);

                        return (
                          <Button
                            key={verse.key}
                            variant={selected ? 'Success' : 'Secondary'}
                            fill={selected ? 'Solid' : 'Soft'}
                            radii="400"
                            size="300"
                            outlined
                            style={{
                              width: '100%',
                              justifyContent: 'flex-start',
                              textAlign: 'left',
                              padding: config.space.S300,
                            }}
                            onClick={() => handleVerseToggle(verse)}
                          >
                            <Box direction="Column" gap="100" alignItems="Start">
                              <Text size="B300">{verse.reference}</Text>
                              <Text size="T300">{verse.text}</Text>
                            </Box>
                          </Button>
                        );
                      })}
                    </Box>
                  </Scroll>
                </Box>
              </Box>
            </Box>

            {!selectedText && (
              <Box
                shrink="No"
                style={{
                  padding: `${config.space.S200} ${config.space.S300}`,
                  borderTop: '1px solid rgba(0, 0, 0, 0.08)',
                }}
              >
                <Text size="T300" priority="300">
                  {CN.emptySelection}
                </Text>
              </Box>
            )}
          </>
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
  if (!open) return null;

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: requestClose,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <BibleView requestClose={requestClose} onInsertSelected={onInsertSelected} />
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}

export const getBibleChapterReference = (
  data: BibleData,
  bookName: string,
  chapter: number
): BibleReference | undefined => {
  const book = data.books.find((item) => item.name === bookName);
  if (!book || chapter < 1 || chapter > book.chapterCount) return undefined;

  if (getChapterVerses(data, bookName, chapter).length === 0) return undefined;

  return {
    book,
    chapter,
  };
};
