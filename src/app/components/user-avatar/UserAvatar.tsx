import { AvatarFallback, AvatarImage, color } from 'folds';
import React, { ReactEventHandler, ReactNode, useState } from 'react';
import classNames from 'classnames';
import * as css from './UserAvatar.css';
import colorMXID from '../../../util/colorMXID';
import { useResilientAvatarMedia } from '../../hooks/useResilientAvatarMedia';

type LoadedAvatarImage = {
  key: string;
  ownerId: string;
  source?: string;
  url: string;
};

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
    displaySrcLoaded,
    imageKey,
    showFallback,
    handleLoad: handleMediaLoad,
    handleError,
  } = useResilientAvatarMedia(src, true);
  const currentImageKey = `${userId}-${imageKey}`;
  const [loadedImage, setLoadedImage] = useState<LoadedAvatarImage>();
  const imageReady =
    !showFallback &&
    Boolean(displaySrc && (displaySrcLoaded || loadedImage?.key === currentImageKey));
  const retainedImage =
    !imageReady &&
    src &&
    loadedImage?.ownerId === userId &&
    (!showFallback || loadedImage.source === src)
      ? loadedImage
      : undefined;
  const renderLoadingFallback = !imageReady && !retainedImage;

  const handleLoad: ReactEventHandler<HTMLImageElement> = (evt) => {
    evt.currentTarget.setAttribute('data-image-loaded', 'true');
    if (displaySrc) {
      setLoadedImage({
        key: currentImageKey,
        ownerId: userId,
        source: src,
        url: displaySrc,
      });
    }
    handleMediaLoad();
  };

  const handleImageError: ReactEventHandler<HTMLImageElement> = () => {
    setLoadedImage((current) => (current?.key === currentImageKey ? undefined : current));
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
      {renderLoadingFallback && (
        <AvatarFallback
          style={{ backgroundColor: colorMXID(userId), color: color.Surface.Container }}
          className={classNames(css.UserAvatar, className)}
        >
          {renderFallback()}
        </AvatarFallback>
      )}
      {retainedImage && (
        <AvatarImage
          key={retainedImage.key}
          className={classNames(css.UserAvatar, className)}
          src={retainedImage.url}
          alt={alt}
          data-image-loaded="true"
          draggable={false}
        />
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
