import { JoinRule } from 'matrix-js-sdk';
import { AvatarFallback, AvatarImage, Icon, Icons, color } from 'folds';
import React, {
  ComponentProps,
  ReactEventHandler,
  ReactNode,
  forwardRef,
  useEffect,
  useState,
} from 'react';
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
  fallbackWhileLoading = false,
  renderFallback,
}: RoomAvatarProps) {
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
      onError={handleError}
      onLoad={handleLoad}
      draggable={false}
    />
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
