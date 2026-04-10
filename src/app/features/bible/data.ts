const bibleCsvUrl = new URL('../../../../Bible1.csv', import.meta.url).href;

export type BibleVerse = {
  testament: string;
  category: string;
  book: string;
  bookNumber: number;
  chapter: number;
  verse: number;
  text: string;
  key: string;
  reference: string;
  order: number;
  searchText: string;
};

export type BibleBook = {
  name: string;
  testament: string;
  category: string;
  bookNumber: number;
  chapterCount: number;
  verseCount: number;
};

export type BibleReference = {
  book: BibleBook;
  chapter: number;
};

export type BibleSearchResult = {
  verses: BibleVerse[];
  keywords: string[];
  reference?: BibleReference;
};

export type BibleData = {
  verses: BibleVerse[];
  books: BibleBook[];
  booksByTestament: Array<{
    name: string;
    books: BibleBook[];
  }>;
  versesByChapter: Map<string, BibleVerse[]>;
  booksByName: Map<string, BibleBook>;
};

const TESTAMENT_OLD = '\u65e7\u7ea6';
const TESTAMENT_NEW = '\u65b0\u7ea6';

const normalizeBibleText = (value: string): string =>
  value.toLowerCase().replace(/\s+/g, '').trim();

const chapterKey = (book: string, chapter: number): string => `${book}::${chapter}`;

const parseCsvLine = (line: string): string[] => line.split(',');

const buildVerseSearchText = (
  testament: string,
  category: string,
  book: string,
  chapter: number,
  verse: number,
  text: string
): string =>
  normalizeBibleText(`${testament}${category}${book}${chapter}${verse}${book}${chapter}:${verse}${text}`);

const parseBibleCsv = (csvText: string): BibleData => {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const verses: BibleVerse[] = [];
  const booksByNumber = new Map<number, BibleBook>();
  const versesByChapter = new Map<string, BibleVerse[]>();

  lines.slice(1).forEach((line, index) => {
    const [testament, category, book, bookNumberRaw, chapterRaw, verseRaw, textRaw] =
      parseCsvLine(line);
    const bookNumber = Number(bookNumberRaw);
    const chapter = Number(chapterRaw);
    const verse = Number(verseRaw);
    const text = textRaw?.trim() ?? '';

    if (!book || !Number.isFinite(bookNumber) || !Number.isFinite(chapter) || !Number.isFinite(verse)) {
      return;
    }

    const reference = `${book} ${chapter}:${verse}`;
    const verseItem: BibleVerse = {
      testament,
      category,
      book,
      bookNumber,
      chapter,
      verse,
      text,
      key: `${bookNumber}-${chapter}-${verse}`,
      reference,
      order: index,
      searchText: buildVerseSearchText(testament, category, book, chapter, verse, text),
    };

    verses.push(verseItem);

    const currentBook = booksByNumber.get(bookNumber);
    if (!currentBook) {
      booksByNumber.set(bookNumber, {
        name: book,
        testament,
        category,
        bookNumber,
        chapterCount: chapter,
        verseCount: 1,
      });
    } else {
      currentBook.chapterCount = Math.max(currentBook.chapterCount, chapter);
      currentBook.verseCount += 1;
    }

    const currentChapterKey = chapterKey(book, chapter);
    const chapterVerses = versesByChapter.get(currentChapterKey) ?? [];
    chapterVerses.push(verseItem);
    versesByChapter.set(currentChapterKey, chapterVerses);
  });

  const books = Array.from(booksByNumber.values()).sort((a, b) => a.bookNumber - b.bookNumber);
  const booksByName = new Map<string, BibleBook>();
  books.forEach((book) => {
    booksByName.set(normalizeBibleText(book.name), book);
  });

  return {
    verses,
    books,
    booksByName,
    versesByChapter,
    booksByTestament: [
      {
        name: TESTAMENT_OLD,
        books: books.filter((book) => book.testament === TESTAMENT_OLD),
      },
      {
        name: TESTAMENT_NEW,
        books: books.filter((book) => book.testament === TESTAMENT_NEW),
      },
    ].filter((item) => item.books.length > 0),
  };
};

let bibleDataPromise: Promise<BibleData> | undefined;

export const loadBibleData = async (): Promise<BibleData> => {
  if (!bibleDataPromise) {
    bibleDataPromise = fetch(bibleCsvUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load bible data: ${response.status}`);
        }
        return response.text();
      })
      .then(parseBibleCsv)
      .catch((error) => {
        bibleDataPromise = undefined;
        throw error;
      });
  }

  return bibleDataPromise;
};

export const getChapterVerses = (
  data: BibleData,
  book: string,
  chapter: number
): BibleVerse[] => data.versesByChapter.get(chapterKey(book, chapter)) ?? [];

export const parseBibleReference = (
  query: string,
  data: BibleData
): BibleReference | undefined => {
  const match = query.trim().match(/^(.+?)[-－](\d+)$/);
  if (!match) return undefined;

  const [, rawBook, rawChapter] = match;
  const book = data.booksByName.get(normalizeBibleText(rawBook));
  const chapter = Number(rawChapter);

  if (!book || !Number.isFinite(chapter) || chapter < 1 || chapter > book.chapterCount) {
    return undefined;
  }

  return {
    book,
    chapter,
  };
};

export const searchBible = (data: BibleData, query: string): BibleSearchResult => {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  let reference: BibleReference | undefined;
  const keywordTokens: string[] = [];

  tokens.forEach((token) => {
    if (!reference) {
      const matchedReference = parseBibleReference(token, data);
      if (matchedReference) {
        reference = matchedReference;
        return;
      }
    }
    keywordTokens.push(token);
  });

  const normalizedKeywords = keywordTokens.map(normalizeBibleText).filter(Boolean);
  const sourceVerses = reference ? getChapterVerses(data, reference.book.name, reference.chapter) : data.verses;
  const verses =
    normalizedKeywords.length === 0
      ? sourceVerses
      : sourceVerses.filter((verse) =>
          normalizedKeywords.every((keyword) => verse.searchText.includes(keyword))
        );

  return {
    verses,
    keywords: normalizedKeywords,
    reference,
  };
};

export const getAdjacentChapter = (
  data: BibleData,
  reference: BibleReference,
  direction: 1 | -1
): BibleReference | undefined => {
  const nextChapter = reference.chapter + direction;
  if (nextChapter >= 1 && nextChapter <= reference.book.chapterCount) {
    return {
      book: reference.book,
      chapter: nextChapter,
    };
  }

  const bookIndex = data.books.findIndex((book) => book.bookNumber === reference.book.bookNumber);
  const nextBook = data.books[bookIndex + direction];
  if (!nextBook) return undefined;

  return {
    book: nextBook,
    chapter: direction > 0 ? 1 : nextBook.chapterCount,
  };
};

export const formatBibleVerse = (verse: BibleVerse): string =>
  `${verse.book} ${verse.chapter}:${verse.verse} ${verse.text}`;
