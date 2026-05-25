import React, {
  ComponentProps,
  MutableRefObject,
  PointerEventHandler,
  ReactNode,
  useRef,
  useState,
} from 'react';
import { Box, Header, Line, Scroll, Text, as } from 'folds';
import { useAtom } from 'jotai';
import classNames from 'classnames';
import { ContainerColor } from '../../styles/ContainerColor.css';
import * as css from './style.css';
import {
  ScreenSize,
  isDesktopLikeScreenSize,
  useScreenSizeContext,
} from '../../hooks/useScreenSize';
import { desktopPageNavWidthAtom } from '../../state/desktopPageNav';

type PageRootProps = {
  nav: ReactNode;
  children: ReactNode;
};

export function PageRoot({ nav, children }: PageRootProps) {
  const screenSize = useScreenSizeContext();
  const desktopLayout = isDesktopLikeScreenSize(screenSize);

  return (
    <Box
      grow="Yes"
      className={ContainerColor({ variant: 'Background' })}
      style={{ position: 'relative', minWidth: 0 }}
    >
      {nav}
      {nav && desktopLayout && <Line variant="Background" size="300" direction="Vertical" />}
      {children}
    </Box>
  );
}

type ClientDrawerLayoutProps = {
  children: ReactNode;
  resizable?: boolean;
};

const DESKTOP_PAGE_NAV_MIN_WIDTH = 208;
const DESKTOP_PAGE_NAV_MAX_WIDTH = 420;

const clampDesktopPageNavWidth = (width: number): number =>
  Math.min(DESKTOP_PAGE_NAV_MAX_WIDTH, Math.max(DESKTOP_PAGE_NAV_MIN_WIDTH, width));

export function PageNav({
  size,
  children,
  resizable,
}: ClientDrawerLayoutProps & css.PageNavVariants) {
  const screenSize = useScreenSizeContext();
  const desktopLayout = isDesktopLikeScreenSize(screenSize);
  const isMobile = screenSize === ScreenSize.Mobile && !desktopLayout;
  const [desktopPageNavWidth, setDesktopPageNavWidth] = useAtom(desktopPageNavWidthAtom);
  const [resizing, setResizing] = useState(false);
  const resizeRef = useRef<
    { pointerId: number; startX: number; startWidth: number } | undefined
  >(undefined);

  const handleResizePointerDown: PointerEventHandler<HTMLDivElement> = (evt) => {
    if (!resizable || !desktopLayout) return;

    evt.preventDefault();
    evt.stopPropagation();
    const startWidth = clampDesktopPageNavWidth(desktopPageNavWidth);
    resizeRef.current = {
      pointerId: evt.pointerId,
      startX: evt.clientX,
      startWidth,
    };
    setDesktopPageNavWidth(startWidth);
    setResizing(true);
    evt.currentTarget.setPointerCapture?.(evt.pointerId);
  };

  const handleResizePointerMove: PointerEventHandler<HTMLDivElement> = (evt) => {
    const state = resizeRef.current;
    if (!state || evt.pointerId !== state.pointerId) return;

    setDesktopPageNavWidth(
      clampDesktopPageNavWidth(state.startWidth + evt.clientX - state.startX)
    );
  };

  const handleResizePointerEnd: PointerEventHandler<HTMLDivElement> = (evt) => {
    const state = resizeRef.current;
    if (!state || evt.pointerId !== state.pointerId) return;

    resizeRef.current = undefined;
    setResizing(false);
    evt.currentTarget.releasePointerCapture?.(evt.pointerId);
  };

  const desktopWidth =
    resizable && desktopLayout ? clampDesktopPageNavWidth(desktopPageNavWidth) : undefined;

  return (
    <Box
      grow={isMobile ? 'Yes' : undefined}
      className={css.PageNav({ size })}
      shrink={isMobile ? 'Yes' : 'No'}
      style={{
        position: 'relative',
        ...(desktopWidth
          ? {
              flexBasis: `${desktopWidth}px`,
              width: `${desktopWidth}px`,
              minWidth: `${desktopWidth}px`,
              maxWidth: `${desktopWidth}px`,
            }
          : undefined),
      }}
    >
      <Box grow="Yes" direction="Column">
        {children}
      </Box>
      {resizable && desktopLayout && (
        <div
          className={css.PageNavResizeHandle}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize section list"
          aria-valuemin={DESKTOP_PAGE_NAV_MIN_WIDTH}
          aria-valuemax={DESKTOP_PAGE_NAV_MAX_WIDTH}
          aria-valuenow={desktopWidth}
          data-active={resizing}
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerEnd}
          onPointerCancel={handleResizePointerEnd}
        >
          <div className={css.PageNavResizeHandleLine} />
        </div>
      )}
    </Box>
  );
}

export const PageNavHeader = as<'header', css.PageNavHeaderVariants>(
  ({ className, outlined, ...props }, ref) => (
    <Header
      className={classNames(css.PageNavHeader({ outlined }), className)}
      variant="Background"
      size="600"
      {...props}
      ref={ref}
    />
  )
);

export function PageNavContent({
  scrollRef,
  children,
}: {
  children: ReactNode;
  scrollRef?: MutableRefObject<HTMLDivElement | null>;
}) {
  return (
    <Box grow="Yes" direction="Column">
      <Scroll
        ref={scrollRef}
        variant="Background"
        direction="Vertical"
        size="300"
        hideTrack
        visibility="Hover"
      >
        <div className={css.PageNavContent}>{children}</div>
      </Scroll>
    </Box>
  );
}

export const Page = as<'div'>(({ className, ...props }, ref) => (
  <Box
    grow="Yes"
    direction="Column"
    className={classNames(ContainerColor({ variant: 'Surface' }), css.PageSurface, className)}
    {...props}
    ref={ref}
  />
));

export const PageHeader = as<'div', css.PageHeaderVariants>(
  ({ className, outlined, balance, ...props }, ref) => (
    <Header
      as="header"
      size="600"
      className={classNames(css.PageHeader({ balance, outlined }), className)}
      {...props}
      ref={ref}
    />
  )
);

export const PageContent = as<'div'>(({ className, ...props }, ref) => (
  <div className={classNames(css.PageContent, className)} {...props} ref={ref} />
));

export function PageHeroEmpty({ children }: { children: ReactNode }) {
  return (
    <Box
      className={classNames(ContainerColor({ variant: 'SurfaceVariant' }), css.PageHeroEmpty)}
      direction="Column"
      alignItems="Center"
      justifyContent="Center"
      gap="200"
    >
      {children}
    </Box>
  );
}

export const PageHeroSection = as<'div', ComponentProps<typeof Box>>(
  ({ className, ...props }, ref) => (
    <Box
      direction="Column"
      className={classNames(css.PageHeroSection, className)}
      {...props}
      ref={ref}
    />
  )
);

export function PageHero({
  icon,
  title,
  subTitle,
  children,
}: {
  icon: ReactNode;
  title: ReactNode;
  subTitle: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Box direction="Column" gap="400">
      <Box direction="Column" alignItems="Center" gap="200">
        {icon}
      </Box>
      <Box as="h2" direction="Column" gap="200" alignItems="Center">
        <Text align="Center" size="H2">
          {title}
        </Text>
        <Text align="Center" priority="400">
          {subTitle}
        </Text>
      </Box>
      {children}
    </Box>
  );
}

export const PageContentCenter = as<'div'>(({ className, ...props }, ref) => (
  <div className={classNames(css.PageContentCenter, className)} {...props} ref={ref} />
));
