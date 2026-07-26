import { JoinRule } from 'matrix-js-sdk';
import { AvatarFallback, AvatarImage, Icon, Icons, color } from 'folds';
import React, { ComponentProps, ReactEventHandler, ReactNode, forwardRef, useState } from 'react';
import * as css from './RoomAvatar.css';
import { getRoomIconSrc } from '../../utils/room';
import colorMXID from '../../../util/colorMXID';
import { useResilientAvatarMedia } from '../../hooks/useResilientAvatarMedia';

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
    imageKey,
    showFallback,
    handleLoad: handleMediaLoad,
    handleError,
  } = useResilientAvatarMedia(src, true);
  const currentImageKey = `${roomId}-${imageKey}`;
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
      {!imageReady && (
        <AvatarFallback
          style={{ backgroundColor: colorMXID(roomId ?? ''), color: color.Surface.Container }}
          className={css.RoomAvatar}
        >
          {renderFallback()}
        </AvatarFallback>
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
