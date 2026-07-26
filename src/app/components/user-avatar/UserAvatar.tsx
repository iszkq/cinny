import { AvatarFallback, AvatarImage, color } from 'folds';
import React, { ReactEventHandler, ReactNode, useEffect, useState } from 'react';
import classNames from 'classnames';
import * as css from './UserAvatar.css';
import colorMXID from '../../../util/colorMXID';
import { useResilientAvatarMedia } from '../../hooks/useResilientAvatarMedia';

type UserAvatarProps = {
  className?: string;
  userId: string;
  src?: string;
  alt?: string;
  fallbackWhileLoading?: boolean;
  renderFallback: () => ReactNode;
};
export function UserAvatar({
  className,
  userId,
  src,
  alt,
  fallbackWhileLoading = false,
  renderFallback,
}: UserAvatarProps) {
  const {
    displaySrc,
    imageKey,
    showFallback,
    handleLoad: handleMediaLoad,
    handleError,
  } = useResilientAvatarMedia(src, true);
  const [preloadedSrc, setPreloadedSrc] = useState<string>();

  useEffect(() => {
    if (!fallbackWhileLoading || !displaySrc || showFallback) return undefined;

    let disposed = false;
    const image = new Image();
    image.onload = () => {
      if (!disposed) setPreloadedSrc(displaySrc);
    };
    image.onerror = () => {
      if (!disposed) handleError();
    };
    image.src = displaySrc;

    return () => {
      disposed = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [displaySrc, fallbackWhileLoading, handleError, showFallback]);

  const handleLoad: ReactEventHandler<HTMLImageElement> = (evt) => {
    evt.currentTarget.setAttribute('data-image-loaded', 'true');
    handleMediaLoad();
  };

  if (showFallback || (fallbackWhileLoading && preloadedSrc !== displaySrc)) {
    return (
      <AvatarFallback
        style={{ backgroundColor: colorMXID(userId), color: color.Surface.Container }}
        className={classNames(css.UserAvatar, className)}
      >
        {renderFallback()}
      </AvatarFallback>
    );
  }

  return (
    <AvatarImage
      key={imageKey}
      className={classNames(css.UserAvatar, className)}
      src={displaySrc}
      alt={alt}
      onError={handleError}
      onLoad={handleLoad}
      draggable={false}
    />
  );
}
