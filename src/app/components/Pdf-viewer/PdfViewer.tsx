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
              <Scroll
                ref={scrollRef}
                className={css.PdfViewerViewport}
                size="300"
                direction="Both"
                variant="Surface"
                visibility="Hover"
                onWheel={handleWheel}
              >
                <Box className={css.PdfViewerCanvasShell} alignItems="Center" justifyContent="Center">
                  <div
                    className={css.PdfViewerContent}
                    ref={containerRef}
                  />
                </Box>
              </Scroll>
            </Box>
          )}
        </Box>
      </Box>
    );
  }
);
