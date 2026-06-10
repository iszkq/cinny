import React from 'react';
import { Navigate } from 'react-router-dom';
import { isDesktopLikeScreenSize, useScreenSizeContext } from '../../../hooks/useScreenSize';
import { getExploreFeaturedPath } from '../../pathUtils';

export function ExploreLanding() {
  const screenSize = useScreenSizeContext();

  if (!isDesktopLikeScreenSize(screenSize)) return null;

  return <Navigate to={getExploreFeaturedPath()} replace />;
}
