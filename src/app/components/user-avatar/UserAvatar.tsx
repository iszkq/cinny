import { AvatarFallback, AvatarImage, color } from 'folds';
import React, { ReactEventHandler, ReactNode, useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import * as css from './UserAvatar.css';
import colorMXID from '../../../util/colorMXID';

const AVATAR_RETRY_LIMIT = 3;
const AVATAR_RETRY_DELAY_MS = 300;

type UserAvatarProps = {
  className?: string;
  userId: string;
  src?: string;
  alt?: string;
  renderFallback: () => ReactNode;
};
export function UserAvatar({ className, userId, src, alt, renderFallback }: UserAvatarProps) {
  const [error, setError] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<number>();

  useEffect(() => {
    retryCountRef.current = 0;
    setRetryNonce(0);
    setError(false);

    return () => {
      if (typeof retryTimerRef.current === 'number') {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = undefined;
      }
    };
  }, [src]);

  const handleLoad: ReactEventHandler<HTMLImageElement> = (evt) => {
    retryCountRef.current = 0;
    evt.currentTarget.setAttribute('data-image-loaded', 'true');
  };

  const handleError = () => {
    if (retryCountRef.current < AVATAR_RETRY_LIMIT) {
      retryCountRef.current += 1;
      retryTimerRef.current = window.setTimeout(() => {
        setError(false);
        setRetryNonce((value) => value + 1);
      }, AVATAR_RETRY_DELAY_MS * retryCountRef.current);
    }

    setError(true);
  };

  if (!src || error) {
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
      key={`${src}-${retryNonce}`}
      className={classNames(css.UserAvatar, className)}
      src={src}
      alt={alt}
      onError={handleError}
      onLoad={handleLoad}
      draggable={false}
    />
  );
}
