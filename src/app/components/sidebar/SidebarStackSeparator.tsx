import React from 'react';
import { Line, toRem } from 'folds';
import { ScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';

export function SidebarStackSeparator() {
  const screenSize = useScreenSizeContext();
  const mobile = screenSize === ScreenSize.Mobile;

  return (
    <Line
      role="separator"
      style={
        mobile
          ? { width: toRem(1), height: toRem(24), margin: `${toRem(8)} ${toRem(4)}` }
          : { width: toRem(24), margin: '0 auto' }
      }
      variant="Background"
      size="300"
      direction={mobile ? 'Vertical' : 'Horizontal'}
    />
  );
}
