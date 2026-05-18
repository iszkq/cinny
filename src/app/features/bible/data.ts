import bibleCsvText from '../../../../Bible1.csv?raw';

const BOOK_SHORT_NAMES: Record<string, string> = {
  创世记: '创',
  出埃及记: '出',
  利未记: '利',
  民数记: '民',
  申命记: '申',
  约书亚记: '书',
  士师记: '士',
  路得记: '得',
  撒母耳记上: '撒上',
  撒母耳记下: '撒下',
  列王纪上: '王上',
  列王纪下: '王下',
  历代志上: '代上',
  历代志下: '代下',
  以斯拉记: '拉',
  尼希米记: '尼',
  以斯帖记: '斯',
  约伯记: '伯',
  诗篇: '诗',
  箴言: '箴',
  传道书: '传',
  雅歌: '歌',
  以赛亚书: '赛',
  耶利米书: '耶',
  耶利米哀歌: '哀',
  以西结书: '结',
  但以理书: '但',
  何西阿书: '何',
  约珥书: '珥',
  阿摩司书: '摩',
  俄巴底亚书: '俄',
  约拿书: '拿',
  弥迦书: '弥',
  那鸿书: '鸿',
  哈巴谷书: '哈',
  西番雅书: '番',
  哈该书: '该',
  撒迦利亚书: '亚',
  玛拉基书: '玛',
  马太福音: '太',
  马可福音: '可',
  路加福音: '路',
  约翰福音: '约',
  使徒行传: '徒',
  罗马书: '罗',
  哥林多前书: '林前',
  哥林多后书: '林后',
  加拉太书: '加',
  以弗所书: '弗',
  腓立比书: '腓',
  歌罗西书: '西',
  帖撒罗尼迦前书: '帖前',
  帖撒罗尼迦后书: '帖后',
  提摩太前书: '提前',
  提摩太后书: '提后',
  提多书: '多',
  腓利门书: '门',
  希伯来书: '来',
  雅各书: '雅',
  彼得前书: '彼前',
  彼得后书: '彼后',
  约翰一书: '约一',
  约翰二书: '约二',
  约翰三书: '约三',
  犹大书: '犹',
  启示录: '启',
};

export type BibleVerse = {
  testament: string;
  category: string;
  book: string;
  shortBook: string;
  bookNumber: number;
  chapter: number;
  verse: number;
  text: string;
  key: string;
  reference: string;
  copyReference: string;
  order: number;
  searchText: string;
};

export type BibleBook = {
  name: string;
  shortName: string;
  testament: string;
  category: string;
  bookNumber: number;
  chapterCount: number;
  verseCount: number;
  chapters: number[];
};

export type BibleReference = {
  book: BibleBook;
  chapter: number;
};

export type BibleSearchScopeMode = 'all' | 'old' | 'new' | 'current' | 'custom';

export type BibleSearchScope = {
  mode: BibleSearchScopeMode;
  currentBookName?: string;
  bookNames?: string[];
};

export type BibleSearchResult = {
  verses: BibleVerse[];
  keywords: string[];
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

const TESTAMENT_OLD = '旧约';
const TESTAMENT_NEW = '新约';

export const normalizeBibleText = (value: string): string =>
  value
    .toLowerCase()
    .replace(
      /[\s\u3000，。、“”‘’；：:,.!?！？（）()\[\]【】《》〈〉「」『』"'\-—]/g,
      ''
    )
    .trim();

const chapterKey = (book: string, chapter: number): string => `${book}::${chapter}`;

const parseCsvLine = (line: string): string[] => {
  const result: string[] = [];
  let current = '';
  let insideQuote = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (insideQuote && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        insideQuote = !insideQuote;
      }
      continue;
    }

    if (char === ',' && !insideQuote) {
      result.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  result.push(current);
  return result;
};

const getBookShortName = (book: string): string => BOOK_SHORT_NAMES[book] ?? book;

const buildBookAliases = (book: BibleBook): string[] =>
  Array.from(
    new Set(
      [book.name, book.shortName]
        .map((item) => normalizeBibleText(item))
        .filter(Boolean)
    )
  );

const buildVerseSearchText = (text: string): string => normalizeBibleText(text);

const buildVerseReference = (book: string, chapter: number, verse: number): string =>
  `${book} ${chapter}:${verse}`;

const buildCopyReference = (shortBook: string, chapter: number, verse: number): string =>
  `【${shortBook}${chapter}：${verse}】`;

const parseBibleCsv = (csvText: string): BibleData => {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const verses: BibleVerse[] = [];
  const booksByNumber = new Map<number, BibleBook>();
  const versesByChapter = new Map<string, BibleVerse[]>();

  lines.slice(1).forEach((line, index) => {
    const [testamentRaw, categoryRaw, bookRaw, bookNumberRaw, chapterRaw, verseRaw, ...textParts] =
      parseCsvLine(line);
    const testament = testamentRaw?.trim() ?? '';
    const category = categoryRaw?.trim() ?? '';
    const book = bookRaw?.trim() ?? '';
    const bookNumber = Number(bookNumberRaw);
    const chapter = Number(chapterRaw);
    const verse = Number(verseRaw);
    const text = textParts.join(',').trim();

    if (!book || !Number.isFinite(bookNumber) || !Number.isFinite(chapter) || !Number.isFinite(verse)) {
      return;
    }

    const shortBook = getBookShortName(book);
    const verseItem: BibleVerse = {
      testament,
      category,
      book,
      shortBook,
      bookNumber,
      chapter,
      verse,
      text,
      key: `${bookNumber}-${chapter}-${verse}`,
      reference: buildVerseReference(book, chapter, verse),
      copyReference: buildCopyReference(shortBook, chapter, verse),
      order: index,
      searchText: buildVerseSearchText(text),
    };

    verses.push(verseItem);

    const existingBook = booksByNumber.get(bookNumber);
    if (!existingBook) {
      booksByNumber.set(bookNumber, {
        name: book,
        shortName: shortBook,
        testament,
        category,
        bookNumber,
        chapterCount: chapter,
        verseCount: 1,
        chapters: [chapter],
      });
    } else {
      existingBook.chapterCount = Math.max(existingBook.chapterCount, chapter);
      existingBook.verseCount += 1;
      if (!existingBook.chapters.includes(chapter)) {
        existingBook.chapters.push(chapter);
      }
    }

    const currentChapterKey = chapterKey(book, chapter);
    const chapterVerses = versesByChapter.get(currentChapterKey) ?? [];
    chapterVerses.push(verseItem);
    versesByChapter.set(currentChapterKey, chapterVerses);
  });

  const books = Array.from(booksByNumber.values()).sort((a, b) => a.bookNumber - b.bookNumber);
  const booksByName = new Map<string, BibleBook>();

  books.forEach((book) => {
    book.chapters = Array.from({ length: book.chapterCount }, (_, index) => index + 1);
    buildBookAliases(book).forEach((alias) => {
      booksByName.set(alias, book);
    });
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
    bibleDataPromise = Promise.resolve(bibleCsvText)
      .then(parseBibleCsv)
      .catch((error) => {
        bibleDataPromise = undefined;
        throw error;
      });
  }

  return bibleDataPromise;
};

export const resolveBibleBook = (
  data: BibleData,
  bookName: string | undefined
): BibleBook | undefined => {
  if (!bookName) return undefined;
  return data.booksByName.get(normalizeBibleText(bookName));
};

export const getChapterVerses = (
  data: BibleData,
  book: string,
  chapter: number
): BibleVerse[] => data.versesByChapter.get(chapterKey(book, chapter)) ?? [];

const getScopedBookNames = (data: BibleData, scope: BibleSearchScope): Set<string> | undefined => {
  if (scope.mode === 'all') return undefined;
  if (scope.mode === 'old') {
    return new Set(data.books.filter((book) => book.testament === TESTAMENT_OLD).map((book) => book.name));
  }
  if (scope.mode === 'new') {
    return new Set(data.books.filter((book) => book.testament === TESTAMENT_NEW).map((book) => book.name));
  }
  if (scope.mode === 'current') {
    return scope.currentBookName ? new Set([scope.currentBookName]) : undefined;
  }

  if (scope.bookNames && scope.bookNames.length > 0) {
    return new Set(scope.bookNames);
  }

  return scope.currentBookName ? new Set([scope.currentBookName]) : undefined;
};

export const searchBible = (
  data: BibleData,
  query: string,
  scope: BibleSearchScope
): BibleSearchResult => {
  const keywords = query
    .trim()
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const normalizedKeywords = keywords.map(normalizeBibleText).filter(Boolean);
  const scopedBookNames = getScopedBookNames(data, scope);
  const sourceVerses = scopedBookNames
    ? data.verses.filter((verse) => scopedBookNames.has(verse.book))
    : data.verses;
  const verses =
    normalizedKeywords.length === 0
      ? sourceVerses
      : sourceVerses.filter((verse) =>
          normalizedKeywords.every((keyword) => verse.searchText.includes(keyword))
        );

  return {
    verses,
    keywords,
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
  `${verse.copyReference}${verse.text}`;
