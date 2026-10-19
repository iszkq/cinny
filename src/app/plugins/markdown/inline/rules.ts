import { isInsideUrl, OutsideUrlRegExp } from '../../../utils/regexContext';
import { InlineMDRule } from './type';

// Match delimiters explicitly rather than constructing lookbehind expressions,
// which throw during module initialization in iOS 16.0–16.3.
const matchDelimited = (text: string, delimiter: string): RegExpMatchArray | null => {
  let start = text.indexOf(delimiter);
  while (start !== -1) {
    if (text[start - 1] !== '\\' && !isInsideUrl(text, start)) {
      const contentStart = start + delimiter.length;
      let end = text.indexOf(delimiter, contentStart + 1);
      while (end !== -1) {
        const content = text.slice(contentStart, end);
        if (/[\r\n\u2028\u2029]/.test(content)) break;
        if (text[end - 1] !== '\\' && text[end + delimiter.length] !== delimiter[0]) {
          const match = [text.slice(start, end + delimiter.length), content] as RegExpMatchArray;
          match.index = start;
          match.input = text;
          return match;
        }
        end = text.indexOf(delimiter, end + 1);
      }
    }
    start = text.indexOf(delimiter, start + 1);
  }
  return null;
};

const delimiterRule = (delimiter: string, tag: string, raw = false): InlineMDRule => ({
  match: (text) => matchDelimited(text, delimiter),
  html: (parse, match) =>
    `<${tag} data-md="${delimiter}">${raw ? match[1] : parse(match[1])}</${tag}>`,
});

export const BoldRule = delimiterRule('**', 'strong');
export const ItalicRule1 = delimiterRule('*', 'i');
export const ItalicRule2 = delimiterRule('_', 'i');
export const UnderlineRule = delimiterRule('__', 'u');
export const StrikeRule = delimiterRule('~~', 's');
export const CodeRule = delimiterRule('`', 'code', true);
export const SpoilerRule: InlineMDRule = {
  match: (text) => matchDelimited(text, '||'),
  html: (parse, match) => `<span data-md="||" data-mx-spoiler>${parse(match[1])}</span>`,
};

const LINK_REG = /\[(.+?)\]\((https?:\/\/.+?)\)/;
export const LinkRule: InlineMDRule = {
  match: (text) => text.match(LINK_REG),
  html: (parse, match) => `<a data-md href="${match[2]}">${parse(match[1])}</a>`,
};

export const INLINE_SEQUENCE_SET = '[*_~`|]';
export const CAP_INLINE_SEQ = INLINE_SEQUENCE_SET;
const ESC_REG = new OutsideUrlRegExp(`\\\\(${INLINE_SEQUENCE_SET})`);
export const EscapeRule: InlineMDRule = {
  match: (text) => {
    ESC_REG.lastIndex = 0;
    return ESC_REG.exec(text);
  },
  html: (_parse, match) => match[1],
};
