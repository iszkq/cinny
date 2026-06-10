import React, { useMemo } from 'react';
import parse from 'html-react-parser';
import { Box, Text } from 'folds';
import classNames from 'classnames';
import { parseBlockMD, parseInlineMD } from '../plugins/markdown';
import { sanitizeCustomHtml } from '../utils/sanitize';
import * as css from './ReleaseNotes.css';

type ReleaseNotesProps = {
  body?: string;
  emptyText?: string;
  compact?: boolean;
  className?: string;
};

export function ReleaseNotes({
  body,
  emptyText = '\u6682\u65e0\u66f4\u65b0\u8bf4\u660e\u3002',
  compact,
  className,
}: ReleaseNotesProps) {
  const normalizedBody = body?.trim().replace(/\r\n?/g, '\n');

  const html = useMemo(() => {
    if (!normalizedBody) return '';
    return sanitizeCustomHtml(parseBlockMD(normalizedBody, parseInlineMD));
  }, [normalizedBody]);

  if (!normalizedBody) {
    return (
      <Text
        className={classNames(css.ReleaseNotes, compact && css.CompactReleaseNotes, className)}
        size={compact ? 'T200' : 'T300'}
        priority="300"
      >
        {emptyText}
      </Text>
    );
  }

  return (
    <Box
      className={classNames(css.ReleaseNotes, compact && css.CompactReleaseNotes, className)}
      direction="Column"
      gap={compact ? '100' : '200'}
    >
      {parse(html)}
    </Box>
  );
}
