import { Box, Text } from 'folds';
import React, { ReactNode } from 'react';
import classNames from 'classnames';
import { APP_DISPLAY_NAME, APP_TAGLINE } from '../../constants/branding';
import * as patternsCSS from '../../styles/Patterns.css';
import * as css from './SplashScreen.css';

type SplashScreenProps = {
  children: ReactNode;
};
export function SplashScreen({ children }: SplashScreenProps) {
  return (
    <Box
      className={classNames(css.SplashScreen, patternsCSS.BackgroundDotPattern)}
      direction="Column"
    >
      {children}
      <Box
        className={css.SplashScreenFooter}
        shrink="No"
        alignItems="Center"
        justifyContent="Center"
      >
        <Box direction="Column" gap="50" alignItems="Center">
          <Text size="H2" align="Center">
            {APP_DISPLAY_NAME}
          </Text>
          <Text size="T200" align="Center" priority="300">
            {APP_TAGLINE}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
