export const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/gif',
  'image/png',
  'image/apng',
  'image/webp',
  'image/avif',
];

export const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];

export const AUDIO_MIME_TYPES = [
  'audio/mp4',
  'audio/webm',
  'audio/aac',
  'audio/mpeg',
  'audio/ogg',
  'audio/wave',
  'audio/wav',
  'audio/x-wav',
  'audio/x-pn-wav',
  'audio/flac',
  'audio/x-flac',
];

export const APPLICATION_MIME_TYPES = [
  'application/pdf',
  'application/json',
  'application/x-sh',
  'application/ecmascript',
  'application/javascript',
  'application/xhtml+xml',
  'application/xml',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-word.document.macroenabled.12',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
  'application/vnd.ms-word.template.macroenabled.12',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
  'application/vnd.ms-excel.sheet.macroenabled.12',
  'application/vnd.ms-excel.template.macroenabled.12',
  'application/vnd.ms-excel.sheet.binary.macroenabled.12',
  'application/vnd.ms-excel.addin.macroenabled.12',
  'application/vnd.ms-excel',
];

export const TEXT_MIME_TYPE = [
  'text/plain',
  'text/html',
  'text/css',
  'text/javascript',
  'text/x-c',
  'text/csv',
  'text/tab-separated-values',
  'text/yaml',
  'text/x-java-source,java',
  'text/markdown',
];

export const READABLE_TEXT_MIME_TYPES = [
  'application/json',
  'application/x-sh',
  'application/ecmascript',
  'application/javascript',
  'application/xhtml+xml',
  'application/xml',

  ...TEXT_MIME_TYPE,
];

export const READABLE_EXT_TO_MIME_TYPE: Record<string, string> = {
  go: 'text/go',
  rs: 'text/rust',
  py: 'text/python',
  swift: 'text/swift',
  c: 'text/c',
  cpp: 'text/cpp',
  java: 'text/java',
  kt: 'text/kotlin',
  lua: 'text/lua',
  php: 'text/php',
  ts: 'text/typescript',
  js: 'text/javascript',
  jsx: 'text/jsx',
  tsx: 'text/tsx',
  html: 'text/html',
  xhtml: 'text/xhtml',
  xht: 'text/xhtml',
  css: 'text/css',
  scss: 'text/scss',
  sass: 'text/sass',
  json: 'text/json',
  md: 'text/markdown',
  yaml: 'text/yaml',
  yni: 'text/yni',
  xml: 'text/xml',
  txt: 'text/plain',
  text: 'text/plain',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  conf: 'text/conf',
  cfg: 'text/conf',
  cnf: 'text/conf',
  log: 'text/log',
  me: 'text/me',
  cvs: 'text/cvs',
  tvs: 'text/tvs',
  sql: 'text/sql',
};

export const ALLOWED_BLOB_MIME_TYPES = [
  ...IMAGE_MIME_TYPES,
  ...VIDEO_MIME_TYPES,
  ...AUDIO_MIME_TYPES,
  ...APPLICATION_MIME_TYPES,
  ...TEXT_MIME_TYPE,
];

export const FALLBACK_MIMETYPE = 'application/octet-stream';

export const DOCX_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-word.document.macroenabled.12',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
  'application/vnd.ms-word.template.macroenabled.12',
];

export const SPREADSHEET_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
  'application/vnd.ms-excel.sheet.macroenabled.12',
  'application/vnd.ms-excel.template.macroenabled.12',
  'application/vnd.ms-excel.sheet.binary.macroenabled.12',
  'application/vnd.ms-excel.addin.macroenabled.12',
  'application/vnd.ms-excel',
  'text/csv',
  'text/tab-separated-values',
];

export type FilePreviewKind = 'none' | 'text' | 'pdf' | 'spreadsheet' | 'docx';

export const getNormalizedMimeType = (mimeType: string): string => {
  if (typeof mimeType !== 'string') return FALLBACK_MIMETYPE;

  const [type] = mimeType.split(';');
  return type.trim().toLowerCase();
};

export const getBlobSafeMimeType = (mimeType: string) => {
  const type = getNormalizedMimeType(mimeType);
  if (!ALLOWED_BLOB_MIME_TYPES.includes(type)) {
    return FALLBACK_MIMETYPE;
  }
  // Required for Chromium browsers
  if (type === 'video/quicktime') {
    return 'video/mp4';
  }
  return type;
};

export const safeFile = (f: File) => {
  const safeType = getBlobSafeMimeType(f.type);
  if (safeType !== f.type) {
    return new File([f], f.name, { type: safeType });
  }
  return f;
};

export const mimeTypeToExt = (mimeType: string): string => {
  const extStart = mimeType.lastIndexOf('/') + 1;
  return mimeType.slice(extStart);
};
export const getFileNameExt = (fileName: string): string => {
  const extStart = fileName.lastIndexOf('.');
  if (extStart <= 0 || extStart === fileName.length - 1) return '';

  return fileName.slice(extStart + 1).toLowerCase();
};
export const getFileNameWithoutExt = (fileName: string): string => {
  const extStart = fileName.lastIndexOf('.');
  if (extStart === 0 || extStart === -1) return fileName;
  return fileName.slice(0, extStart);
};

export const getFilePreviewKind = (fileName: string, mimeType: string): FilePreviewKind => {
  const normalizedMimeType = getNormalizedMimeType(mimeType);
  const ext = getFileNameExt(fileName);

  if (normalizedMimeType === 'application/pdf' || ext === 'pdf') {
    return 'pdf';
  }

  if (
    normalizedMimeType === 'application/msword' ||
    DOCX_MIME_TYPES.includes(normalizedMimeType) ||
    ['doc', 'docx', 'docm', 'dotx', 'dotm'].includes(ext)
  ) {
    return 'docx';
  }

  if (
    SPREADSHEET_MIME_TYPES.includes(normalizedMimeType) ||
    ['xlsx', 'xlsm', 'xltx', 'xltm', 'xlam', 'xlsb', 'xls', 'csv', 'tsv'].includes(ext)
  ) {
    return 'spreadsheet';
  }

  if (
    READABLE_TEXT_MIME_TYPES.includes(normalizedMimeType) ||
    Boolean(READABLE_EXT_TO_MIME_TYPE[ext])
  ) {
    return 'text';
  }

  return 'none';
};
