import React, {
  CSSProperties,
  FormEventHandler,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import classNames from 'classnames';
import FileSaver from 'file-saver';
import { Box, Button, Chip, Header, Icon, IconButton, Icons, Scroll, Spinner, Text, as } from 'folds';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import {
  XLSXCell,
  XLSXColInfo,
  XLSXRange,
  XLSXRowInfo,
  XLSXWorksheet,
  useXLSXLoader,
} from '../../plugins/xlsx';
import { PasswordInput } from '../password-input';
import { getFileNameExt } from '../../utils/mimeTypes';
import { useZoom } from '../../hooks/useZoom';
import * as css from './SpreadsheetViewer.css';

const MODERN_ENCRYPTED_EXTS = new Set(['xlsx', 'xlsm', 'xlsb', 'xlam']);
const ZOOM_STEP = 0.2;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;

type RenderedCell = {
  key: string;
  colSpan: number;
  rowSpan: number;
  style: CSSProperties;
  text: string;
  html?: string;
  title?: string;
};

type RenderedRow = {
  key: string;
  height?: string;
  cells: RenderedCell[];
};

type RenderedSheet = {
  rows: RenderedRow[];
  colWidths: Array<string | undefined>;
  totalRows: number;
  totalCols: number;
  isEmpty: boolean;
};

const isCellObject = (value: unknown): value is XLSXCell =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stripHtml = (value: string): string =>
  value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();

const normalizeExcelColor = (value?: string): string | undefined => {
  if (!value) return undefined;

  const normalized = value.replace(/^#/, '').trim();
  if (/^[0-9a-f]{8}$/i.test(normalized)) {
    return `#${normalized.slice(2)}`;
  }

  if (/^[0-9a-f]{6}$/i.test(normalized) || /^[0-9a-f]{3}$/i.test(normalized)) {
    return `#${normalized}`;
  }

  return undefined;
};

const getBorderStyle = (style?: string): string | undefined => {
  if (!style) return undefined;
  if (style === 'dotted') return 'dotted';
  if (style === 'dashed') return 'dashed';
  if (style.includes('double')) return 'double';

  return 'solid';
};

const getCellStyle = (cell?: XLSXCell): CSSProperties => {
  const style: CSSProperties = {};
  const cellStyle = cell?.s;

  if (!cellStyle) {
    return style;
  }

  const { alignment, font, fill, border } = cellStyle;

  if (alignment?.horizontal) {
    if (alignment.horizontal === 'center' || alignment.horizontal === 'centerContinuous') {
      style.textAlign = 'center';
    } else if (alignment.horizontal === 'right') {
      style.textAlign = 'right';
    } else if (alignment.horizontal === 'justify') {
      style.textAlign = 'justify';
    } else {
      style.textAlign = 'left';
    }
  }

  if (alignment?.vertical) {
    if (alignment.vertical === 'center') {
      style.verticalAlign = 'middle';
    } else if (alignment.vertical === 'bottom') {
      style.verticalAlign = 'bottom';
    } else {
      style.verticalAlign = 'top';
    }
  }

  if (alignment?.wrapText === false) {
    style.whiteSpace = 'nowrap';
  }

  if (font?.sz) {
    style.fontSize = `${font.sz}pt`;
  }

  if (font?.name) {
    style.fontFamily = font.name;
  }

  if (font?.bold) {
    style.fontWeight = 700;
  }

  if (font?.italic) {
    style.fontStyle = 'italic';
  }

  if (font?.underline) {
    style.textDecoration = 'underline';
  }

  const textColor = normalizeExcelColor(font?.color?.rgb);
  if (textColor) {
    style.color = textColor;
  }

  const fillColor = normalizeExcelColor(fill?.fgColor?.rgb);
  if (fillColor && fill?.patternType !== 'none') {
    style.backgroundColor = fillColor;
  }

  const topBorderColor = normalizeExcelColor(border?.top?.color?.rgb);
  const rightBorderColor = normalizeExcelColor(border?.right?.color?.rgb);
  const bottomBorderColor = normalizeExcelColor(border?.bottom?.color?.rgb);
  const leftBorderColor = normalizeExcelColor(border?.left?.color?.rgb);

  if (border?.top?.style) {
    style.borderTopStyle = getBorderStyle(border.top.style);
    if (topBorderColor) style.borderTopColor = topBorderColor;
  }

  if (border?.right?.style) {
    style.borderRightStyle = getBorderStyle(border.right.style);
    if (rightBorderColor) style.borderRightColor = rightBorderColor;
  }

  if (border?.bottom?.style) {
    style.borderBottomStyle = getBorderStyle(border.bottom.style);
    if (bottomBorderColor) style.borderBottomColor = bottomBorderColor;
  }

  if (border?.left?.style) {
    style.borderLeftStyle = getBorderStyle(border.left.style);
    if (leftBorderColor) style.borderLeftColor = leftBorderColor;
  }

  return style;
};

const getCellContent = (cell?: XLSXCell): { text: string; html?: string; title?: string } => {
  if (!cell) {
    return { text: '' };
  }

  if (typeof cell.h === 'string' && cell.h.trim()) {
    const plainText = stripHtml(cell.h);
    return {
      text: plainText,
      html: cell.h,
      title: plainText || undefined,
    };
  }

  if (typeof cell.w === 'string') {
    return {
      text: cell.w,
      title: cell.w || undefined,
    };
  }

  if (cell.v instanceof Date) {
    const value = cell.v.toLocaleString();
    return {
      text: value,
      title: value,
    };
  }

  if (cell.v === undefined || cell.v === null) {
    return { text: '' };
  }

  const value = String(cell.v);
  return {
    text: value,
    title: value,
  };
};

const getRowHeight = (row?: XLSXRowInfo): string | undefined => {
  if (row?.hpx && Number.isFinite(row.hpx)) {
    return `${Math.max(row.hpx, 20)}px`;
  }

  if (row?.hpt && Number.isFinite(row.hpt)) {
    return `${Math.max(row.hpt * 1.3333, 20)}px`;
  }

  return undefined;
};

const getColumnWidth = (col?: XLSXColInfo): string | undefined => {
  if (col?.wpx && Number.isFinite(col.wpx)) {
    return `${Math.max(col.wpx, 72)}px`;
  }

  if (col?.wch && Number.isFinite(col.wch)) {
    return `${Math.max(Math.round(col.wch * 8 + 16), 72)}px`;
  }

  if (col?.width && Number.isFinite(col.width)) {
    return `${Math.max(Math.round(col.width * 8 + 16), 72)}px`;
  }

  return undefined;
};

const getVisibleIndexes = (
  start: number,
  end: number,
  infos: Array<XLSXRowInfo | XLSXColInfo | undefined>
): number[] => {
  const indexes: number[] = [];

  for (let index = start; index <= end; index += 1) {
    if (infos[index]?.hidden) continue;
    indexes.push(index);
  }

  return indexes;
};

const getErrorMessage = (error: unknown): string | undefined => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;

  return undefined;
};

const getSpreadsheetDisplayError = (message?: string): string | undefined => {
  if (!message) return undefined;
  if (/password-protected/i.test(message)) return '\u6587\u4ef6\u5df2\u53d7\u5bc6\u7801\u4fdd\u62a4\u3002';
  if (/bad password|invalid password/i.test(message)) {
    return '\u5bc6\u7801\u4e0d\u6b63\u786e\uff0c\u8bf7\u91cd\u65b0\u8f93\u5165\u3002';
  }
  if (/preview engine is not loaded/i.test(message)) {
    return '\u8868\u683c\u9884\u89c8\u5f15\u64ce\u5c1a\u672a\u52a0\u8f7d\u5b8c\u6210\u3002';
  }

  return '\u8868\u683c\u9884\u89c8\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5\u6216\u4e0b\u8f7d\u540e\u67e5\u770b\u3002';
};

const isPasswordProtectedError = (message?: string): boolean =>
  Boolean(message && /password-protected/i.test(message));

const isLegacyPasswordSupported = (name: string, mimeType: string): boolean => {
  const ext = getFileNameExt(name);

  if (ext === 'xls') return true;

  return ext === '' && mimeType.toLowerCase() === 'application/vnd.ms-excel';
};

const isModernEncryptedSpreadsheet = (name: string): boolean =>
  MODERN_ENCRYPTED_EXTS.has(getFileNameExt(name));

const createMergeMaps = (merges: XLSXRange[], visibleRows: number[], visibleCols: number[]) => {
  const visibleRowSet = new Set(visibleRows);
  const visibleColSet = new Set(visibleCols);
  const mergeStarts = new Map<string, { rowSpan: number; colSpan: number }>();
  const coveredCells = new Set<string>();

  merges.forEach((merge) => {
    if (!visibleRowSet.has(merge.s.r) || !visibleColSet.has(merge.s.c)) return;

    let rowSpan = 0;
    let colSpan = 0;

    visibleRows.forEach((rowIndex) => {
      if (rowIndex >= merge.s.r && rowIndex <= merge.e.r) {
        rowSpan += 1;
      }
    });

    visibleCols.forEach((colIndex) => {
      if (colIndex >= merge.s.c && colIndex <= merge.e.c) {
        colSpan += 1;
      }
    });

    if (rowSpan < 1 || colSpan < 1) return;

    mergeStarts.set(`${merge.s.r}:${merge.s.c}`, { rowSpan, colSpan });

    for (let rowIndex = merge.s.r; rowIndex <= merge.e.r; rowIndex += 1) {
      for (let colIndex = merge.s.c; colIndex <= merge.e.c; colIndex += 1) {
        if (rowIndex === merge.s.r && colIndex === merge.s.c) continue;
        if (!visibleRowSet.has(rowIndex) || !visibleColSet.has(colIndex)) continue;

        coveredCells.add(`${rowIndex}:${colIndex}`);
      }
    }
  });

  return {
    mergeStarts,
    coveredCells,
  };
};

const buildRenderedSheet = (
  worksheet: XLSXWorksheet,
  encodeCell: (cell: { c: number; r: number }) => string,
  decodeRange: (range: string) => XLSXRange
): RenderedSheet => {
  const rangeRef = worksheet['!ref'];
  if (!rangeRef) {
    return {
      rows: [],
      colWidths: [],
      totalRows: 0,
      totalCols: 0,
      isEmpty: true,
    };
  }

  const range = decodeRange(rangeRef);
  const rowInfos = worksheet['!rows'] ?? [];
  const colInfos = worksheet['!cols'] ?? [];
  const visibleRows = getVisibleIndexes(range.s.r, range.e.r, rowInfos);
  const visibleCols = getVisibleIndexes(range.s.c, range.e.c, colInfos);
  const { mergeStarts, coveredCells } = createMergeMaps(
    worksheet['!merges'] ?? [],
    visibleRows,
    visibleCols
  );

  const rows = visibleRows.map((rowIndex) => {
    const rowHeight = getRowHeight(rowInfos[rowIndex]);
    const cells: RenderedCell[] = [];

    visibleCols.forEach((colIndex) => {
      const key = `${rowIndex}:${colIndex}`;
      if (coveredCells.has(key)) return;

      const ref = encodeCell({ c: colIndex, r: rowIndex });
      const maybeCell = worksheet[ref];
      const cell = isCellObject(maybeCell) ? maybeCell : undefined;
      const merged = mergeStarts.get(key);
      const content = getCellContent(cell);

      cells.push({
        key,
        colSpan: merged?.colSpan ?? 1,
        rowSpan: merged?.rowSpan ?? 1,
        style: getCellStyle(cell),
        text: content.text,
        html: content.html,
        title: content.title,
      });
    });

    return {
      key: `row-${rowIndex}`,
      height: rowHeight,
      cells,
    };
  });

  const isEmpty = rows.every((row) => row.cells.every((cell) => !cell.text && !cell.html));

  return {
    rows,
    colWidths: visibleCols.map((colIndex) => getColumnWidth(colInfos[colIndex])),
    totalRows: visibleRows.length,
    totalCols: visibleCols.length,
    isEmpty,
  };
};

type SpreadsheetViewerProps = {
  name: string;
  data: ArrayBuffer;
  mimeType: string;
  requestClose: () => void;
};

export const SpreadsheetViewer = as<'div', SpreadsheetViewerProps>(
  ({ className, name, data, mimeType, requestClose, ...props }, ref) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [xlsxState, loadXlsx] = useXLSXLoader();
    const [activeSheetName, setActiveSheetName] = useState<string>();
    const [passwordInput, setPasswordInput] = useState('');
    const [submittedPassword, setSubmittedPassword] = useState<string>();
    const { zoom, zoomIn, zoomOut, setZoom } = useZoom(ZOOM_STEP, MIN_ZOOM, MAX_ZOOM);

    const [workbookState, loadWorkbook] = useAsyncCallback(
      useCallback(
        async (password?: string) => {
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
            password: password?.trim() || undefined,
          });
        },
        [data, xlsxState]
      )
    );

    useEffect(() => {
      setPasswordInput('');
      setSubmittedPassword(undefined);
      setActiveSheetName(undefined);
      setZoom(1);
    }, [data, name, setZoom]);

    useEffect(() => {
      loadXlsx().catch(() => undefined);
    }, [loadXlsx]);

    useEffect(() => {
      if (xlsxState.status === AsyncStatus.Success) {
        loadWorkbook(submittedPassword).catch(() => undefined);
      }
    }, [xlsxState, loadWorkbook, submittedPassword]);

    useEffect(() => {
      if (workbookState.status !== AsyncStatus.Success) return;

      setActiveSheetName((currentSheetName) => {
        if (currentSheetName && workbookState.data.SheetNames.includes(currentSheetName)) {
          return currentSheetName;
        }

        return workbookState.data.SheetNames[0];
      });
    }, [workbookState]);

    useEffect(() => {
      scrollRef.current?.scrollTo({ top: 0, left: 0 });
    }, [activeSheetName]);

    const activeSheetIndex = useMemo(() => {
      if (workbookState.status !== AsyncStatus.Success || !activeSheetName) return -1;

      return workbookState.data.SheetNames.indexOf(activeSheetName);
    }, [activeSheetName, workbookState]);

    const renderedSheet = useMemo(() => {
      if (
        xlsxState.status !== AsyncStatus.Success ||
        workbookState.status !== AsyncStatus.Success ||
        !activeSheetName
      ) {
        return undefined;
      }

      const worksheet = workbookState.data.Sheets[activeSheetName];
      if (!worksheet) {
        return {
          rows: [],
          colWidths: [],
          totalRows: 0,
          totalCols: 0,
          isEmpty: true,
        };
      }

      return buildRenderedSheet(
        worksheet,
        xlsxState.data.utils.encode_cell,
        xlsxState.data.utils.decode_range
      );
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

    const passwordProtected = isPasswordProtectedError(errorMessage);
    const passwordRetrySupported = passwordProtected && isLegacyPasswordSupported(name, mimeType);
    const modernEncryptedSpreadsheet = passwordProtected && isModernEncryptedSpreadsheet(name);
    const handleRetry = () => {
      if (xlsxState.status === AsyncStatus.Error) {
        loadXlsx().catch(() => undefined);
        return;
      }

      loadWorkbook(submittedPassword).catch(() => undefined);
    };

    const handlePasswordSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
      evt.preventDefault();
      if (!passwordInput.trim()) return;

      setSubmittedPassword(passwordInput);
    };

    const handleDownload = () => {
      FileSaver.saveAs(new Blob([data], { type: mimeType }), name);
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

    const summaryText =
      workbookState.status === AsyncStatus.Success && renderedSheet
        ? [
            `${workbookState.data.SheetNames.length} \u4e2a\u5de5\u4f5c\u8868`,
            `${renderedSheet.totalRows} \u884c`,
            `${renderedSheet.totalCols} \u5217`,
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

            {workbookState.status === AsyncStatus.Success && activeSheetIndex >= 0 && (
              <Chip variant="SurfaceVariant" radii="Pill">
                <Text size="B300">{`${activeSheetIndex + 1}/${workbookState.data.SheetNames.length}`}</Text>
              </Chip>
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
          grow="Yes"
          className={css.SpreadsheetViewerBody}
          direction="Column"
          style={{ minHeight: 0 }}
        >
          {isLoading && (
            <Box
              className={css.SpreadsheetViewerState}
              direction="Column"
              gap="200"
              alignItems="Center"
              justifyContent="Center"
            >
              <Spinner variant="Secondary" size="600" />
              <Text size="T300">{'\u6b63\u5728\u52a0\u8f7d\u8868\u683c\u9884\u89c8...'}</Text>
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
              <Text size="T300">{'\u8868\u683c\u9884\u89c8\u52a0\u8f7d\u5931\u8d25\u3002'}</Text>
              {getSpreadsheetDisplayError(errorMessage) && (
                <Text className={css.ErrorMessage} size="T200" priority="300">
                  {getSpreadsheetDisplayError(errorMessage)}
                </Text>
              )}
              {passwordRetrySupported && (
                <Box
                  as="form"
                  className={css.PasswordForm}
                  direction="Column"
                  gap="200"
                  onSubmit={handlePasswordSubmit}
                >
                  <Text className={css.PasswordHint} size="T200" priority="300">
                    {'\u68c0\u6d4b\u5230\u65e7\u7248\u52a0\u5bc6\u8868\u683c\uff0c\u53ef\u5c1d\u8bd5\u8f93\u5165\u5bc6\u7801\u5728\u7ebf\u6253\u5f00\u3002'}
                  </Text>
                  <Box className={css.PasswordRow} alignItems="Center" gap="200">
                    <PasswordInput
                      size="400"
                      variant="Secondary"
                      name="workbookPassword"
                      placeholder={'\u8bf7\u8f93\u5165\u5de5\u4f5c\u7c3f\u5bc6\u7801'}
                      value={passwordInput}
                      onChange={(evt: React.ChangeEvent<HTMLInputElement>) =>
                        setPasswordInput(evt.target.value)
                      }
                      required
                    />
                    <Button
                      type="submit"
                      size="300"
                      variant="Primary"
                      radii="300"
                      disabled={workbookState.status === AsyncStatus.Loading}
                    >
                      {workbookState.status === AsyncStatus.Loading && (
                        <Spinner size="200" variant="Secondary" />
                      )}
                      <Text size="B300">{'\u5c1d\u8bd5\u89e3\u9501'}</Text>
                    </Button>
                  </Box>
                </Box>
              )}
              {modernEncryptedSpreadsheet && (
                <Text className={css.PasswordHint} size="T200" priority="300">
                  {'\u5f53\u524d\u65b0\u7248\u52a0\u5bc6\u8868\u683c\u6682\u4e0d\u652f\u6301\u5728\u7ebf\u9884\u89c8\uff0c\u8bf7\u4e0b\u8f7d\u540e\u4f7f\u7528\u672c\u5730\u529e\u516c\u8f6f\u4ef6\u6253\u5f00\u3002'}
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

          {!isLoading && !isError && workbookState.status === AsyncStatus.Success && renderedSheet && (
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

              <Box className={css.SpreadsheetStage} grow="Yes" style={{ minHeight: 0 }}>
                <Scroll
                  ref={scrollRef}
                  className={css.SpreadsheetViewport}
                  size="300"
                  direction="Both"
                  variant="Background"
                  visibility="Hover"
                  onWheel={handleWheel}
                >
                  <div className={css.SheetPreview}>
                    {renderedSheet.isEmpty ? (
                      <div className={css.EmptySheet}>
                        <Text size="T300" priority="300">
                          {'\u5f53\u524d\u5de5\u4f5c\u8868\u4e3a\u7a7a\u3002'}
                        </Text>
                      </div>
                    ) : (
                      <div className={css.SheetCanvasShell} style={{ zoom }}>
                        <table className={css.Table}>
                          <colgroup>
                            {renderedSheet.colWidths.map((width, index) => (
                              <col
                                key={`col-${index}`}
                                style={
                                  width
                                    ? {
                                        width,
                                        minWidth: width,
                                      }
                                    : undefined
                                }
                              />
                            ))}
                          </colgroup>
                          <tbody>
                            {renderedSheet.rows.map((row) => (
                              <tr key={row.key} style={row.height ? { height: row.height } : undefined}>
                                {row.cells.map((cell) => (
                                  <td
                                    key={cell.key}
                                    className={css.Cell}
                                    colSpan={cell.colSpan}
                                    rowSpan={cell.rowSpan}
                                    style={cell.style}
                                    title={cell.title}
                                  >
                                    {cell.html ? (
                                      <span
                                        className={css.CellText}
                                        dangerouslySetInnerHTML={{ __html: cell.html }}
                                      />
                                    ) : (
                                      <span className={css.CellText}>{cell.text || ' '}</span>
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
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
