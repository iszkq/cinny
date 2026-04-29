import { ReactNode } from 'react';
import { useMatch } from 'react-router-dom';
import { isCompactScreenSize, useScreenSizeContext } from '../hooks/useScreenSize';
import { DIRECT_PATH, EXPLORE_PATH, FAVORITES_PATH, HOME_PATH, INBOX_PATH, SPACE_PATH } from './paths';

type MobileFriendlyClientNavProps = {
  children: ReactNode;
};
export function MobileFriendlyClientNav({ children }: MobileFriendlyClientNavProps) {
  const screenSize = useScreenSizeContext();
  const homeMatch = useMatch({ path: HOME_PATH, caseSensitive: true, end: true });
  const directMatch = useMatch({ path: DIRECT_PATH, caseSensitive: true, end: true });
  const spaceMatch = useMatch({ path: SPACE_PATH, caseSensitive: true, end: true });
  const exploreMatch = useMatch({ path: EXPLORE_PATH, caseSensitive: true, end: true });
  const favoritesMatch = useMatch({ path: FAVORITES_PATH, caseSensitive: true, end: true });
  const inboxMatch = useMatch({ path: INBOX_PATH, caseSensitive: true, end: true });

  if (
    isCompactScreenSize(screenSize) &&
    !(homeMatch || directMatch || spaceMatch || exploreMatch || favoritesMatch || inboxMatch)
  ) {
    return null;
  }

  return children;
}

type MobileFriendlyPageNavProps = {
  path: string;
  children: ReactNode;
};
export function MobileFriendlyPageNav({ path, children }: MobileFriendlyPageNavProps) {
  const screenSize = useScreenSizeContext();
  const exactPath = useMatch({
    path,
    caseSensitive: true,
    end: true,
  });

  if (isCompactScreenSize(screenSize) && !exactPath) {
    return null;
  }

  return children;
}
