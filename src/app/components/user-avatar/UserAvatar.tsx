import { AvatarFallback, AvatarImage, color } from 'folds';
import React, { ReactEventHandler, ReactNode } from 'react';
import classNames from 'classnames';
import * as css from './UserAvatar.css';
import colorMXID from '../../../util/colorMXID';
import { useResilientAvatarMedia } from '../../hooks/useResilientAvatarMedia';

type UserAvatarProps = {
  className?: string;
  userId: string;
  src?: string;
  alt?: string;
  renderFallback: () => ReactNode;
};
export function UserAvatar({ className, userId, src, alt, renderFallback }: UserAvatarProps) {
  const { displaySrc, imageKey, showFallback, handleLoad: handleMediaLoad, handleError } =
    useResilientAvatarMedia(src);

  const handleLoad: ReactEventHandler<HTMLImageElement> = (evt) => {
    evt.currentTarget.setAttribute('data-image-loaded', 'true');
    handleMediaLoad();
  };

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
      onError={handleError}
      onLoad={handleLoad}
      draggable={false}
    />
  );
}
