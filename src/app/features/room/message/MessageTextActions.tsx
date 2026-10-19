import { findMessageNumbers } from '../../../utils/messageNumbers';
import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Header,
  Icon,
  IconButton,
  Icons,
  Modal,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Text,
} from 'folds';
import { copyToClipboard } from '../../../utils/dom';

export function MessageTextActions({
  text,
  requestClose,
}: {
  text: string;
  requestClose: () => void;
}) {
  const [selected, setSelected] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => {
    const update = () => setSelected(window.getSelection()?.toString() ?? '');
    document.addEventListener('selectionchange', update);
    return () => document.removeEventListener('selectionchange', update);
  }, []);
  const numbers = findMessageNumbers(text);
  const copy = async (value: string) =>
    setStatus((await copyToClipboard(value)) ? '已复制' : '复制失败，请长按文本手动复制');
  const segments: React.ReactNode[] = [];
  let offset = 0;
  numbers.forEach((match, index) => {
    const start = match.index!;
    segments.push(text.slice(offset, start));
    segments.push(
      <mark key={index} style={{ color: '#008562', background: 'transparent' }}>
        {match[0]}
      </mark>
    );
    offset = start + match[0].length;
  });
  segments.push(text.slice(offset));
  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <Modal size="400">
          <Box
            direction="Column"
            onPointerDown={(evt: React.PointerEvent) => evt.stopPropagation()}
            onContextMenu={(evt: React.MouseEvent) => evt.stopPropagation()}
            gap="300"
            style={{ padding: 16, maxHeight: '80dvh', overflowY: 'auto' }}
          >
            <Header size="400">
              <Text as="h2" size="H4">
                选择文本与号码
              </Text>
              <IconButton aria-label="关闭" onClick={requestClose}>
                <Icon src={Icons.Cross} />
              </IconButton>
            </Header>
            <Text size="T300">长按下方文本，拖动选择需要复制的部分。</Text>
            <div
              onPointerUp={() => setSelected(window.getSelection()?.toString() ?? '')}
              onTouchEnd={() => setSelected(window.getSelection()?.toString() ?? '')}
              style={{
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
                userSelect: 'text',
                WebkitUserSelect: 'text',
                fontSize: 'calc(18px * var(--app-text-scale, 1))',
                lineHeight: 1.6,
              }}
            >
              {segments}
            </div>
            <Button onClick={() => copy(selected || window.getSelection()?.toString() || text)}>
              <Text>{selected ? '复制选中文字' : '复制消息文本'}</Text>
            </Button>
            {numbers.map((match, index) => {
              const value = match[0];
              const before =
                text
                  .slice(Math.max(0, match.index! - 30), match.index)
                  .split(/[\n，。；,;]/)
                  .pop() ?? '';
              const meeting = /会议|入会|meeting|zoom|腾讯/i.test(before);
              const phone = !meeting && /^1[3-9]\d{9}$/.test(value.replace(/[ -]/g, ''));
              return (
                <Box key={index} direction="Column" gap="200">
                  <Text style={{ color: '#008562' }}>
                    {value} · {meeting ? '会议号' : phone ? '可能是手机号' : '数字／可能是会议号'}
                  </Text>
                  <Button onClick={() => copy(value)}>
                    <Text>复制 {value}</Text>
                  </Button>
                </Box>
              );
            })}
            <Text role="status">{status}</Text>
          </Box>
        </Modal>
      </OverlayCenter>
    </Overlay>
  );
}

export function RecognizedMessageText({
  text,
  renderText,
}: {
  text: string;
  renderText: (text: string) => React.ReactNode;
}) {
  const [number, setNumber] = useState<{ value: string; meeting: boolean }>();
  const matches = findMessageNumbers(text);
  const content: React.ReactNode[] = [];
  let offset = 0;
  matches.forEach((match, index) => {
    content.push(
      <React.Fragment key={`text-${index}`}>
        {renderText(text.slice(offset, match.index))}
      </React.Fragment>
    );
    content.push(
      <button
        key={index}
        type="button"
        aria-label={`查看号码 ${match[0]}`}
        title="查看号码操作"
        onClick={(event) => {
          event.stopPropagation();
          window.getSelection()?.removeAllRanges();
          const context =
            text
              .slice(Math.max(0, match.index - 40), match.index)
              .split(/[\n，。；,;]/)
              .pop() ?? '';
          setNumber({ value: match[0], meeting: /会议|入会|meeting|zoom|腾讯/i.test(context) });
        }}
        style={{
          color: '#008562',
          background: 'transparent',
          border: 0,
          padding: 0,
          font: 'inherit',
          textDecoration: 'underline',
          userSelect: 'text',
          WebkitUserSelect: 'text',
        }}
      >
        {match[0]}
      </button>
    );
    offset = match.index! + match[0].length;
  });
  content.push(<React.Fragment key="tail">{renderText(text.slice(offset))}</React.Fragment>);
  return (
    <>
      {content}
      {number && (
        <NumberActions
          value={number.value}
          meeting={number.meeting}
          requestClose={() => setNumber(undefined)}
        />
      )}
    </>
  );
}

export function NumberActions({
  value,
  meeting,
  requestClose,
}: {
  value: string;
  meeting: boolean;
  requestClose: () => void;
}) {
  const [status, setStatus] = useState('');
  const digits = value.replace(/[ -]/g, '');
  const phone = !meeting && /^(?:\+?86)?1[3-9]\d{9}$/.test(digits);
  return (
    <Overlay open backdrop={<OverlayBackdrop onClick={requestClose} />}>
      <OverlayCenter>
        <Modal size="300">
          <Box
            direction="Column"
            gap="400"
            onPointerDown={(event: React.PointerEvent) => event.stopPropagation()}
            onContextMenu={(event: React.MouseEvent) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            style={{
              padding: 20,
              maxHeight: '80dvh',
              overflowY: 'auto',
              userSelect: 'none',
              WebkitUserSelect: 'none',
            }}
          >
            <Header size="400">
              <Text size="H4">{meeting ? '会议号' : phone ? '手机号码' : '号码'}</Text>
              <IconButton aria-label="关闭号码操作" onClick={requestClose}>
                <Icon src={Icons.Cross} />
              </IconButton>
            </Header>
            <Text size="H3" style={{ overflowWrap: 'anywhere' }}>
              {value}
            </Text>
            <Button
              onClick={async () =>
                setStatus((await copyToClipboard(value)) ? '号码已复制' : '复制失败，请重试')
              }
            >
              <Text>复制号码</Text>
            </Button>
            {phone && (
              <Button as="a" href={`tel:${digits}`}>
                <Text>拨打电话</Text>
              </Button>
            )}
            {!phone && (
              <Text size="T300">
                {meeting
                  ? '这是会议号，可复制到会议应用中加入会议。'
                  : '暂未确定号码类型。如确认是电话号码，可选择拨打。'}
              </Text>
            )}
            {!meeting && !phone && (
              <Button as="a" href={`tel:${digits}`}>
                <Text>作为电话号码拨打</Text>
              </Button>
            )}
            <Text role="status">{status}</Text>
          </Box>
        </Modal>
      </OverlayCenter>
    </Overlay>
  );
}
