import { AvatarFallback, AvatarImage, color } from 'folds';
import React, { ReactEventHandler, ReactNode, useState } from 'react';
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
  fallbackWhileLoading = true,
  renderFallback,
}: UserAvatarProps) {
  const {
    displaySrc,
    imageKey,
    showFallback,
    handleLoad: handleMediaLoad,
    handleError,
  } = useResilientAvatarMedia(src, true);
  const currentImageKey = `${userId}-${imageKey}`;
  const [loadedImageKey, setLoadedImageKey] = useState<string>();
  const imageReady = !showFallback && loadedImageKey === currentImageKey;

  const handleLoad: ReactEventHandler<HTMLImageElement> = (evt) => {
    evt.currentTarget.setAttribute('data-image-loaded', 'true');
    setLoadedImageKey(currentImageKey);
    handleMediaLoad();
  };

  const handleImageError: ReactEventHandler<HTMLImageElement> = () => {
    setLoadedImageKey(undefined);
    handleError();
  };

  if (!fallbackWhileLoading) {
    if (showFallback) {
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
        onError={handleImageError}
        onLoad={handleLoad}
        draggable={false}
      />
    );
  }

  return (
    <>
      {!imageReady && (
        <AvatarFallback
          style={{ backgroundColor: colorMXID(userId), color: color.Surface.Container }}
          className={classNames(css.UserAvatar, className)}
        >
          {renderFallback()}
        </AvatarFallback>
      )}
      {!showFallback && displaySrc && (
        <AvatarImage
          key={imageKey}
          className={classNames(css.UserAvatar, className)}
          src={displaySrc}
          alt={imageReady ? alt : ''}
          aria-hidden={!imageReady}
          style={{ visibility: imageReady ? 'visible' : 'hidden' }}
          onError={handleImageError}
          onLoad={handleLoad}
          draggable={false}
        />
      )}
    </>
  );
}
