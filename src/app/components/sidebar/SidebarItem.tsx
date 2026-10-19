import classNames from 'classnames';
import { as, Avatar, Text, Tooltip, TooltipProvider, toRem } from 'folds';
import React, { ComponentProps, ReactNode, RefCallback, createContext, useContext } from 'react';
import * as css from './Sidebar.css';

export const SidebarLabelsContext = createContext(false);

export const SidebarItem = as<'div', css.SidebarItemVariants>(
  ({ as: AsSidebarAvatarBox = 'div', className, active, ...props }, ref) => (
    <AsSidebarAvatarBox
      data-active={active}
      data-sidebar-item
      className={classNames(css.SidebarItem({ active }), className)}
      {...props}
      ref={ref}
    />
  )
);

export const SidebarItemBadge = as<'div', css.SidebarItemBadgeVariants>(
  ({ as: AsSidebarBadgeBox = 'div', className, hasCount, ...props }, ref) => (
    <AsSidebarBadgeBox
      className={classNames(css.SidebarItemBadge({ hasCount }), className)}
      {...props}
      ref={ref}
    />
  )
);

export function SidebarItemTooltip({
  tooltip,
  children,
}: {
  tooltip?: ReactNode | string;
  children: (triggerRef: RefCallback<HTMLElement | SVGElement>) => ReactNode;
}) {
  const showLabels = useContext(SidebarLabelsContext);
  if (showLabels && tooltip) {
    const child = children(() => undefined);
    if (React.isValidElement<{ children?: ReactNode; style?: React.CSSProperties }>(child)) {
      return React.cloneElement(child, {
        style: {
          ...child.props.style,
          width: '100%',
          height:
            import.meta.env.VITE_ANDROID_APP === 'true' || import.meta.env.VITE_IOS_APP === 'true'
              ? 64
              : 44,
          minWidth: 0,
          display: 'flex',
          flexWrap: 'nowrap',
          justifyContent: 'flex-start',
          gap: 10,
          padding: '4px 8px',
          borderRadius: 8,
        },
        children: (
          <>
            <span
              className={css.LabelAvatar}
              style={{
                position: 'relative',
                width:
                  import.meta.env.VITE_ANDROID_APP === 'true' ||
                  import.meta.env.VITE_IOS_APP === 'true'
                    ? 46
                    : 34,
                height:
                  import.meta.env.VITE_ANDROID_APP === 'true' ||
                  import.meta.env.VITE_IOS_APP === 'true'
                    ? 46
                    : 34,
                flexShrink: 0,
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                borderRadius: 8,
              }}
            >
              {child.props.children}
            </span>
            <Text
              data-space-name
              as="span"
              size="T300"
              truncate
              style={{
                minWidth: 0,
                textAlign: 'left',
                fontSize: 'var(--starfire-space-font, 16px)',
              }}
            >
              {tooltip}
            </Text>
          </>
        ),
      });
    }
  }
  if (!tooltip) {
    return children(() => undefined);
  }

  return (
    <TooltipProvider
      delay={400}
      position="Right"
      tooltip={
        <Tooltip style={{ maxWidth: toRem(280) }}>
          <Text size="H5">{tooltip}</Text>
        </Tooltip>
      }
    >
      {children}
    </TooltipProvider>
  );
}

export const SidebarAvatar = as<'div', css.SidebarAvatarVariants & ComponentProps<typeof Avatar>>(
  ({ className, size, outlined, radii, ...props }, ref) => (
    <Avatar
      className={classNames(css.SidebarAvatar({ size, outlined }), className)}
      radii={radii}
      {...props}
      ref={ref}
    />
  )
);

export const SidebarFolder = as<'div', css.SidebarFolderVariants>(
  ({ as: AsSidebarFolder = 'div', className, state, ...props }, ref) => (
    <AsSidebarFolder
      data-folder-state={state}
      className={classNames(css.SidebarFolder({ state }), className)}
      {...props}
      ref={ref}
    />
  )
);

export const SidebarFolderDropTarget = as<'div', css.SidebarFolderDropTargetVariants>(
  ({ as: AsSidebarFolderDropTarget = 'div', className, position, ...props }, ref) => (
    <AsSidebarFolderDropTarget
      className={classNames(css.SidebarFolderDropTarget({ position }), className)}
      {...props}
      ref={ref}
    />
  )
);
