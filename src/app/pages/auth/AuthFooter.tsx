import React from 'react';
import { Box, Text } from 'folds';
import { APP_VERSION } from '../../constants/branding';
import { PROJECT_SOURCE_URL } from '../../constants/projectInfo';
import * as css from './styles.css';

export function AuthFooter() {
  return (
    <Box className={css.AuthFooter} justifyContent="Center" gap="400" wrap="Wrap">
      <Text as="a" size="T300" href={PROJECT_SOURCE_URL} target="_blank" rel="noreferrer">
        关于项目
      </Text>
      <Text as="span" size="T300">
        {`v${APP_VERSION}`}
      </Text>
      <Text as="a" size="T300" href="https://matrix.org" target="_blank" rel="noreferrer">
        基于 Matrix 协议
      </Text>
    </Box>
  );
}
