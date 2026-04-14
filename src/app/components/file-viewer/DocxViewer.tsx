import React, { useCallback, useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import FileSaver from 'file-saver';
import { Box, Button, Chip, Header, Icon, IconButton, Icons, Scroll, Spinner, Text, as } from 'folds';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { useDocxPreviewLoader } from '../../plugins/docx-preview';
import { useZoom } from '../../hooks/useZoom';
import * as css from './DocxViewer.css';

export type DocxViewerProps = {
  name: string;
  data: Blob;
  mimeType: string;
  requestClose: () => void;
};

const ZOOM_STEP = 0.2;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;

export const DocxViewer = as<'div', DocxViewerProps>(
  ({ className, name, data, mimeType, requestClose, ...props }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const pageElementsRef = useRef<HTMLElement[]>([]);
    const [docxPreviewState, loadDocxPreview] = useDocxPreviewLoader();
    const { zoom, zoomIn, zoomOut, setZoom } = useZoom(ZOOM_STEP, MIN_ZOOM, MAX_ZOOM);
    const [pageNo, setPageNo] = useState(1);
    const [pageCount, setPageCount] = useState(1);

    const [renderState, renderDocument] = useAsyncCallback(
      useCallback(async () => {
        if (docxPreviewState.status !== AsyncStatus.Success) {
          throw new Error('DOCX preview engine is not loaded');
        }

        const container = containerRef.current;
        if (!container) return;

        container.innerHTML = '';
        await docxPreviewState.data.renderAsync(data, container, undefined, {
          className: 'cinny-docx-preview',
          inWrapper: true,
          breakPages: true,
          ignoreWidth: false,
          ignoreHeight: false,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          useBase64URL: true,
        });

        const pages = Array.from(
          container.querySelectorAll('.docx-wrapper > .docx, .docx')
        ).filter((page, index, allPages) => allPages.indexOf(page) === index) as HTMLElement[];

        pageElementsRef.current = pages.length > 0 ? pages : [container];
        setPageCount(Math.max(pages.length, 1));
        setPageNo(1);
        scrollRef.current?.scrollTo({ top: 0, left: 0 });
      }, [data, docxPreviewState])
    );

    useEffect(() => {
      loadDocxPreview().catch(() => undefined);
    }, [loadDocxPreview]);

    useEffect(() => {
      if (docxPreviewState.status === AsyncStatus.Success) {
        renderDocument().catch(() => undefined);
      }
    }, [docxPreviewState, renderDocument]);

    useEffect(() => {
      setZoom(1);
      setPageNo(1);
    }, [data, name, setZoom]);

    useEffect(
      () => () => {
        if (containerRef.current) {
          containerRef.current.innerHTML = '';
        }
      },
      []
    );

    useEffect(() => {
      const viewport = scrollRef.current;
      if (!viewport || pageCount <= 1) return undefined;

      const handleScroll = () => {
        const viewportCenter = viewport.scrollTop + viewport.clientHeight / 2;
        let nextPage = 1;
        let nextDistance = Number.POSITIVE_INFINITY;

        pageElementsRef.current.forEach((page, index) => {
          const pageCenter = page.offsetTop + page.offsetHeight / 2;
          const distance = Math.abs(pageCenter - viewportCenter);

          if (distance < nextDistance) {
            nextDistance = distance;
            nextPage = index + 1;
          }
        });

        setPageNo(nextPage);
      };

      viewport.addEventListener('scroll', handleScroll, { passive: true });
      return () => viewport.removeEventListener('scroll', handleScroll);
    }, [pageCount]);

    const isLoading =
      docxPreviewState.status === AsyncStatus.Loading || renderState.status === AsyncStatus.Loading;
    const isError =
      docxPreviewState.status === AsyncStatus.Error || renderState.status === AsyncStatus.Error;

    const handleRetry = () => {
      if (docxPreviewState.status === AsyncStatus.Error) {
        loadDocxPreview().catch(() => undefined);
        return;
      }

      renderDocument().catch(() => undefined);
    };

    const handleDownload = () => {
      FileSaver.saveAs(data, name);
    };

    const handleWheel: React.WheelEventHandler<HTMLDivElement> = (evt) => {
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
      <Box className={classNames(css.DocxViewer, className)} direction="Column" {...props} ref={ref}>
        <Header className={css.DocxViewerHeader} size="400">
          <Box grow="Yes" alignItems="Center" gap="200">
            <IconButton size="300" radii="300" onClick={requestClose}>
              <Icon size="50" src={Icons.ArrowLeft} />
            </IconButton>
            <Text size="T300" truncate title={name}>
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

            <Chip variant="SurfaceVariant" radii="Pill">
              <Text size="B300">{`${pageNo}/${pageCount}`}</Text>
            </Chip>

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
          grow="Yes"
          className={css.DocxViewerBody}
          justifyContent={isLoading || isError ? 'Center' : undefined}
          alignItems={isLoading || isError ? 'Center' : undefined}
          style={{ minHeight: 0 }}
        >
          {isLoading && (
            <Box className={css.DocxViewerState} direction="Column" gap="200" alignItems="Center">
              <Spinner variant="Secondary" size="600" />
              <Text size="T300">{'\u6b63\u5728\u52a0\u8f7d\u6587\u7a3f\u9884\u89c8...'}</Text>
            </Box>
          )}

          {isError && (
            <Box className={css.DocxViewerState} direction="Column" gap="300" alignItems="Center">
              <Text size="T300">{'\u6587\u7a3f\u9884\u89c8\u52a0\u8f7d\u5931\u8d25\u3002'}</Text>
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

          {!isLoading && !isError && (
            <Box className={css.DocxViewerStage} grow="Yes" style={{ minHeight: 0 }}>
              <Scroll
                ref={scrollRef}
                className={css.DocxViewerViewport}
                direction="Both"
                hideTrack
                variant="Background"
                visibility="Hover"
                onWheel={handleWheel}
              >
                <div className={css.DocxViewport}>
                  <div className={css.DocxCanvasShell} style={{ zoom }}>
                    <div className={css.DocxContainer} ref={containerRef} data-mime-type={mimeType} />
                  </div>
                </div>
              </Scroll>
            </Box>
          )}
        </Box>
      </Box>
    );
  }
);
