import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const readSource = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const loadCalendarParser = async () => {
  const source = await readSource('src/app/features/weekly-calendar/calendar.ts');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const standaloneOutput = output.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '');
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(standaloneOutput).toString(
    'base64'
  )}`;
  return import(moduleUrl);
};

test('weekly calendar keeps the room picker searchable and bounded', async () => {
  const pageSource = await readSource('src/app/pages/client/explore/Featured.tsx');
  const styleSource = await readSource('src/app/pages/client/explore/WeeklyCalendar.css.ts');

  assert.match(pageSource, /type="search"/);
  assert.match(pageSource, /matches\.slice\(0, 50\)/);
  assert.match(pageSource, /输入关键词搜索房间/);
  assert.doesNotMatch(pageSource, /<select[\s>]/);
  assert.match(styleSource, /maxHeight: `min\(/);
  assert.match(styleSource, /overflowY: 'auto'/);
});

test('weekly calendar switches to a narrow-screen single column layout', async () => {
  const styleSource = await readSource('src/app/pages/client/explore/WeeklyCalendar.css.ts');
  const dayColumnStart = styleSource.indexOf('export const DayColumn');
  const dayColumnEnd = styleSource.indexOf('export const TodayColumn', dayColumnStart);
  const dayColumnStyle = styleSource.slice(dayColumnStart, dayColumnEnd);

  assert.match(styleSource, /screen and \(max-width: 700px\)/);
  assert.match(styleSource, /gridTemplateColumns: 'minmax\(0, 1fr\)'/);
  assert.match(styleSource, /width: '100%'/);
  assert.match(styleSource, /gridTemplateColumns: 'repeat\(7, minmax\(0, 1fr\)\)'/);
  assert.match(styleSource, /max-width: 900px.*min-width: 701px/);
  assert.match(styleSource, /flexDirection: 'column'/);
  assert.match(styleSource, /screen and \(max-width: 480px\)/);
  assert.doesNotMatch(dayColumnStyle, /maxHeight|overflow(?:Y)?: 'hidden'/);
});

test('weekly calendar accepts dates and meeting IDs from the complete message', async () => {
  const parserSource = await readSource('src/app/features/weekly-calendar/calendar.ts');

  assert.match(parserSource, /\[fields\.when, fields\.what, body\]/);
  assert.match(parserSource, /hasZoomContext \? lines\.find\(extractZoomMeetingId\)/);
  assert.match(parserSource, /getMeetingTimes\(fields\.when, body\)/);
  assert.match(parserSource, /getFallbackMeetingTitle/);
  assert.match(parserSource, /FULL_SCAN_LOOKBACK_MS/);
  assert.doesNotMatch(parserSource, /if \(!fields\.when \|\| !fields\.where\)/);
});

test('weekly calendar derives a meeting from a Zoom ID, body date and highlighted title', async () => {
  const { parseMeetingBody } = await loadCalendarParser();
  const now = new Date(2026, 7, 10, 12).getTime();
  const sourceTimestamp = new Date(2026, 7, 9, 18).getTime();
  const body = [
    '【NE2】同工协调会',
    '请大家准时参加',
    'Zoom Meeting ID:',
    '987 654 3210',
    '会议安排：8月12日 晚上8:30',
  ].join('\n');

  assert.deepEqual(parseMeetingBody(body, '$meeting-one', sourceTimestamp, now), {
    sourceEventId: '$meeting-one',
    sourceTimestamp,
    title: '【NE2】同工协调会',
    date: '2026-08-12',
    startTime: '20:30',
    zoomMeetingId: '9876543210',
    locationText: '987 654 3210',
  });
});

test('weekly calendar falls back from incomplete fields to body time and title', async () => {
  const { parseMeetingBody } = await loadCalendarParser();
  const now = new Date(2026, 7, 10, 12).getTime();
  const sourceTimestamp = new Date(2026, 7, 9, 18).getTime();
  const body = [
    '何时：8月13日',
    '何事：',
    '重点：产品周会',
    '何地：线上会议',
    'Zoom：https://us06web.zoom.us/j/12345678901?pwd=example',
    '时间补充：19:30-21:00',
  ].join('\n');

  assert.deepEqual(parseMeetingBody(body, '$meeting-two', sourceTimestamp, now), {
    sourceEventId: '$meeting-two',
    sourceTimestamp,
    title: '产品周会',
    date: '2026-08-13',
    startTime: '19:30',
    endTime: '21:00',
    zoomMeetingId: '12345678901',
    locationText: 'Zoom:https://us06web.zoom.us/j/12345678901?pwd=example',
  });
});

test('weekly calendar does not mistake an unrelated long number for a Zoom meeting', async () => {
  const { parseMeetingBody } = await loadCalendarParser();
  const now = new Date(2026, 7, 10, 12).getTime();
  const body = '8月12日 19:30 联系电话：13800138000';

  assert.equal(parseMeetingBody(body, '$not-a-meeting', now, now), undefined);
});

test('weekly calendar assigns a Sunday announcement to the coming Monday', async () => {
  const { parseMeetingBody } = await loadCalendarParser();
  const now = new Date(2026, 7, 10, 12).getTime();
  const sourceTimestamp = new Date(2026, 7, 9, 18).getTime();
  const body = '同工晨会\n周一 上午9点\nZoom 会议号：123 456 789';

  assert.equal(
    parseMeetingBody(body, '$sunday-announcement', sourceTimestamp, now)?.date,
    '2026-08-10'
  );
});
