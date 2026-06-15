import { RefObject, useCallback, useLayoutEffect, useRef, useState } from 'react';

export const useVirtualizerScrollMargin = <TElement extends HTMLElement>(
  scrollRef: RefObject<HTMLElement>
) => {
  const virtualListRef = useRef<TElement>(null);
  const scrollMarginRef = useRef(0);
  const [scrollMargin, setScrollMargin] = useState(0);

  const updateScrollMargin = useCallback(() => {
    const scrollElement = scrollRef.current;
    const virtualListElement = virtualListRef.current;
    if (!scrollElement || !virtualListElement) return;

    const scrollRect = scrollElement.getBoundingClientRect();
    const listRect = virtualListElement.getBoundingClientRect();
    const nextScrollMargin = Math.max(
      0,
      Math.round(listRect.top - scrollRect.top + scrollElement.scrollTop)
    );

    if (scrollMarginRef.current === nextScrollMargin) return;

    scrollMarginRef.current = nextScrollMargin;
    setScrollMargin(nextScrollMargin);
  }, [scrollRef]);

  useLayoutEffect(() => {
    updateScrollMargin();
  });

  useLayoutEffect(() => {
    updateScrollMargin();
    const scrollElement = scrollRef.current;
    const virtualListElement = virtualListRef.current;

    window.addEventListener('resize', updateScrollMargin);

    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(updateScrollMargin);

    if (resizeObserver) {
      if (scrollElement) resizeObserver.observe(scrollElement);
      if (virtualListElement) resizeObserver.observe(virtualListElement);
    }

    return () => {
      window.removeEventListener('resize', updateScrollMargin);
      resizeObserver?.disconnect();
    };
  }, [scrollRef, updateScrollMargin]);

  return { scrollMargin, virtualListRef };
};
