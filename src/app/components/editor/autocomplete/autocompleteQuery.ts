import { BaseRange, Editor } from 'slate';

export enum AutocompletePrefix {
  RoomMention = '#',
  UserMention = '@',
  Emoticon = ':',
  EmojiKeyword = 'emoji-keyword',
  Command = '/',
}
export const AUTOCOMPLETE_PREFIXES: readonly AutocompletePrefix[] = [
  AutocompletePrefix.RoomMention,
  AutocompletePrefix.UserMention,
  AutocompletePrefix.Emoticon,
  AutocompletePrefix.Command,
];

export type AutocompleteQuery<TPrefix extends string> = {
  range: BaseRange;
  prefix: TPrefix;
  text: string;
};

export const getAutocompletePrefix = <TPrefix extends string>(
  editor: Editor,
  queryRange: BaseRange,
  validPrefixes: readonly TPrefix[]
): TPrefix | undefined => {
  const world = Editor.string(editor, queryRange);
  return validPrefixes.find((p) => world.startsWith(p));
};

export const getAutocompleteQueryText = (
  editor: Editor,
  queryRange: BaseRange,
  prefix: string
): string => Editor.string(editor, queryRange).slice(prefix.length);

export const getAutocompleteQuery = <TPrefix extends string>(
  editor: Editor,
  queryRange: BaseRange,
  validPrefixes: readonly TPrefix[]
): AutocompleteQuery<TPrefix> | undefined => {
  const queryText = Editor.string(editor, queryRange);
  const prefix = validPrefixes.find((p) => queryText.startsWith(p));
  if (!prefix) return undefined;

  return {
    range: queryRange,
    prefix,
    text: queryText.slice(prefix.length),
  };
};

const AUTOCOMPLETE_CONTROL_PREFIXES = ['#', '@', ':', '/'];
const CJK_CHAR_REGEX = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;
const LATIN_OR_NUMBER_CHAR_REGEX = /[a-z0-9]/gi;
const KEYWORD_CHAR_REGEX =
  /^[a-z0-9_\-\u00c0-\u024f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]+$/i;
const URL_OR_EMAIL_REGEX =
  /^(?:https?:\/\/|mxc:\/\/|www\.)|^[^\s@]+@[^\s@]+\.[^\s@]+$|^[^\s/]+\.[a-z]{2,}(?:[/:?#]|$)/i;

/**
 * Builds the opt-in bare-word emoji query used by the message composer.
 *
 * Prefix-based autocomplete must be checked first. Restricting the accepted
 * characters and requiring at least two Latin/numeric characters keeps normal
 * punctuation, URLs and one-letter words from constantly opening the picker.
 * CJK keywords are useful from their first character, so they use a lower
 * threshold.
 */
export const getEmojiKeywordAutocompleteQuery = (
  editor: Editor,
  queryRange: BaseRange
): AutocompleteQuery<AutocompletePrefix.EmojiKeyword> | undefined => {
  const queryText = Editor.string(editor, queryRange).trim();
  if (
    !queryText ||
    AUTOCOMPLETE_CONTROL_PREFIXES.some((prefix) => queryText.startsWith(prefix)) ||
    URL_OR_EMAIL_REGEX.test(queryText) ||
    !KEYWORD_CHAR_REGEX.test(queryText)
  ) {
    return undefined;
  }

  const containsCjk = CJK_CHAR_REGEX.test(queryText);
  const latinOrNumberCount = queryText.match(LATIN_OR_NUMBER_CHAR_REGEX)?.length ?? 0;
  if (!containsCjk && latinOrNumberCount < 2) {
    return undefined;
  }

  return {
    range: queryRange,
    prefix: AutocompletePrefix.EmojiKeyword,
    text: queryText,
  };
};
