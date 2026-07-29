import { JoinRule } from 'matrix-js-sdk';
import { AvatarFallback, AvatarImage, Icon, Icons, color } from 'folds';
import React, { ComponentProps, ReactEventHandler, ReactNode, forwardRef, useState } from 'react';
import * as css from './RoomAvatar.css';
import { getRoomIconSrc } from '../../utils/room';
import colorMXID from '../../../util/colorMXID';
import { useResilientAvatarMedia } from '../../hooks/useResilientAvatarMedia';

type LoadedAvatarImage = {
  key: string;
  ownerId: string;
  source?: string;
  url: string;
};

type RoomAvatarProps = {
  roomId: string;
  src?: string;
  alt?: string;
  fallbackWhileLoading?: boolean;
  renderFallback: () => ReactNode;
};
export function RoomAvatar({
  roomId,
  src,
  alt,
  fallbackWhileLoading = true,
  renderFallback,
}: RoomAvatarProps) {
  const {
    displaySrc,
    displaySrcLoaded,
    imageKey,
    showFallback,
    handleLoad: handleMediaLoad,
    handleError,
  } = useResilientAvatarMedia(src, true);
  const currentImageKey = `${roomId}-${imageKey}`;
  const [loadedImage, setLoadedImage] = useState<LoadedAvatarImage>();
  const imageReady =
    !showFallback &&
    Boolean(displaySrc && (displaySrcLoaded || loadedImage?.key === currentImageKey));
  const retainedImage =
    !imageReady &&
    src &&
    loadedImage?.ownerId === roomId &&
    (!showFallback || loadedImage.source === src)
      ? loadedImage
      : undefined;
  const renderLoadingFallback = !imageReady && !retainedImage;

  const handleLoad: ReactEventHandler<HTMLImageElement> = (evt) => {
    evt.currentTarget.setAttribute('data-image-loaded', 'true');
    if (displaySrc) {
      setLoadedImage({
        key: currentImageKey,
        ownerId: roomId,
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
          style={{ backgroundColor: colorMXID(roomId ?? ''), color: color.Surface.Container }}
          className={css.RoomAvatar}
        >
          {renderFallback()}
        </AvatarFallback>
      );
    }

    return (
      <AvatarImage
        key={imageKey}
        className={css.RoomAvatar}
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
          style={{ backgroundColor: colorMXID(roomId ?? ''), color: color.Surface.Container }}
          className={css.RoomAvatar}
        >
          {renderFallback()}
        </AvatarFallback>
      )}
      {retainedImage && (
        <AvatarImage
          key={retainedImage.key}
          className={css.RoomAvatar}
          src={retainedImage.url}
          alt={alt}
          data-image-loaded="true"
          draggable={false}
        />
      )}
      {!showFallback && displaySrc && (
        <AvatarImage
          key={imageKey}
          className={css.RoomAvatar}
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

export const RoomIcon = forwardRef<
  SVGSVGElement,
  Omit<ComponentProps<typeof Icon>, 'src'> & {
    joinRule?: JoinRule;
    roomType?: string;
  }
>(({ joinRule, roomType, ...props }, ref) => (
  <Icon src={getRoomIconSrc(Icons, roomType, joinRule)} {...props} ref={ref} />
));
