import React, { ReactNode } from 'react';
import classNames from 'classnames';
import { Box, as } from 'folds';
import * as css from './layout.css';

function BubbleLeftArrow() {
  return (
    <svg
      className={css.BubbleLeftArrow}
      width="18"
      height="14"
      viewBox="0 0 18 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M18 13.2V0.8H6.4C3 0.8 1.5 4.9 3.8 7.1L10.2 13.2H18Z"
        fill="currentColor"
      />
      <path
        d="M18 0.8H6.4C3 0.8 1.5 4.9 3.8 7.1L10.2 13.2"
        fill="none"
        stroke={`var(${css.BubbleBorderVar})`}
        strokeWidth="1.15"
        strokeLinecap="round"
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
            <Box className={css.BubbleStack}>
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
