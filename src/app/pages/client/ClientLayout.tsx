import React, { ReactNode } from 'react';
import { Box } from 'folds';

type ClientLayoutProps = {
  nav: ReactNode;
  children: ReactNode;
};
export function ClientLayout({ nav, children }: ClientLayoutProps) {
  return (
    <Box grow="Yes" style={{ minWidth: 0, minHeight: 0 }}>
      <Box shrink="No" style={{ minHeight: 0 }}>
        {nav}
      </Box>
      <Box grow="Yes" style={{ minWidth: 0, minHeight: 0 }}>
        {children}
      </Box>
    </Box>
  );
}
