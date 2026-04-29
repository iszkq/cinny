import React, { ReactNode } from 'react';
import { Box } from 'folds';
import { useAtomValue } from 'jotai';
import { ScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';
import { desktopPageNavCollapsedAtom } from '../../state/desktopPageNav';
import { useHomeSelected } from '../../hooks/router/useHomeSelected';
import { useDirectSelected } from '../../hooks/router/useDirectSelected';
import { useExploreSelected } from '../../hooks/router/useExploreSelected';
import { useInboxSelected } from '../../hooks/router/useInbox';
import { useSelectedSpace } from '../../hooks/router/useSelectedSpace';

type ClientLayoutProps = {
  nav: ReactNode;
  children: ReactNode;
};
export function ClientLayout({ nav, children }: ClientLayoutProps) {
  const screenSize = useScreenSizeContext();
  const desktopPageNavCollapsed = useAtomValue(desktopPageNavCollapsedAtom);
  const homeSelected = useHomeSelected();
  const directSelected = useDirectSelected();
  const exploreSelected = useExploreSelected();
  const inboxSelected = useInboxSelected();
  const selectedSpaceId = useSelectedSpace();
  const hasSecondaryNav =
    homeSelected || directSelected || exploreSelected || inboxSelected || !!selectedSpaceId;
  const showPrimaryNav = !(
    screenSize === ScreenSize.Desktop &&
    hasSecondaryNav &&
    !desktopPageNavCollapsed
  );

  return (
    <Box grow="Yes" style={{ minWidth: 0, minHeight: 0 }}>
      {showPrimaryNav && (
        <Box shrink="No" style={{ minHeight: 0 }}>
          {nav}
        </Box>
      )}
      <Box grow="Yes" style={{ minWidth: 0, minHeight: 0 }}>
        {children}
      </Box>
    </Box>
  );
}
