import { JoinRule } from 'matrix-js-sdk';
import { AvatarFallback, AvatarImage, Icon, Icons, color } from 'folds';
import React, {
  ComponentProps,
  ReactEventHandler,
  ReactNode,
  forwardRef,
  useEffect,
  useRef,
  useState,
} from 'react';
import * as css from './RoomAvatar.css';
import { getRoomIconSrc } from '../../utils/room';
import colorMXID from '../../../util/colorMXID';

const AVATAR_RETRY_LIMIT = 3;
const AVATAR_RETRY_DELAY_MS = 300;

type RoomAvatarProps = {
  roomId: string;
  src?: string;
  alt?: string;
  renderFallback: () => ReactNode;
};
export function RoomAvatar({ roomId, src, alt, renderFallback }: RoomAvatarProps) {
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
        style={{ backgroundColor: colorMXID(roomId ?? ''), color: color.Surface.Container }}
        className={css.RoomAvatar}
      >
        {renderFallback()}
      </AvatarFallback>
    );
  }

  return (
    <AvatarImage
      key={`${src}-${retryNonce}`}
      className={css.RoomAvatar}
      src={src}
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
