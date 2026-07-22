import React from 'react';
import { Box, Icon, Icons, Text } from 'folds';
import { APP_VERSION } from '../../constants/branding';
import { PROJECT_SOURCE_URL } from '../../constants/projectInfo';
import { PWAInstallButton } from '../../components/PWAInstallButton';
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
      <PWAInstallButton
        variant="Secondary"
        fill="None"
        size="300"
        radii="300"
        before={<Icon src={Icons.Download} size="100" />}
      >
        <Text size="T300">安装应用</Text>
      </PWAInstallButton>
      <Text as="a" size="T300" href="https://matrix.org" target="_blank" rel="noreferrer">
        基于 Matrix 协议
      </Text>
    </Box>
  );
}
