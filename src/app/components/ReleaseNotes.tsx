import React, { useMemo } from 'react';
import parse from 'html-react-parser';
import { Box, Text } from 'folds';
import { parseBlockMD, parseInlineMD } from '../plugins/markdown';
import { sanitizeCustomHtml } from '../utils/sanitize';

type ReleaseNotesProps = {
  body?: string;
  emptyText?: string;
};

export function ReleaseNotes({
  body,
  emptyText = '\u6682\u65e0\u66f4\u65b0\u8bf4\u660e\u3002',
}: ReleaseNotesProps) {
  const normalizedBody = body?.trim().replace(/\r\n?/g, '\n');

  const html = useMemo(() => {
    if (!normalizedBody) return '';
    return sanitizeCustomHtml(parseBlockMD(normalizedBody, parseInlineMD));
  }, [normalizedBody]);

  if (!normalizedBody) {
    return (
      <Text size="T300" priority="300">
        {emptyText}
      </Text>
    );
  }

  return <Box direction="Column" gap="200">{parse(html)}</Box>;
}
