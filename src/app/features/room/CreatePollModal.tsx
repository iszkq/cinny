import React, { FormEventHandler, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  Icon,
  IconButton,
  Icons,
  Input,
  Line,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Scroll,
  Spinner,
  Text,
  color,
  config,
  toRem,
} from 'folds';
import { CreatePollInput, POLL_MAX_OPTIONS, PollMode } from '../../utils/polls';

type CreatePollModalProps = {
  open: boolean;
  requestClose: () => void;
  onCreate: (input: CreatePollInput) => Promise<void>;
};

const DEFAULT_OPTIONS = ['选项 1', '选项 2'];
const DAY_MS = 24 * 60 * 60 * 1000;

const toLocalDateTimeValue = (timestamp: number): string => {
  const date = new Date(timestamp);
  const timezoneOffset = date.getTimezoneOffset() * 60 * 1000;
  return new Date(timestamp - timezoneOffset).toISOString().slice(0, 16);
};

const parseLocalDateTimeValue = (value: string): number | undefined => {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return undefined;
  return parsed;
};

const ensurePkOptions = (options: string[]): string[] => {
  const nextOptions = options.slice(0, 2);
  while (nextOptions.length < 2) {
    nextOptions.push(`选项 ${nextOptions.length + 1}`);
  }
  return nextOptions;
};

export function CreatePollModal({ open, requestClose, onCreate }: CreatePollModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<PollMode>('single');
  const [options, setOptions] = useState<string[]>(DEFAULT_OPTIONS);
  const [maxSelections, setMaxSelections] = useState('2');
  const [showVoters, setShowVoters] = useState(true);
  const [expiresAtInput, setExpiresAtInput] = useState(toLocalDateTimeValue(Date.now() + DAY_MS));
  const [submitting, setSubmitting] = useState(false);
  const [statusText, setStatusText] = useState<string>();

  useEffect(() => {
    if (!open) return;

    setTitle('');
    setDescription('');
    setMode('single');
    setOptions(DEFAULT_OPTIONS);
    setMaxSelections('2');
    setShowVoters(true);
    setExpiresAtInput(toLocalDateTimeValue(Date.now() + DAY_MS));
    setStatusText(undefined);
    setSubmitting(false);
  }, [open]);

  const handleModeChange = (nextMode: PollMode) => {
    setMode(nextMode);
    setStatusText(undefined);

    if (nextMode === 'pk') {
      setOptions((current) => ensurePkOptions(current));
      setMaxSelections('1');
      return;
    }

    if (nextMode === 'single') {
      setMaxSelections('1');
      return;
    }

    setMaxSelections((current) => {
      const parsedCurrent = Number(current);
      return Number.isFinite(parsedCurrent) && parsedCurrent > 1 ? String(parsedCurrent) : '2';
    });
  };

  const handleOptionChange = (index: number, value: string) => {
    setOptions((current) =>
      current.map((option, optionIndex) => (optionIndex === index ? value : option))
    );
  };

  const handleRemoveOption = (index: number) => {
    setOptions((current) => current.filter((_, optionIndex) => optionIndex !== index));
  };

  const handleAddOption = () => {
    setOptions((current) => [...current, `选项 ${current.length + 1}`]);
  };

  const setQuickExpiry = (delta: number) => {
    setExpiresAtInput(toLocalDateTimeValue(Date.now() + delta));
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (evt) => {
    evt.preventDefault();

    const trimmedTitle = title.trim();
    const trimmedOptions = options.map((option) => option.trim()).filter((option) => option.length > 0);
    const expiresAt = expiresAtInput.trim() ? parseLocalDateTimeValue(expiresAtInput.trim()) : undefined;

    if (!trimmedTitle) {
      setStatusText('请先填写投票标题。');
      return;
    }

    if (trimmedOptions.length < 2) {
      setStatusText('至少需要 2 个有效选项。');
      return;
    }

    if (mode === 'pk' && trimmedOptions.length !== 2) {
      setStatusText('PK 投票必须保留 2 个选项。');
      return;
    }

    if (expiresAtInput.trim() && !expiresAt) {
      setStatusText('截止时间格式无效。');
      return;
    }

    if (expiresAt && expiresAt <= Date.now()) {
      setStatusText('截止时间必须晚于当前时间。');
      return;
    }

    const parsedMaxSelections = Number(maxSelections);
    const sanitizedMaxSelections =
      mode === 'multiple'
        ? Math.min(
            trimmedOptions.length,
            Math.max(1, Number.isFinite(parsedMaxSelections) ? Math.round(parsedMaxSelections) : 2)
          )
        : 1;

    setSubmitting(true);
    setStatusText(undefined);

    try {
      await onCreate({
        title: trimmedTitle,
        description: description.trim() || undefined,
        mode,
        options: trimmedOptions,
        maxSelections: sanitizedMaxSelections,
        showVoters,
        expiresAt,
      });
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '创建投票失败。');
      setSubmitting(false);
    }
  };

  return (
    <Overlay open={open} backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <Dialog
          variant="Surface"
          style={{
            width: 'calc(100vw - 32px)',
            maxWidth: toRem(640),
            maxHeight: '85vh',
          }}
        >
          <Box direction="Column" style={{ maxHeight: '85vh' }}>
            <Box alignItems="Center" gap="200" style={{ padding: config.space.S400 }}>
              <Box grow="Yes" direction="Column" gap="50">
                <Text size="H4">创建投票</Text>
                <Text size="T300" priority="300">
                  支持单选、多选和 PK 投票，会直接发送到当前房间。
                </Text>
              </Box>
              <Box shrink="No">
                <IconButton onClick={requestClose} variant="SurfaceVariant" size="300" radii="300">
                  <Icon src={Icons.Cross} />
                </IconButton>
              </Box>
            </Box>

            <Line variant="SurfaceVariant" size="300" />

            <Scroll size="300" hideTrack visibility="Hover">
              <Box
                as="form"
                direction="Column"
                gap="400"
                style={{ padding: config.space.S400 }}
                onSubmit={handleSubmit}
              >
                <Box direction="Column" gap="100">
                  <Text size="L400">投票标题</Text>
                  <Input
                    value={title}
                    onChange={(evt) => setTitle(evt.currentTarget.value)}
                    placeholder="例如：本周产品评审时间"
                    variant="Background"
                    outlined
                    required
                  />
                </Box>

                <Box direction="Column" gap="100">
                  <Text size="L400">补充说明</Text>
                  <textarea
                    value={description}
                    onChange={(evt) => setDescription(evt.currentTarget.value)}
                    rows={4}
                    placeholder="可以填写投票背景、说明、注意事项等。"
                    style={{
                      width: '100%',
                      resize: 'vertical',
                      borderRadius: 12,
                      border: '1px solid rgba(120, 120, 120, 0.22)',
                      padding: config.space.S300,
                      fontFamily: 'inherit',
                      background: 'transparent',
                    }}
                  />
                </Box>

                <Box direction="Column" gap="100">
                  <Text size="L400">投票形式</Text>
                  <Box gap="100" style={{ flexWrap: 'wrap' }}>
                    <Chip
                      variant={mode === 'single' ? 'Primary' : 'SurfaceVariant'}
                      radii="Pill"
                      outlined={mode !== 'single'}
                      onClick={() => handleModeChange('single')}
                    >
                      <Text size="B300">单选</Text>
                    </Chip>
                    <Chip
                      variant={mode === 'multiple' ? 'Primary' : 'SurfaceVariant'}
                      radii="Pill"
                      outlined={mode !== 'multiple'}
                      onClick={() => handleModeChange('multiple')}
                    >
                      <Text size="B300">多选</Text>
                    </Chip>
                    <Chip
                      variant={mode === 'pk' ? 'Primary' : 'SurfaceVariant'}
                      radii="Pill"
                      outlined={mode !== 'pk'}
                      onClick={() => handleModeChange('pk')}
                    >
                      <Text size="B300">PK</Text>
                    </Chip>
                  </Box>
                </Box>

                {mode === 'multiple' && (
                  <Box direction="Column" gap="100">
                    <Text size="L400">最多可选</Text>
                    <Input
                      type="number"
                      min="1"
                      max={String(Math.max(2, options.length))}
                      value={maxSelections}
                      onChange={(evt) => setMaxSelections(evt.currentTarget.value)}
                      variant="Background"
                      outlined
                    />
                  </Box>
                )}

                <Box direction="Column" gap="100">
                  <Text size="L400">截止时间</Text>
                  <Input
                    type="datetime-local"
                    value={expiresAtInput}
                    onChange={(evt) => setExpiresAtInput(evt.currentTarget.value)}
                    variant="Background"
                    outlined
                  />
                  <Box gap="100" style={{ flexWrap: 'wrap' }}>
                    <Chip radii="Pill" variant="SurfaceVariant" onClick={() => setQuickExpiry(DAY_MS)}>
                      <Text size="B300">1 天后</Text>
                    </Chip>
                    <Chip
                      radii="Pill"
                      variant="SurfaceVariant"
                      onClick={() => setQuickExpiry(3 * DAY_MS)}
                    >
                      <Text size="B300">3 天后</Text>
                    </Chip>
                    <Chip
                      radii="Pill"
                      variant="SurfaceVariant"
                      onClick={() => setQuickExpiry(7 * DAY_MS)}
                    >
                      <Text size="B300">7 天后</Text>
                    </Chip>
                    <Chip
                      radii="Pill"
                      variant="SurfaceVariant"
                      onClick={() => setExpiresAtInput('')}
                    >
                      <Text size="B300">不限时</Text>
                    </Chip>
                  </Box>
                </Box>

                <Box direction="Column" gap="100">
                  <Text size="L400">投票昵称</Text>
                  <Box gap="100" style={{ flexWrap: 'wrap' }}>
                    <Chip
                      variant={showVoters ? 'Primary' : 'SurfaceVariant'}
                      radii="Pill"
                      outlined={!showVoters}
                      onClick={() => setShowVoters(true)}
                    >
                      <Text size="B300">显示昵称</Text>
                    </Chip>
                    <Chip
                      variant={!showVoters ? 'Primary' : 'SurfaceVariant'}
                      radii="Pill"
                      outlined={showVoters}
                      onClick={() => setShowVoters(false)}
                    >
                      <Text size="B300">隐藏昵称</Text>
                    </Chip>
                  </Box>
                  <Text size="T200" priority="300">
                    隐藏后此客户端不会展示投票昵称，只显示票数。
                  </Text>
                </Box>

                <Box direction="Column" gap="100">
                  <Text size="L400">投票选项</Text>
                  <Box direction="Column" gap="200">
                    {options.map((option, index) => (
                      <Box key={`${index}-${mode}`} alignItems="Center" gap="200">
                        <Box grow="Yes">
                          <Input
                            value={option}
                            onChange={(evt) => handleOptionChange(index, evt.currentTarget.value)}
                            placeholder={`选项 ${index + 1}`}
                            variant="Background"
                            outlined
                          />
                        </Box>
                        <Box shrink="No">
                          <IconButton
                            type="button"
                            variant="SurfaceVariant"
                            size="300"
                            radii="300"
                            disabled={options.length <= 2 || mode === 'pk'}
                            onClick={() => handleRemoveOption(index)}
                          >
                            <Icon src={Icons.Cross} />
                          </IconButton>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                  <Box>
                    <Button
                      type="button"
                      variant="Secondary"
                      fill="Soft"
                      size="300"
                      radii="300"
                      outlined
                      disabled={mode === 'pk' || options.length >= POLL_MAX_OPTIONS}
                      onClick={handleAddOption}
                    >
                      <Text size="B300">{`新增选项 (${options.length}/${POLL_MAX_OPTIONS})`}</Text>
                    </Button>
                  </Box>
                </Box>

                {statusText && (
                  <Text size="T300" style={{ color: color.Critical.Main }}>
                    {statusText}
                  </Text>
                )}

                <Box justifyContent="End" gap="200">
                  <Button
                    type="button"
                    variant="Secondary"
                    fill="Soft"
                    size="300"
                    radii="300"
                    outlined
                    onClick={requestClose}
                    disabled={submitting}
                  >
                    <Text size="B300">取消</Text>
                  </Button>
                  <Button type="submit" variant="Primary" size="300" radii="300" disabled={submitting}>
                    <Text size="B300">{submitting ? '发送中...' : '发送投票'}</Text>
                    {submitting && <Spinner size="100" variant="Primary" fill="Solid" />}
                  </Button>
                </Box>
              </Box>
            </Scroll>
          </Box>
        </Dialog>
      </OverlayCenter>
    </Overlay>
  );
}
