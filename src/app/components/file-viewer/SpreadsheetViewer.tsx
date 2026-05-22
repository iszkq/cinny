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
import { Box, Button, Chip, Header, Icon, IconButton, Icons, Scroll, Spinner, Text, as } from 'folds';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import {
  XLSXCell,
  XLSXColInfo,
  XLSXModule,
  XLSXRange,
  XLSXRowInfo,
  XLSXWorksheet,
  useXLSXLoader,
} from '../../plugins/xlsx';
import { decryptSpreadsheetArrayBuffer } from '../../plugins/xlsx-populate';
import { PasswordInput } from '../password-input';
import { getFileNameExt } from '../../utils/mimeTypes';
import { useZoom } from '../../hooks/useZoom';
import * as css from './SpreadsheetViewer.css';
import { saveDownloadedFile } from '../../utils/saveDownloadedFile';

const MODERN_ENCRYPTED_EXTS = new Set(['xlsx', 'xlsm', 'xltx', 'xltm', 'xlam']);
const ZOOM_STEP = 0.2;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const ZIP_FILE_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const COMPOUND_FILE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

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
  html?: string;
};

type WorksheetMatrix = unknown[][];

type SpreadsheetDecryptState =
  | { status: AsyncStatus.Idle }
  | { status: AsyncStatus.Loading }
  | { status: AsyncStatus.Success; data: ArrayBuffer }
  | { status: AsyncStatus.Error; error: unknown };

const isCellObject = (value: unknown): value is XLSXCell =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stripHtml = (value: string): string =>
  value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();

const normalizeSheetHtml = (value?: string): string | undefined => {
  if (!value) return undefined;

  const bodyMatch = value.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const tableMatch = value.match(/<table[\s\S]*<\/table>/i);
  const normalized = bodyMatch?.[1]?.trim() || tableMatch?.[0]?.trim() || value.trim();

  return normalized || undefined;
};

const hasRenderableSheetHtml = (value?: string): boolean => {
  if (!value) return false;

  const plainText = stripHtml(value);
  return plainText.length > 0 || /<(table|td|th|img|svg)\b/i.test(value);
};

const hasBinarySignature = (buffer: ArrayBuffer, signature: number[]): boolean => {
  if (buffer.byteLength < signature.length) {
    return false;
  }

  const view = new Uint8Array(buffer, 0, signature.length);
  return signature.every((byte, index) => view[index] === byte);
};

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
  const backgroundColor = fillColor ?? normalizeExcelColor(fill?.bgColor?.rgb);
  if (backgroundColor && fill?.patternType !== 'none') {
    style.backgroundColor = backgroundColor;
  } else if (backgroundColor && !fill?.patternType) {
    style.backgroundColor = backgroundColor;
  }

  const topBorderColor = normalizeExcelColor(border?.top?.color?.rgb);
  const rightBorderColor = normalizeExcelColor(border?.right?.color?.rgb);
  const bottomBorderColor = normalizeExcelColor(border?.bottom?.color?.rgb);
  const leftBorderColor = normalizeExcelColor(border?.left?.color?.rgb);

  if (border?.top?.style) {
    style.borderTopStyle = getBorderStyle(border.top.style);
    style.borderTopWidth = '1px';
    if (topBorderColor) style.borderTopColor = topBorderColor;
  }

  if (border?.right?.style) {
    style.borderRightStyle = getBorderStyle(border.right.style);
    style.borderRightWidth = '1px';
    if (rightBorderColor) style.borderRightColor = rightBorderColor;
  }

  if (border?.bottom?.style) {
    style.borderBottomStyle = getBorderStyle(border.bottom.style);
    style.borderBottomWidth = '1px';
    if (bottomBorderColor) style.borderBottomColor = bottomBorderColor;
  }

  if (border?.left?.style) {
    style.borderLeftStyle = getBorderStyle(border.left.style);
    style.borderLeftWidth = '1px';
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

const getMatrixCellText = (
  matrix: WorksheetMatrix,
  rowIndex: number,
  colIndex: number,
  rowOffset: number,
  colOffset: number
): string | undefined => {
  const value = matrix[rowIndex - rowOffset]?.[colIndex - colOffset];
  if (value === undefined || value === null) return undefined;
  if (value instanceof Date) return value.toLocaleString();
  if (typeof value === 'string') return value;

  return String(value);
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

const shouldShowSpreadsheetDebugMessage = (message?: string): boolean => {
  if (!message) return false;

  return !(
    /bad password|invalid password|incorrect password|wrong password|decrypt/i.test(message) ||
    /central directory|zip file|compressed folder/i.test(message) ||
    /failed to load spreadsheet encryption runtime|spreadsheet encryption runtime/i.test(message) ||
    /password-protected|unsupported encryption|encrypted/i.test(message) ||
    /preview engine is not loaded/i.test(message) ||
    /timed out/i.test(message) ||
    /password is required/i.test(message)
  );
};

const isSpreadsheetPreviewUnavailable = (message?: string): boolean =>
  Boolean(message && /non-whitespace before first tag|unsupported encryption/i.test(message));

const getSpreadsheetDisplayError = (message?: string): string | undefined => {
  if (!message) return undefined;
  if (
    /bad password|invalid password|incorrect password|wrong password|decrypt/i.test(message)
  ) {
    return '\u5bc6\u7801\u4e0d\u6b63\u786e\uff0c\u8bf7\u91cd\u65b0\u8f93\u5165\u3002';
  }
  if (/non-whitespace before first tag/i.test(message)) {
    return '\u5bc6\u7801\u53ef\u80fd\u4e0d\u6b63\u786e\uff0c\u6216\u8005\u8be5\u52a0\u5bc6\u8868\u683c\u4e0d\u662f\u5f53\u524d\u6d4f\u89c8\u5668\u7aef\u80fd\u7a33\u5b9a\u89e3\u6790\u7684\u6807\u51c6 Excel \u52a0\u5bc6\u683c\u5f0f\u3002';
  }
  if (/central directory|zip file|compressed folder/i.test(message)) {
    return '\u5bc6\u7801\u4e0d\u6b63\u786e\uff0c\u6216\u8005\u6587\u4ef6\u5185\u5bb9\u65e0\u6cd5\u89e3\u5bc6\uff0c\u8bf7\u786e\u8ba4\u540e\u91cd\u8bd5\u3002';
  }
  if (
    /failed to load spreadsheet encryption runtime|spreadsheet encryption runtime/i.test(message)
  ) {
    return '\u52a0\u5bc6\u8868\u683c\u89e3\u6790\u7ec4\u4ef6\u52a0\u8f7d\u5931\u8d25\uff0c\u53ef\u80fd\u88ab\u6d4f\u89c8\u5668\u6216\u7f51\u7edc\u62e6\u622a\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u6216\u4e0b\u8f7d\u540e\u67e5\u770b\u3002';
  }
  if (/password-protected|unsupported encryption|encrypted/i.test(message)) {
    return '\u6587\u4ef6\u5df2\u53d7\u5bc6\u7801\u4fdd\u62a4\u3002';
  }
  if (/preview engine is not loaded/i.test(message)) {
    return '\u8868\u683c\u9884\u89c8\u5f15\u64ce\u5c1a\u672a\u52a0\u8f7d\u5b8c\u6210\u3002';
  }
  if (/timed out/i.test(message)) {
    return '\u89e3\u5bc6\u7b49\u5f85\u8d85\u65f6\uff0c\u8bf7\u91cd\u65b0\u8f93\u5165\u5bc6\u7801\u518d\u8bd5\u4e00\u6b21\u3002';
  }
  if (/password is required/i.test(message)) {
    return '\u8bf7\u5148\u8f93\u5165\u5bc6\u7801\u3002';
  }

  return '\u8868\u683c\u9884\u89c8\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5\u6216\u4e0b\u8f7d\u540e\u67e5\u770b\u3002';
};

const isPasswordProtectedError = (message?: string): boolean =>
  Boolean(message && /password-protected|unsupported encryption|encrypted|bad password|invalid password|incorrect password|wrong password|decrypt/i.test(message));

const isLegacyPasswordSupported = (name: string, mimeType: string): boolean => {
  const ext = getFileNameExt(name);

  if (ext === 'xls') return true;

  return ext === '' && mimeType.toLowerCase() === 'application/vnd.ms-excel';
};

const isModernEncryptedSpreadsheet = (name: string): boolean =>
  MODERN_ENCRYPTED_EXTS.has(getFileNameExt(name));

const isModernEncryptedWorkbookData = (name: string, buffer: ArrayBuffer): boolean =>
  isModernEncryptedSpreadsheet(name) &&
  hasBinarySignature(buffer, COMPOUND_FILE_SIGNATURE) &&
  !hasBinarySignature(buffer, ZIP_FILE_SIGNATURE);

const getWorksheetCell = (
  worksheet: XLSXWorksheet,
  rowIndex: number,
  colIndex: number,
  encodeCell: (cell: { c: number; r: number }) => string
): XLSXCell | undefined => {
  const denseData = (worksheet as XLSXWorksheet & {
    '!data'?: Array<Array<XLSXCell | undefined> | undefined>;
  })['!data'];

  if (Array.isArray(denseData)) {
    const denseCell = denseData[rowIndex]?.[colIndex];
    return isCellObject(denseCell) ? denseCell : undefined;
  }

  const denseRows = worksheet as unknown as Array<Array<XLSXCell | undefined> | undefined>;
  if (Array.isArray(denseRows)) {
    const denseCell = denseRows[rowIndex]?.[colIndex];
    return isCellObject(denseCell) ? denseCell : undefined;
  }

  const ref = encodeCell({ c: colIndex, r: rowIndex });
  const maybeCell = worksheet[ref];
  return isCellObject(maybeCell) ? maybeCell : undefined;
};

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
  xlsx: XLSXModule,
  worksheet: XLSXWorksheet,
  encodeCell: (cell: { c: number; r: number }) => string,
  decodeRange: (range: string) => XLSXRange,
  matrix: WorksheetMatrix
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

      const cell = getWorksheetCell(worksheet, rowIndex, colIndex, encodeCell);
      const merged = mergeStarts.get(key);
      const content = getCellContent(cell);
      const fallbackText = getMatrixCellText(matrix, rowIndex, colIndex, range.s.r, range.s.c);
      const resolvedText =
        content.text || content.html ? content.text : fallbackText ?? '';

      cells.push({
        key,
        colSpan: merged?.colSpan ?? 1,
        rowSpan: merged?.rowSpan ?? 1,
        style: getCellStyle(cell),
        text: resolvedText,
        html: content.html,
        title: content.title ?? fallbackText,
      });
    });

    return {
      key: `row-${rowIndex}`,
      height: rowHeight,
      cells,
    };
  });

  const isEmpty = rows.every((row) => row.cells.every((cell) => !cell.text && !cell.html));
  const exportedHtml =
    typeof xlsx.utils.sheet_to_html === 'function'
      ? normalizeSheetHtml(
          xlsx.utils.sheet_to_html(worksheet, {
            editable: false,
            header: '',
            footer: '',
          })
        )
      : undefined;
  const html = hasRenderableSheetHtml(exportedHtml) ? exportedHtml : undefined;

  return {
    rows,
    colWidths: visibleCols.map((colIndex) => getColumnWidth(colInfos[colIndex])),
    totalRows: visibleRows.length,
    totalCols: visibleCols.length,
    isEmpty: isEmpty && !html,
    html,
  };
};

type SpreadsheetViewerProps = {
  name: string;
  data: ArrayBuffer;
  mimeType: string;
  requestClose: () => void;
  onPreviewUnavailable?: () => void;
};

export const SpreadsheetViewer = as<'div', SpreadsheetViewerProps>(
  ({ className, name, data, mimeType, requestClose, onPreviewUnavailable, ...props }, ref) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const decryptRequestIdRef = useRef(0);
    const unavailableNotifiedRef = useRef(false);
    const [xlsxState, loadXlsx] = useXLSXLoader();
    const [activeSheetName, setActiveSheetName] = useState<string>();
    const [passwordInput, setPasswordInput] = useState('');
    const [submittedPassword, setSubmittedPassword] = useState<string>();
    const [decryptState, setDecryptState] = useState<SpreadsheetDecryptState>({
      status: AsyncStatus.Idle,
    });
    const [workbookReady, setWorkbookReady] = useState(false);
    const { zoom, zoomIn, zoomOut, setZoom } = useZoom(ZOOM_STEP, MIN_ZOOM, MAX_ZOOM);
    const modernEncryptedWorkbook = useMemo(
      () => isModernEncryptedWorkbookData(name, data),
      [data, name]
    );
    const decryptedData =
      decryptState.status === AsyncStatus.Success ? decryptState.data : undefined;
    const workbookInputData = decryptedData ?? data;

    const unlockModernWorkbook = useCallback(
      async (password: string) => {
        const trimmedPassword = password.trim();
        const requestId = decryptRequestIdRef.current + 1;
        decryptRequestIdRef.current = requestId;

        setDecryptState({ status: AsyncStatus.Loading });
        setWorkbookReady(false);

        try {
          const decryptedBuffer = await decryptSpreadsheetArrayBuffer(data, trimmedPassword);

          if (decryptRequestIdRef.current !== requestId) {
            return;
          }

          setDecryptState({
            status: AsyncStatus.Success,
            data: decryptedBuffer,
          });
        } catch (error) {
          if (decryptRequestIdRef.current !== requestId) {
            return;
          }

          setDecryptState({
            status: AsyncStatus.Error,
            error,
          });
          throw error;
        }
      },
      [data]
    );

    const [workbookState, loadWorkbook] = useAsyncCallback(
      useCallback(
        async (password?: string) => {
          if (xlsxState.status !== AsyncStatus.Success) {
            throw new Error('Spreadsheet preview engine is not loaded');
          }

          if (modernEncryptedWorkbook && !decryptedData) {
            throw new Error('Password-protected spreadsheet requires unlocking');
          }

          const trimmedPassword = password?.trim() || undefined;
          return xlsxState.data.read(workbookInputData, {
            type: 'array',
            dense: false,
            cellDates: true,
            raw: false,
            cellHTML: true,
            cellStyles: true,
            cellNF: true,
            password: decryptedData ? undefined : trimmedPassword || undefined,
          });
        },
        [decryptedData, modernEncryptedWorkbook, workbookInputData, xlsxState]
      )
    );

    useEffect(() => {
      decryptRequestIdRef.current += 1;
      setPasswordInput('');
      setSubmittedPassword(undefined);
      setActiveSheetName(undefined);
      setDecryptState({ status: AsyncStatus.Idle });
      setWorkbookReady(false);
      setZoom(1);
    }, [data, name, setZoom]);

    useEffect(() => {
      loadXlsx().catch(() => undefined);
    }, [loadXlsx]);

    useEffect(() => {
      if (xlsxState.status !== AsyncStatus.Success) {
        return;
      }

      if (modernEncryptedWorkbook && !decryptedData) {
        return;
      }

      setWorkbookReady(false);
      loadWorkbook(submittedPassword).catch(() => undefined);
    }, [decryptedData, loadWorkbook, modernEncryptedWorkbook, submittedPassword, xlsxState]);

    useEffect(
      () => () => {
        decryptRequestIdRef.current += 1;
      },
      []
    );

    useEffect(() => {
      if (workbookState.status === AsyncStatus.Success) {
        setWorkbookReady(true);
      }
    }, [workbookState]);

    useEffect(() => {
      if (decryptState.status === AsyncStatus.Success) {
        setPasswordInput('');
      }
    }, [decryptState]);

    useEffect(() => {
      unavailableNotifiedRef.current = false;
    }, [data, name]);

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
        xlsxState.data,
        worksheet,
        xlsxState.data.utils.encode_cell,
        xlsxState.data.utils.decode_range,
        xlsxState.data.utils.sheet_to_json(worksheet, {
          header: 1,
          raw: false,
          defval: '',
          blankrows: true,
          range: worksheet['!ref'] ?? 0,
        })
      );
    }, [activeSheetName, workbookState, xlsxState]);

    const modernUnlockRequired = modernEncryptedWorkbook && !decryptedData;
    const pendingWorkbookRender =
      !modernUnlockRequired &&
      !workbookReady &&
      xlsxState.status === AsyncStatus.Success &&
      workbookState.status !== AsyncStatus.Error;
    const isLoading =
      xlsxState.status === AsyncStatus.Loading ||
      decryptState.status === AsyncStatus.Loading ||
      (!modernUnlockRequired && workbookState.status === AsyncStatus.Loading) ||
      pendingWorkbookRender;
    const blockingErrorMessage = useMemo(() => {
      if (xlsxState.status === AsyncStatus.Error) {
        return getErrorMessage(xlsxState.error);
      }

      if (!modernUnlockRequired && workbookState.status === AsyncStatus.Error) {
        return getErrorMessage(workbookState.error);
      }

      return undefined;
    }, [modernUnlockRequired, workbookState, xlsxState]);
    const unlockErrorMessage = useMemo(() => {
      if (decryptState.status !== AsyncStatus.Error) {
        return undefined;
      }

      return getErrorMessage(decryptState.error);
    }, [decryptState]);

    useEffect(() => {
      if (!onPreviewUnavailable || unavailableNotifiedRef.current) {
        return;
      }

      const message = unlockErrorMessage ?? blockingErrorMessage;
      if (!isSpreadsheetPreviewUnavailable(message)) {
        return;
      }

      unavailableNotifiedRef.current = true;
      onPreviewUnavailable();
    }, [blockingErrorMessage, onPreviewUnavailable, unlockErrorMessage]);

    const passwordProtected = isPasswordProtectedError(blockingErrorMessage);
    const passwordRetrySupported =
      !modernUnlockRequired && passwordProtected && isLegacyPasswordSupported(name, mimeType);
    const showModernUnlockPanel =
      modernUnlockRequired && xlsxState.status !== AsyncStatus.Error && !isLoading;
    const showBlockingError = Boolean(blockingErrorMessage) && !showModernUnlockPanel;
    const handleRetry = () => {
      if (xlsxState.status === AsyncStatus.Error) {
        loadXlsx().catch(() => undefined);
        return;
      }

      if (modernUnlockRequired) {
        if (submittedPassword?.trim()) {
          unlockModernWorkbook(submittedPassword).catch(() => undefined);
        }
        return;
      }

      loadWorkbook(submittedPassword).catch(() => undefined);
    };

    const handlePasswordSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
      evt.preventDefault();
      const trimmedPassword = passwordInput.trim();
      if (!trimmedPassword) return;

      setSubmittedPassword(trimmedPassword);

      if (modernUnlockRequired) {
        unlockModernWorkbook(trimmedPassword).catch(() => undefined);
        return;
      }
    };

    const handleDownload = async () => {
      await saveDownloadedFile(new Blob([data], { type: mimeType }), name);
    };

    const summaryText =
      workbookReady && workbookState.status === AsyncStatus.Success && renderedSheet
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

            {workbookReady && workbookState.status === AsyncStatus.Success && activeSheetIndex >= 0 && (
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

          {showModernUnlockPanel && (
            <Box
              className={css.SpreadsheetViewerState}
              direction="Column"
              gap="300"
              alignItems="Center"
              justifyContent="Center"
            >
              <Text size="T300">{'\u8bf7\u8f93\u5165\u5de5\u4f5c\u7c3f\u5bc6\u7801'}</Text>
              <Text className={css.PasswordHint} size="T200" priority="300">
                {
                  '\u68c0\u6d4b\u5230\u65b0\u7248\u52a0\u5bc6\u8868\u683c\uff0c\u53ef\u4ee5\u5728\u6d4f\u89c8\u5668\u672c\u5730\u5b8c\u6210\u89e3\u5bc6\u5e76\u5728\u7ebf\u9884\u89c8\uff0c\u65e0\u9700\u5148\u4e0b\u8f7d\u3002'
                }
              </Text>
              {getSpreadsheetDisplayError(unlockErrorMessage) && (
                <Text className={css.ErrorMessage} size="T200" priority="300">
                  {getSpreadsheetDisplayError(unlockErrorMessage)}
                </Text>
              )}
              {shouldShowSpreadsheetDebugMessage(unlockErrorMessage) && (
                <Text className={css.ErrorMessage} size="T200" priority="400">
                  {unlockErrorMessage}
                </Text>
              )}
              <Box
                as="form"
                className={css.PasswordForm}
                direction="Column"
                gap="200"
                onSubmit={handlePasswordSubmit}
              >
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
                  <Button type="submit" size="300" variant="Primary" radii="300">
                    <Text size="B300">{'\u89e3\u9501\u5e76\u9884\u89c8'}</Text>
                  </Button>
                </Box>
              </Box>
            </Box>
          )}

          {showBlockingError && (
            <Box
              className={css.SpreadsheetViewerState}
              direction="Column"
              gap="300"
              alignItems="Center"
              justifyContent="Center"
            >
              <Text size="T300">{'\u8868\u683c\u9884\u89c8\u52a0\u8f7d\u5931\u8d25\u3002'}</Text>
              {getSpreadsheetDisplayError(blockingErrorMessage) && (
                <Text className={css.ErrorMessage} size="T200" priority="300">
                  {getSpreadsheetDisplayError(blockingErrorMessage)}
                </Text>
              )}
              {shouldShowSpreadsheetDebugMessage(blockingErrorMessage) && (
                <Text className={css.ErrorMessage} size="T200" priority="400">
                  {blockingErrorMessage}
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

          {!isLoading &&
            !showModernUnlockPanel &&
            !showBlockingError &&
            workbookReady &&
            workbookState.status === AsyncStatus.Success &&
            renderedSheet && (
            <>
              <Box className={css.SpreadsheetStage} grow="Yes" style={{ minHeight: 0 }}>
                <Scroll
                  ref={scrollRef}
                  className={css.SpreadsheetViewport}
                  size="300"
                  direction="Both"
                  variant="Background"
                  visibility="Hover"
                >
                  <div className={css.SheetPreview}>
                    {renderedSheet.html ? (
                      <div className={css.SheetCanvasShell} style={{ zoom }}>
                        <div
                          className={css.SheetHtmlFallback}
                          dangerouslySetInnerHTML={{ __html: renderedSheet.html }}
                        />
                      </div>
                    ) : renderedSheet.isEmpty ? (
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

              <Box className={css.SheetRail} direction="Column">
                {summaryText && (
                  <Text className={css.SheetSummary} size="T200" priority="300">
                    {summaryText}
                  </Text>
                )}
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
              </Box>
            </>
          )}
        </Box>
      </Box>
    );
  }
);
