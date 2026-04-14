import React, { useCallback, useEffect, useMemo, useState } from 'react';
import classNames from 'classnames';
import FileSaver from 'file-saver';
import { Box, Button, Chip, Header, Icon, IconButton, Icons, Scroll, Spinner, Text, as } from 'folds';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { useXLSXLoader } from '../../plugins/xlsx';
import * as css from './SpreadsheetViewer.css';

const extractSheetHtml = (html: string): string => {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

  return bodyMatch ? bodyMatch[1] : html;
};

const getErrorMessage = (error: unknown): string | undefined => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;

  return undefined;
};

type SpreadsheetViewerProps = {
  name: string;
  data: ArrayBuffer;
  mimeType: string;
  requestClose: () => void;
};

export const SpreadsheetViewer = as<'div', SpreadsheetViewerProps>(
  ({ className, name, data, mimeType, requestClose, ...props }, ref) => {
    const [xlsxState, loadXlsx] = useXLSXLoader();
    const [activeSheetName, setActiveSheetName] = useState<string>();

    const [workbookState, loadWorkbook] = useAsyncCallback(
      useCallback(async () => {
        if (xlsxState.status !== AsyncStatus.Success) {
          throw new Error('Spreadsheet preview engine is not loaded');
        }

        return xlsxState.data.read(data, {
          type: 'array',
          dense: true,
          cellDates: true,
          raw: false,
          cellHTML: true,
          cellStyles: true,
          cellNF: true,
        });
      }, [data, xlsxState])
    );

    useEffect(() => {
      loadXlsx().catch(() => undefined);
    }, [loadXlsx]);

    useEffect(() => {
      if (xlsxState.status === AsyncStatus.Success) {
        loadWorkbook().catch(() => undefined);
      }
    }, [xlsxState, loadWorkbook]);

    useEffect(() => {
      if (workbookState.status !== AsyncStatus.Success) return;

      setActiveSheetName((currentSheetName) => {
        if (currentSheetName && workbookState.data.SheetNames.includes(currentSheetName)) {
          return currentSheetName;
        }

        return workbookState.data.SheetNames[0];
      });
    }, [workbookState]);

    const sheetPreview = useMemo(() => {
      if (
        xlsxState.status !== AsyncStatus.Success ||
        workbookState.status !== AsyncStatus.Success ||
        !activeSheetName
      ) {
        return undefined;
      }

      const sheet = workbookState.data.Sheets[activeSheetName];
      if (!sheet) {
        return {
          html: '',
          totalRows: 0,
          totalCols: 0,
          isEmpty: true,
        };
      }

      const rawRows = xlsxState.data.utils.sheet_to_json(sheet, {
        header: 1,
        raw: false,
        defval: '',
      }) as unknown[][];
      const totalCols = rawRows.reduce((max, row) => Math.max(max, row.length), 0);
      const html = extractSheetHtml(xlsxState.data.utils.sheet_to_html(sheet));

      return {
        html,
        totalRows: rawRows.length,
        totalCols,
        isEmpty: rawRows.length === 0 || totalCols === 0,
      };
    }, [activeSheetName, workbookState, xlsxState]);

    const isLoading =
      xlsxState.status === AsyncStatus.Loading || workbookState.status === AsyncStatus.Loading;
    const isError =
      xlsxState.status === AsyncStatus.Error || workbookState.status === AsyncStatus.Error;
    const errorMessage = useMemo(() => {
      if (xlsxState.status === AsyncStatus.Error) {
        return getErrorMessage(xlsxState.error);
      }

      if (workbookState.status === AsyncStatus.Error) {
        return getErrorMessage(workbookState.error);
      }

      return undefined;
    }, [workbookState, xlsxState]);

    const handleRetry = () => {
      if (xlsxState.status === AsyncStatus.Error) {
        loadXlsx().catch(() => undefined);
        return;
      }

      loadWorkbook().catch(() => undefined);
    };

    const handleDownload = () => {
      FileSaver.saveAs(new Blob([data], { type: mimeType }), name);
    };

    const summaryText =
      workbookState.status === AsyncStatus.Success && sheetPreview
        ? [
            `${workbookState.data.SheetNames.length} sheet(s)`,
            `${sheetPreview.totalRows} row(s)`,
            `${sheetPreview.totalCols} column(s)`,
          ].join(' | ')
        : undefined;

    return (
      <Box
        className={classNames(css.SpreadsheetViewer, className)}
        direction="Column"
        {...props}
        ref={ref}
      >
        <Header className={css.SpreadsheetViewerHeader} size="400">
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

        <Box grow="Yes" className={css.SpreadsheetViewerContent} direction="Column">
          {isLoading && (
            <Box
              className={css.SpreadsheetViewerState}
              direction="Column"
              gap="200"
              alignItems="Center"
              justifyContent="Center"
            >
              <Spinner variant="Secondary" size="600" />
              <Text size="T300">Loading spreadsheet...</Text>
            </Box>
          )}

          {isError && (
            <Box
              className={css.SpreadsheetViewerState}
              direction="Column"
              gap="300"
              alignItems="Center"
              justifyContent="Center"
            >
              <Text size="T300">Failed to load spreadsheet preview.</Text>
              {errorMessage && (
                <Text className={css.ErrorMessage} size="T200" priority="300">
                  {errorMessage}
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
                <Text size="B300">Retry</Text>
              </Button>
            </Box>
          )}

          {!isLoading && !isError && workbookState.status === AsyncStatus.Success && sheetPreview && (
            <>
              <Box className={css.SheetRail} direction="Column">
                <div className={css.SheetList}>
                  {workbookState.data.SheetNames.map((sheetName) => (
                    <Chip
                      key={sheetName}
                      variant={sheetName === activeSheetName ? 'Primary' : 'SurfaceVariant'}
                      fill={sheetName === activeSheetName ? 'Solid' : 'Soft'}
                      radii="Pill"
                      onClick={() => setActiveSheetName(sheetName)}
                    >
                      <Text size="B300" truncate>
                        {sheetName}
                      </Text>
                    </Chip>
                  ))}
                </div>
                {summaryText && (
                  <Text className={css.SheetSummary} size="T200" priority="300">
                    {summaryText}
                  </Text>
                )}
              </Box>

              <Box grow="Yes">
                <Scroll size="300" direction="Both" variant="Background" visibility="Hover">
                  <div className={css.SheetPreview}>
                    {sheetPreview.isEmpty ? (
                      <div className={css.EmptySheet}>
                        <Text size="T300" priority="300">
                          This sheet is empty.
                        </Text>
                      </div>
                    ) : (
                      <div
                        className={css.SheetPreviewInner}
                        dangerouslySetInnerHTML={{ __html: sheetPreview.html }}
                      />
                    )}
                  </div>
                </Scroll>
              </Box>
            </>
          )}
        </Box>
      </Box>
    );
  }
);
