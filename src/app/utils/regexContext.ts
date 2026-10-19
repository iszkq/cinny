// Safari before 16.4 cannot compile lookbehind assertions. Check the prefix
// explicitly so importing message/markdown modules also works on iOS 16.0–16.3.
export const isInsideUrl = (text: string, index: number): boolean =>
  /(?:https?|ftp|mailto|magnet):\/\/\S*$/.test(text.slice(0, index));

export class OutsideUrlRegExp extends RegExp {
  constructor(pattern: string) {
    super(pattern, 'g');
  }

  exec(text: string): RegExpExecArray | null {
    let match = super.exec(text);
    while (match && isInsideUrl(text, match.index)) {
      // All callers use non-empty patterns; keep this safe for empty matches too.
      this.lastIndex = match.index + Math.max(1, match[0].length);
      match = super.exec(text);
    }
    return match;
  }
}
