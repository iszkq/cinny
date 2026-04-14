/* eslint-disable no-param-reassign */
import React, { FormEventHandler, MouseEventHandler, WheelEventHandler, useEffect, useRef, useState } from 'react';
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
import FileSaver from 'file-saver';
import * as css from './PdfViewer.css';
import { AsyncStatus } from '../../hooks/useAsyncCallback';
import { useZoom } from '../../hooks/useZoom';
import { useDragScroll } from '../../hooks/useDragScroll';
import { createPage, usePdfDocumentLoader, usePdfJSLoader } from '../../plugins/pdfjs-dist';
import { stopPropagation } from '../../utils/keyboard';

export type PdfViewerProps = {
  name: string;
  src: string;
  requestClose: () => void;
};

const ZOOM_STEP = 0.2;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;

export const PdfViewer = as<'div', PdfViewerProps>(
  ({ className, name, src, requestClose, ...props }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const { zoom, zoomIn, zoomOut, setZoom } = useZoom(ZOOM_STEP, MIN_ZOOM, MAX_ZOOM);
    const [rotation, setRotation] = useState(0);

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
    const { cursor, onMouseDown } = useDragScroll(
      scrollRef,
      docState.status === AsyncStatus.Success,
      `${src}-${pageNo}-${rotation}`
    );

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
      setRotation(0);
      setPageNo(1);
    }, [setZoom, src]);

    useEffect(() => {
      if (docState.status !== AsyncStatus.Success) return undefined;

      const doc = docState.data;
      if (pageNo < 1 || pageNo > doc.numPages) return undefined;

      let cancelled = false;

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
        })
        .catch(() => undefined);

      return () => {
        cancelled = true;
      };
    }, [docState, pageNo, zoom]);

    const handleDownload = () => {
      FileSaver.saveAs(src, name);
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
      setPageNo(Math.max(1, Math.min(docState.data.numPages, jumpTo)));
      setJumpAnchor(undefined);
    };

    const handlePrevPage = () => {
      setPageNo((n) => Math.max(n - 1, 1));
    };

    const handleNextPage = () => {
      if (docState.status !== AsyncStatus.Success) return;
      setPageNo((n) => Math.min(n + 1, docState.data.numPages));
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

    const rotateLeft = () => setRotation((angle) => angle - 90);
    const rotateRight = () => setRotation((angle) => angle + 90);
    const displayRotation = ((rotation % 360) + 360) % 360;

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
            <IconButton
              variant={zoom < 1 ? 'Success' : 'SurfaceVariant'}
              outlined={zoom < 1}
              size="300"
              radii="Pill"
              onClick={zoomOut}
              aria-label="Zoom Out"
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
              aria-label="Zoom In"
            >
              <Icon size="50" src={Icons.Plus} />
            </IconButton>

            <Chip variant="SurfaceVariant" radii="Pill" onClick={rotateLeft}>
              <Text size="B300">Left</Text>
            </Chip>

            <Chip
              variant={displayRotation !== 0 ? 'Success' : 'SurfaceVariant'}
              radii="Pill"
              onClick={() => setRotation(0)}
            >
              <Text size="B300">{`${displayRotation}deg`}</Text>
            </Chip>

            <Chip variant="SurfaceVariant" radii="Pill" onClick={rotateRight}>
              <Text size="B300">Right</Text>
            </Chip>

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
                          aria-label="Page Number"
                        />
                        <Button type="submit" size="300" variant="Primary" radii="300">
                          <Text size="B300">Jump To Page</Text>
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

            <Chip
              variant="Primary"
              onClick={handleDownload}
              radii="300"
              before={<Icon size="50" src={Icons.Download} />}
            >
              <Text size="B300">Download</Text>
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
            <Box grow="Yes" alignItems="Center" justifyContent="Center">
              <Spinner variant="Secondary" size="600" />
            </Box>
          )}

          {isError && (
            <Box grow="Yes" alignItems="Center" justifyContent="Center" direction="Column" gap="200">
              <Text>Failed to load PDF</Text>
              <Button
                variant="Critical"
                fill="Soft"
                size="300"
                radii="300"
                before={<Icon src={Icons.Warning} size="50" />}
                onClick={handleRetry}
              >
                <Text size="B300">Retry</Text>
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
                onClick={handlePrevPage}
                disabled={pageNo <= 1}
                aria-label="Previous Page"
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
                onMouseDown={onMouseDown}
                style={{ cursor }}
              >
                <Box className={css.PdfViewerCanvasShell} alignItems="Center" justifyContent="Center">
                  <div
                    className={css.PdfViewerContent}
                    ref={containerRef}
                    style={{
                      transform: `rotate(${rotation}deg)`,
                      transformOrigin: 'center top',
                      transition: cursor === 'grabbing' ? 'none' : 'transform 140ms ease',
                    }}
                  />
                </Box>
              </Scroll>

              <IconButton
                className={classNames(css.NavButton, css.NavButtonRight)}
                variant="SurfaceVariant"
                size="400"
                radii="Pill"
                onClick={handleNextPage}
                disabled={pageNo >= docState.data.numPages}
                aria-label="Next Page"
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
