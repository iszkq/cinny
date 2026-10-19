/** Standalone meeting/phone numbers; compatible with iOS 16's regular expressions. */
export const findMessageNumbers = (text: string) =>
  Array.from(text.matchAll(/(^|[^\d\w.])(\+?\d[\d -]{3,18}\d)(?![\d\w.])/g))
    .map((match) => Object.assign([match[2]], { index: match.index! + match[1].length }))
    .filter((match) => {
      const start = match.index;
      const tokenStart = text.slice(0, start).search(/\S*$/);
      const tail = text.slice(start + match[0].length).match(/^\S*/)?.[0] ?? '';
      const token = text.slice(tokenStart, start + match[0].length) + tail;
      return !/https?:|www\.|@|\//i.test(token);
    });
