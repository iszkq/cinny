import React, { ReactNode } from 'react';
import classNames from 'classnames';
import { Box, as } from 'folds';
import * as css from './layout.css';

function BubbleLeftArrow() {
  return (
    <svg
      className={css.BubbleLeftArrow}
      width="14"
      height="12"
      viewBox="0 0 14 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M13.6 11.4V0.6H7.2C4.36 0.6 2.94 4.03 4.95 6.04L10.87 11.4H13.6Z"
        fill="currentColor"
        stroke={`var(${css.BubbleBorderVar})`}
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type BubbleLayoutProps = {
  hideBubble?: boolean;
  before?: ReactNode;
  header?: ReactNode;
  after?: ReactNode;
  footer?: ReactNode;
  tone?: keyof typeof css.BubbleTone;
};

export const BubbleLayout = as<'div', BubbleLayoutProps>(
  ({ hideBubble, before, header, after, footer, tone = 'neutral', children, ...props }, ref) => (
    <Box gap="300" {...props} ref={ref}>
      <Box className={css.BubbleBefore} shrink="No">
        {before}
      </Box>
      <Box className={css.MessageContent} grow="Yes" direction="Column">
        {header}
        {hideBubble ? (
          <>
            {children}
            {footer}
          </>
        ) : (
          <>
            <Box className={css.BubbleRow}>
              <Box className={css.BubbleMain}>
                <Box>
                  <Box
                    className={classNames(
                      css.BubbleContent,
                      css.BubbleTone[tone],
                      before ? css.BubbleContentArrowLeft : undefined
                    )}
                    direction="Column"
                  >
                    {before ? <BubbleLeftArrow /> : null}
                    {children}
                  </Box>
                </Box>
              </Box>
              {after ? <Box className={css.BubbleAside}>{after}</Box> : null}
            </Box>
            {footer}
          </>
        )}
      </Box>
    </Box>
  )
);
