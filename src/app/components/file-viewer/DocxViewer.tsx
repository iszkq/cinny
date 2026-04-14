import React, { useCallback, useEffect, useRef } from 'react';
import classNames from 'classnames';
import FileSaver from 'file-saver';
import { Box, Button, Chip, Header, Icon, IconButton, Icons, Scroll, Spinner, Text, as } from 'folds';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { useDocxPreviewLoader } from '../../plugins/docx-preview';
import * as css from './DocxViewer.css';

export type DocxViewerProps = {
  name: string;
  data: Blob;
  mimeType: string;
  requestClose: () => void;
};

export const DocxViewer = as<'div', DocxViewerProps>(
  ({ className, name, data, mimeType, requestClose, ...props }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [docxPreviewState, loadDocxPreview] = useDocxPreviewLoader();

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

    useEffect(
      () => () => {
        if (containerRef.current) {
          containerRef.current.innerHTML = '';
        }
      },
      []
    );

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
          grow="Yes"
          className={css.DocxViewerContent}
          justifyContent={isLoading || isError ? 'Center' : undefined}
          alignItems={isLoading || isError ? 'Center' : undefined}
        >
          {isLoading && (
            <Box className={css.DocxViewerState} direction="Column" gap="200" alignItems="Center">
              <Spinner variant="Secondary" size="600" />
              <Text size="T300">Loading DOCX preview...</Text>
            </Box>
          )}

          {isError && (
            <Box className={css.DocxViewerState} direction="Column" gap="300" alignItems="Center">
              <Text size="T300">Failed to load DOCX preview.</Text>
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

          {!isLoading && !isError && (
            <Scroll hideTrack variant="Background" visibility="Hover">
              <div className={css.DocxViewport}>
                <div
                  className={css.DocxContainer}
                  ref={containerRef}
                  data-mime-type={mimeType}
                />
              </div>
            </Scroll>
          )}
        </Box>
      </Box>
    );
  }
);
