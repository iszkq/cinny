import React, { ReactNode } from 'react';
import { Box } from 'folds';
import { ScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';

type SidebarContentProps = {
  scrollable: ReactNode;
  sticky: ReactNode;
};
export function SidebarContent({ scrollable, sticky }: SidebarContentProps) {
  const screenSize = useScreenSizeContext();

  if (screenSize === ScreenSize.Mobile) {
    return (
      <>
        <Box grow="Yes" alignItems="Center" style={{ minWidth: 0 }}>
          {scrollable}
        </Box>
        <Box shrink="No" alignItems="Center">
          {sticky}
        </Box>
      </>
    );
  }

  return (
    <>
      <Box direction="Column" grow="Yes">
        {scrollable}
      </Box>
      <Box direction="Column" shrink="No">
        {sticky}
      </Box>
    </>
  );
}
