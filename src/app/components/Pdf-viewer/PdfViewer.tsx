/* eslint-disable no-param-reassign */
import React, {
  FormEventHandler,
  MouseEventHandler,
  PointerEventHandler,
  WheelEventHandler,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import classNames from 'classnames';
import {
  Box,
  Button,
  Chip,
  Header,
  Icon,
  IconButton,
  Icons,
  Input,
  Menu,
  PopOut,
  RectCords,
  Scroll,
  Spinner,
  Text,
  as,
  config,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import * as css from './PdfViewer.css';
import { AsyncStatus } from '../../hooks/useAsyncCallback';
import { useDragScroll } from '../../hooks/useDragScroll';
import { useZoom } from '../../hooks/useZoom';
import { createPage, usePdfDocumentLoader, usePdfJSLoader } from '../../plugins/pdfjs-dist';
import { stopPropagation } from '../../utils/keyboard';
import { saveDownloadedFile } from '../../utils/saveDownloadedFile';

export type PdfViewerProps = {
  name: string;
  src: string;
  requestClose: () => void;
};

const ZOOM_STEP = 0.2;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const PAGE_SWIPE_THRESHOLD = 88;
const PAGE_SWIPE_VERTICAL_TOLERANCE = 28;

export const PdfViewer = as<'div', PdfViewerProps>(
  ({ className, name, src, requestClose, ...props }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const gestureRef = useRef<{
      pointerId: number;
      startX: number;
      startY: number;
      startScrollLeft: number;
      startScrollTop: number;
      pointerType: string;
      triggered: boolean;
    }>();
    const { zoom, zoomIn, zoomOut, setZoom } = useZoom(ZOOM_STEP, MIN_ZOOM, MAX_ZOOM);

    const [pdfJSState, loadPdfJS] = usePdfJSLoader();
    const [docState, loadPdfDocument] = usePdfDocumentLoader(
      pdfJSState.status === AsyncStatus.Success ? pdfJSState.data : undefined,
      src
    );
    const isLoading =
      pdfJSState.status === AsyncStatus.Loading || docState.status === AsyncStatus.Loading;
    const isError =
      pdfJSState.status === AsyncStatus.Error || docState.status === AsyncStatus.Error;
    const [pageNo, setPageNo] = useState(1);
    const [jumpAnchor, setJumpAnchor] = useState<RectCords>();
    const [panAvailable, setPanAvailable] = useState(false);
    const { cursor, onMouseDown: handleMouseDragStart } = useDragScroll(
      scrollRef,
      panAvailable,
      `${src}:${pageNo}:${zoom}`
    );

    const updatePanAvailability = useCallback(() => {
      const viewport = scrollRef.current;
      const content = containerRef.current;
      if (!viewport || !content) {
        setPanAvailable(false);
        return;
      }

      const nextPanAvailable =
        viewport.scrollWidth > viewport.clientWidth + 1 ||
        viewport.scrollHeight > viewport.clientHeight + 1;

      setPanAvailable(nextPanAvailable);
    }, []);

    useEffect(() => {
      loadPdfJS().catch(() => undefined);
    }, [loadPdfJS]);

    useEffect(() => {
      if (pdfJSState.status === AsyncStatus.Success) {
        loadPdfDocument().catch(() => undefined);
      }
    }, [pdfJSState, loadPdfDocument]);

    useEffect(() => {
      setZoom(1);
      setPageNo(1);
      setPanAvailable(false);
      gestureRef.current = undefined;
    }, [setZoom, src]);

    useEffect(() => {
      window.addEventListener('resize', updatePanAvailability);

      return () => {
        window.removeEventListener('resize', updatePanAvailability);
      };
    }, [updatePanAvailability]);

    const canPrev = docState.status === AsyncStatus.Success && pageNo > 1;
    const canNext = docState.status === AsyncStatus.Success && pageNo < docState.data.numPages;

    const goToPage = (nextPage: number) => {
      if (docState.status !== AsyncStatus.Success) return;
      setPageNo(Math.max(1, Math.min(docState.data.numPages, nextPage)));
    };

    const goPrev = () => {
      if (!canPrev) return;
      goToPage(pageNo - 1);
    };

    const goNext = () => {
      if (!canNext) return;
      goToPage(pageNo + 1);
    };

    useEffect(() => {
      if (docState.status !== AsyncStatus.Success) return undefined;

      const doc = docState.data;
      if (pageNo < 1 || pageNo > doc.numPages) return undefined;

      let cancelled = false;
      let frameId: number | undefined;

      createPage(doc, pageNo, { scale: zoom })
        .then((canvas) => {
          if (cancelled) return;

          const container = containerRef.current;
          if (!container) return;

          container.textContent = '';
          container.append(canvas);
          scrollRef.current?.scrollTo({
            top: 0,
            left: 0,
          });
          frameId = window.requestAnimationFrame(() => {
            if (!cancelled) {
              updatePanAvailability();
            }
          });
        })
        .catch(() => undefined);

      return () => {
        cancelled = true;
        if (typeof frameId === 'number') {
          window.cancelAnimationFrame(frameId);
        }
      };
    }, [docState, pageNo, updatePanAvailability, zoom]);

    const handleDownload = async () => {
      const response = await fetch(src);
      const fileContent = await response.blob();
      await saveDownloadedFile(fileContent, name);
    };

    const handleRetry = () => {
      if (pdfJSState.status === AsyncStatus.Error) {
        loadPdfJS().catch(() => undefined);
        return;
      }

      loadPdfDocument().catch(() => undefined);
    };

    const handleJumpSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
      evt.preventDefault();
      if (docState.status !== AsyncStatus.Success) return;
      const jumpInput = evt.currentTarget.jumpInput as HTMLInputElement;
      if (!jumpInput) return;
      const jumpTo = parseInt(jumpInput.value, 10);
      goToPage(jumpTo);
      setJumpAnchor(undefined);
    };

    const handleOpenJump: MouseEventHandler<HTMLButtonElement> = (evt) => {
      setJumpAnchor(evt.currentTarget.getBoundingClientRect());
    };

    const handleWheel: WheelEventHandler<HTMLDivElement> = (evt) => {
      evt.preventDefault();

      const direction = evt.deltaY < 0 ? 1 : -1;
      setZoom((currentZoom) => {
        const nextZoom = Number((currentZoom + direction * ZOOM_STEP).toFixed(2));
        if (nextZoom < MIN_ZOOM) return MIN_ZOOM;
        if (nextZoom > MAX_ZOOM) return MAX_ZOOM;
        return nextZoom;
      });
    };

    const clearGesture = () => {
      gestureRef.current = undefined;
    };

    const handlePointerDown: PointerEventHandler<HTMLDivElement> = (evt) => {
      const viewport = scrollRef.current;
      if (docState.status !== AsyncStatus.Success || evt.button !== 0 || !viewport) return;
      if (panAvailable && evt.pointerType === 'mouse') return;

      gestureRef.current = {
        pointerId: evt.pointerId,
        startX: evt.clientX,
        startY: evt.clientY,
        startScrollLeft: viewport.scrollLeft,
        startScrollTop: viewport.scrollTop,
        pointerType: evt.pointerType,
        triggered: false,
      };
      evt.currentTarget.setPointerCapture?.(evt.pointerId);
    };

    const handlePointerMove: PointerEventHandler<HTMLDivElement> = (evt) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== evt.pointerId) return;

      if (panAvailable && gesture.pointerType !== 'mouse') {
        const viewport = scrollRef.current;
        if (!viewport) return;

        evt.preventDefault();
        viewport.scrollLeft = gesture.startScrollLeft - (evt.clientX - gesture.startX);
        viewport.scrollTop = gesture.startScrollTop - (evt.clientY - gesture.startY);
        return;
      }

      if (gesture.triggered) return;

      const deltaX = evt.clientX - gesture.startX;
      const deltaY = evt.clientY - gesture.startY;
      if (Math.abs(deltaY) > PAGE_SWIPE_VERTICAL_TOLERANCE) return;
      if (Math.abs(deltaX) < PAGE_SWIPE_THRESHOLD) return;

      if (deltaX < 0) {
        if (canNext) goNext();
      } else if (canPrev) {
        goPrev();
      }

      gesture.triggered = true;
      evt.currentTarget.releasePointerCapture?.(evt.pointerId);
      clearGesture();
    };

    const handlePointerUp: PointerEventHandler<HTMLDivElement> = (evt) => {
      if (gestureRef.current?.pointerId !== evt.pointerId) return;
      evt.currentTarget.releasePointerCapture?.(evt.pointerId);
      clearGesture();
    };

    const handlePointerCancel: PointerEventHandler<HTMLDivElement> = (evt) => {
      if (gestureRef.current?.pointerId !== evt.pointerId) return;
      clearGesture();
    };

    return (
      <Box className={classNames(css.PdfViewer, className)} direction="Column" {...props} ref={ref}>
        <Header className={css.PdfViewerHeader} size="400">
          <Box grow="Yes" alignItems="Center" gap="200">
            <IconButton size="300" radii="300" onClick={requestClose}>
              <Icon size="50" src={Icons.ArrowLeft} />
            </IconButton>
            <Text size="T300" truncate>
              {name}
            </Text>
          </Box>
          <Box shrink="No" alignItems="Center" gap="200" style={{ flexWrap: 'wrap' }}>
            {docState.status === AsyncStatus.Success && (
              <IconButton
                variant="SurfaceVariant"
                size="300"
                radii="Pill"
                onClick={goPrev}
                disabled={!canPrev}
                aria-label="\u4e0a\u4e00\u9875"
              >
                <Icon size="50" src={Icons.ArrowLeft} />
              </IconButton>
            )}

            <IconButton
              variant={zoom < 1 ? 'Success' : 'SurfaceVariant'}
              outlined={zoom < 1}
              size="300"
              radii="Pill"
              onClick={zoomOut}
              aria-label="\u7f29\u5c0f"
            >
              <Icon size="50" src={Icons.Minus} />
            </IconButton>

            <Chip variant="SurfaceVariant" radii="Pill" onClick={() => setZoom(1)}>
              <Text size="B300">{Math.round(zoom * 100)}%</Text>
            </Chip>

            <IconButton
              variant={zoom > 1 ? 'Success' : 'SurfaceVariant'}
              outlined={zoom > 1}
              size="300"
              radii="Pill"
              onClick={zoomIn}
              aria-label="\u653e\u5927"
            >
              <Icon size="50" src={Icons.Plus} />
            </IconButton>

            {docState.status === AsyncStatus.Success && (
              <PopOut
                anchor={jumpAnchor}
                align="Center"
                position="Top"
                content={
                  <FocusTrap
                    focusTrapOptions={{
                      initialFocus: false,
                      onDeactivate: () => setJumpAnchor(undefined),
                      clickOutsideDeactivates: true,
                      escapeDeactivates: stopPropagation,
                    }}
                  >
                    <Menu variant="Surface">
                      <Box
                        as="form"
                        onSubmit={handleJumpSubmit}
                        style={{ padding: config.space.S200 }}
                        direction="Column"
                        gap="200"
                      >
                        <Input
                          name="jumpInput"
                          size="300"
                          variant="Background"
                          defaultValue={pageNo}
                          min={1}
                          max={docState.data.numPages}
                          step={1}
                          outlined
                          type="number"
                          radii="300"
                          aria-label="\u9875\u7801"
                        />
                        <Button type="submit" size="300" variant="Primary" radii="300">
                          <Text size="B300">{'\u8df3\u8f6c\u9875\u7801'}</Text>
                        </Button>
                      </Box>
                    </Menu>
                  </FocusTrap>
                }
              >
                <Chip
                  onClick={handleOpenJump}
                  variant="SurfaceVariant"
                  radii="300"
                  aria-pressed={jumpAnchor !== undefined}
                >
                  <Text size="B300">{`${pageNo}/${docState.data.numPages}`}</Text>
                </Chip>
              </PopOut>
            )}

            {docState.status === AsyncStatus.Success && (
              <IconButton
                variant="SurfaceVariant"
                size="300"
                radii="Pill"
                onClick={goNext}
                disabled={!canNext}
                aria-label="\u4e0b\u4e00\u9875"
              >
                <Icon size="50" src={Icons.ArrowRight} />
              </IconButton>
            )}

            <Chip
              variant="Primary"
              onClick={handleDownload}
              radii="300"
              before={<Icon size="50" src={Icons.Download} />}
            >
              <Text size="B300">{'\u4e0b\u8f7d'}</Text>
            </Chip>
          </Box>
        </Header>

        <Box
          className={css.PdfViewerBody}
          direction="Column"
          grow="Yes"
          style={{ minHeight: 0 }}
        >
          {isLoading && (
            <Box
              className={css.PdfViewerState}
              grow="Yes"
              alignItems="Center"
              justifyContent="Center"
              direction="Column"
              gap="200"
            >
              <Spinner variant="Secondary" size="600" />
              <Text size="T300">{'\u6b63\u5728\u52a0\u8f7d\u6587\u6863\u9884\u89c8...'}</Text>
            </Box>
          )}

          {isError && (
            <Box
              className={css.PdfViewerState}
              grow="Yes"
              alignItems="Center"
              justifyContent="Center"
              direction="Column"
              gap="200"
            >
              <Text>{'\u6587\u6863\u9884\u89c8\u52a0\u8f7d\u5931\u8d25\u3002'}</Text>
              <Button
                variant="Critical"
                fill="Soft"
                size="300"
                radii="300"
                before={<Icon src={Icons.Warning} size="50" />}
                onClick={handleRetry}
              >
                <Text size="B300">{'\u91cd\u8bd5'}</Text>
              </Button>
            </Box>
          )}

          {docState.status === AsyncStatus.Success && (
            <Box className={css.PdfViewerStage} grow="Yes" style={{ minHeight: 0 }}>
              <IconButton
                className={classNames(css.NavButton, css.NavButtonLeft)}
                variant="SurfaceVariant"
                size="400"
                radii="Pill"
                onClick={goPrev}
                disabled={!canPrev}
                aria-label="\u4e0a\u4e00\u9875"
              >
                <Icon size="100" src={Icons.ArrowLeft} />
              </IconButton>

              <Scroll
                ref={scrollRef}
                className={css.PdfViewerViewport}
                size="300"
                direction="Both"
                variant="Surface"
                visibility="Hover"
                onWheel={handleWheel}
              >
                <Box
                  className={css.PdfViewerCanvasShell}
                  onMouseDown={handleMouseDragStart}
                  alignItems="Center"
                  justifyContent="Center"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerCancel}
                  style={{ cursor: panAvailable ? cursor : 'default' }}
                >
                  <div
                    className={css.PdfViewerContent}
                    ref={containerRef}
                  />
                </Box>
              </Scroll>

              <IconButton
                className={classNames(css.NavButton, css.NavButtonRight)}
                variant="SurfaceVariant"
                size="400"
                radii="Pill"
                onClick={goNext}
                disabled={!canNext}
                aria-label="\u4e0b\u4e00\u9875"
              >
                <Icon size="100" src={Icons.ArrowRight} />
              </IconButton>
            </Box>
          )}
        </Box>
      </Box>
    );
  }
);
