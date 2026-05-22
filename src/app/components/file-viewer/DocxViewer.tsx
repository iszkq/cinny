import React, { useCallback, useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import { Box, Button, Chip, Header, Icon, IconButton, Icons, Scroll, Spinner, Text, as } from 'folds';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { useDocxPreviewLoader } from '../../plugins/docx-preview';
import { useMammothLoader } from '../../plugins/mammoth';
import { useZoom } from '../../hooks/useZoom';
import { getFileNameExt } from '../../utils/mimeTypes';
import * as css from './DocxViewer.css';
import { saveDownloadedFile } from '../../utils/saveDownloadedFile';

export type DocxViewerProps = {
  name: string;
  data: ArrayBuffer;
  mimeType: string;
  requestClose: () => void;
};

const ZOOM_STEP = 0.2;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const ZIP_FILE_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const OOXML_WORD_EXTS = new Set(['docx', 'docm', 'dotx', 'dotm']);

const getErrorMessage = (error: unknown): string | undefined => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;

  return undefined;
};

const getWordPreviewDisplayError = (name: string, message?: string): string | undefined => {
  const ext = getFileNameExt(name);
  if (
    ext === 'doc' ||
    /legacy doc/i.test(message ?? '') ||
    /not a zip file|central directory|end of central directory/i.test(message ?? '')
  ) {
    return '\u5f53\u524d\u4ec5\u652f\u6301 docx\u3001docm\u3001dotx\u3001dotm \u5728\u7ebf\u9884\u89c8\uff0c\u65e7\u7248 .doc \u8bf7\u4e0b\u8f7d\u540e\u4f7f\u7528\u672c\u5730\u529e\u516c\u8f6f\u4ef6\u6253\u5f00\u3002';
  }
  if (/preview engine is not loaded/i.test(message ?? '')) {
    return '\u6587\u7a3f\u9884\u89c8\u5f15\u64ce\u5c1a\u672a\u52a0\u8f7d\u5b8c\u6210\u3002';
  }

  return '\u6587\u7a3f\u9884\u89c8\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5\u6216\u4e0b\u8f7d\u540e\u67e5\u770b\u3002';
};

const hasRenderableWordHtml = (html: string): boolean => {
  const plainText = html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim();

  return plainText.length > 0 || /<(img|table|svg|ol|ul)\b/i.test(html);
};

const hasBinarySignature = (buffer: ArrayBuffer, signature: number[]): boolean => {
  if (buffer.byteLength < signature.length) {
    return false;
  }

  const view = new Uint8Array(buffer, 0, signature.length);
  return signature.every((byte, index) => view[index] === byte);
};

const isLegacyDocFile = (name: string, mimeType: string, buffer: ArrayBuffer): boolean => {
  const ext = getFileNameExt(name);

  if (OOXML_WORD_EXTS.has(ext)) {
    return false;
  }

  if (ext === 'doc') {
    return true;
  }

  return (
    mimeType.toLowerCase() === 'application/msword' &&
    !hasBinarySignature(buffer, ZIP_FILE_SIGNATURE)
  );
};

const waitForNextPaint = () =>
  new Promise<void>((resolve) => {
    if (typeof window === 'undefined') {
      resolve();
      return;
    }

    window.requestAnimationFrame(() => resolve());
  });

export const DocxViewer = as<'div', DocxViewerProps>(
  ({ className, name, data, mimeType, requestClose, ...props }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const pageElementsRef = useRef<HTMLElement[]>([]);
    const [docxPreviewState, loadDocxPreview] = useDocxPreviewLoader();
    const [mammothState, loadMammoth] = useMammothLoader();
    const { zoom, zoomIn, zoomOut, setZoom } = useZoom(ZOOM_STEP, MIN_ZOOM, MAX_ZOOM);
    const [pageNo, setPageNo] = useState(1);
    const [pageCount, setPageCount] = useState(1);

    const [renderState, renderDocument] = useAsyncCallback(
      useCallback(async () => {
        const container = containerRef.current;
        if (!container) return;

        if (isLegacyDocFile(name, mimeType, data)) {
          throw new Error('Legacy DOC preview is not supported');
        }

        const renderWithMammoth = async () => {
          const mammoth =
            mammothState.status === AsyncStatus.Success ? mammothState.data : await loadMammoth();

          const result = await mammoth.convertToHtml(
            { arrayBuffer: data },
            {
              includeDefaultStyleMap: true,
            }
          );

          if (!hasRenderableWordHtml(result.value)) {
            throw new Error('DOCX preview rendered empty content');
          }

          container.innerHTML = `<div class="cinny-docx-fallback">${result.value}</div>`;
          pageElementsRef.current = [container];
          setPageCount(1);
          setPageNo(1);
          scrollRef.current?.scrollTo({ top: 0, left: 0 });
        };

        container.innerHTML = '';
        try {
          await renderWithMammoth();
          return;
        } catch {
          container.innerHTML = '';
        }

        try {
          if (docxPreviewState.status !== AsyncStatus.Success) {
            throw new Error('DOCX preview engine is not loaded');
          }

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
          await waitForNextPaint();

          const pages = Array.from(
            container.querySelectorAll('.docx-wrapper > .docx, .docx')
          ).filter((page, index, allPages) => allPages.indexOf(page) === index) as HTMLElement[];

          const hasRenderableContent =
            pages.length > 0 ||
            hasRenderableWordHtml(container.innerHTML) ||
            Boolean(container.querySelector('table, img, svg, canvas'));

          if (!hasRenderableContent) {
            await renderWithMammoth();
            return;
          }

          pageElementsRef.current = pages.length > 0 ? pages : [container];
          setPageCount(Math.max(pages.length, 1));
          setPageNo(1);
          scrollRef.current?.scrollTo({ top: 0, left: 0 });
        } catch (error) {
          throw error;
        }
      }, [data, docxPreviewState, loadMammoth, mammothState, mimeType, name])
    );

    useEffect(() => {
      loadDocxPreview().catch(() => undefined);
    }, [loadDocxPreview]);

    useEffect(() => {
      loadMammoth().catch(() => undefined);
    }, [loadMammoth]);

    useEffect(() => {
      if (
        docxPreviewState.status === AsyncStatus.Success ||
        docxPreviewState.status === AsyncStatus.Error
      ) {
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
      renderState.status === AsyncStatus.Loading ||
      (renderState.status === AsyncStatus.Idle && docxPreviewState.status === AsyncStatus.Loading);
    const isError =
      renderState.status === AsyncStatus.Error ||
      (renderState.status === AsyncStatus.Idle && docxPreviewState.status === AsyncStatus.Error);
    const errorMessage =
      renderState.status === AsyncStatus.Error
        ? getErrorMessage(renderState.error)
        : docxPreviewState.status === AsyncStatus.Error
        ? getErrorMessage(docxPreviewState.error)
        : undefined;

    const handleRetry = () => {
      if (docxPreviewState.status === AsyncStatus.Error) {
        loadDocxPreview().catch(() => undefined);
        return;
      }

      renderDocument().catch(() => undefined);
    };

    const handleDownload = async () => {
      await saveDownloadedFile(new Blob([data], { type: mimeType }), name);
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
              {getWordPreviewDisplayError(name, errorMessage) && (
                <Text size="T200" priority="300" style={{ textAlign: 'center', lineHeight: '1.45' }}>
                  {getWordPreviewDisplayError(name, errorMessage)}
                </Text>
              )}
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
