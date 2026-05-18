import React, { ReactNode } from 'react';
import { Box } from 'folds';
import * as css from './ClientLayout.css';

type ClientLayoutProps = {
  nav: ReactNode;
  children: ReactNode;
};
export function ClientLayout({ nav, children }: ClientLayoutProps) {
  return (
    <Box grow="Yes" className={css.Root}>
      <Box grow="Yes" className={css.DesktopShell}>
        <Box shrink="No" className={css.NavRail} style={{ minHeight: 0 }}>
          {nav}
        </Box>
        <Box grow="Yes" className={css.Content} style={{ minWidth: 0, minHeight: 0 }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
