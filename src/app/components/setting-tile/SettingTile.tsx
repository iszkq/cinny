import React, { ReactNode } from 'react';
import { Box, Text } from 'folds';
import { BreakWord } from '../../styles/Text.css';
import * as css from './SettingTile.css';

type SettingTileProps = {
  title?: ReactNode;
  description?: ReactNode;
  before?: ReactNode;
  after?: ReactNode;
  children?: ReactNode;
};
export function SettingTile({ title, description, before, after, children }: SettingTileProps) {
  return (
    <Box className={css.Root} alignItems="Center" gap="300">
      {before && <Box shrink="No">{before}</Box>}
      <Box className={css.Content} grow="Yes" direction="Column" gap="100">
        {title && (
          <Text className={BreakWord} size="T300">
            {title}
          </Text>
        )}
        {description && (
          <Text className={BreakWord} size="T200" priority="300">
            {description}
          </Text>
        )}
        {children}
      </Box>
      {after && (
        <Box className={css.After} shrink="No">
          {after}
        </Box>
      )}
    </Box>
  );
}
