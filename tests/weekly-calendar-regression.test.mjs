import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

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
  assert.match(styleSource, /flexDirection: 'column'/);
  assert.match(styleSource, /screen and \(max-width: 480px\)/);
  assert.doesNotMatch(dayColumnStyle, /maxHeight|overflow(?:Y)?: 'hidden'/);
});

test('weekly calendar accepts dates and meeting IDs from the complete message', async () => {
  const parserSource = await readSource('src/app/features/weekly-calendar/calendar.ts');

  assert.match(parserSource, /\[fields\.when, fields\.what, body\]/);
  assert.match(parserSource, /find\(\(line\) => extractZoomMeetingId\(line\)\)/);
  assert.match(parserSource, /parseMeetingTimes\(fields\.when \?\? body\)/);
  assert.doesNotMatch(parserSource, /if \(!fields\.when \|\| !fields\.where\)/);
});
