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

const CN = {
  createPoll: '\u521b\u5efa\u6295\u7968',
  createHint:
    '\u652f\u6301\u5355\u9009\u3001\u591a\u9009\u548c PK \u6295\u7968\uff0c\u4f1a\u76f4\u63a5\u53d1\u9001\u5230\u5f53\u524d\u623f\u95f4\u3002',
  title: '\u6295\u7968\u6807\u9898',
  titlePlaceholder: '\u4f8b\u5982\uff1a\u672c\u5468\u4ea7\u54c1\u8bc4\u5ba1\u65f6\u95f4',
  description: '\u8865\u5145\u8bf4\u660e',
  descriptionPlaceholder:
    '\u53ef\u4ee5\u586b\u5199\u6295\u7968\u80cc\u666f\u3001\u8bf4\u660e\u3001\u6ce8\u610f\u4e8b\u9879\u7b49\u3002',
  mode: '\u6295\u7968\u5f62\u5f0f',
  single: '\u5355\u9009',
  multiple: '\u591a\u9009',
  maxSelections: '\u6700\u591a\u53ef\u9009',
  expiresAt: '\u622a\u6b62\u65f6\u95f4',
  noExpiry: '\u4e0d\u9650\u65f6',
  showVotes: '\u6295\u7968\u663e\u540d',
  showVoters: '\u663e\u793a\u6635\u79f0',
  hideVoters: '\u9690\u85cf\u6635\u79f0',
  showVotesHint:
    '\u9690\u85cf\u540e\u672c\u5ba2\u6237\u7aef\u4e0d\u4f1a\u5c55\u793a\u6295\u7968\u6635\u79f0\uff0c\u53ea\u663e\u793a\u7968\u6570\u3002',
  options: '\u6295\u7968\u9009\u9879',
  option: '\u9009\u9879',
  addOption: '\u65b0\u589e\u9009\u9879',
  cancel: '\u53d6\u6d88',
  sending: '\u53d1\u9001\u4e2d...',
  sendPoll: '\u53d1\u9001\u6295\u7968',
  needTitle: '\u8bf7\u5148\u586b\u5199\u6295\u7968\u6807\u9898\u3002',
  needOptions: '\u81f3\u5c11\u9700\u8981 2 \u4e2a\u6709\u6548\u9009\u9879\u3002',
  needPkOptions: 'PK \u6295\u7968\u5fc5\u987b\u4fdd\u7559 2 \u4e2a\u9009\u9879\u3002',
  invalidExpiresAt: '\u622a\u6b62\u65f6\u95f4\u683c\u5f0f\u65e0\u6548\u3002',
  expiresAtPast: '\u622a\u6b62\u65f6\u95f4\u5fc5\u987b\u665a\u4e8e\u5f53\u524d\u65f6\u95f4\u3002',
  createFailed: '\u521b\u5efa\u6295\u7968\u5931\u8d25\u3002',
} as const;

const DEFAULT_OPTIONS = [`${CN.option} 1`, `${CN.option} 2`];
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
    nextOptions.push(`${CN.option} ${nextOptions.length + 1}`);
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
    setOptions((current) => [...current, `${CN.option} ${current.length + 1}`]);
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
      setStatusText(CN.needTitle);
      return;
    }

    if (trimmedOptions.length < 2) {
      setStatusText(CN.needOptions);
      return;
    }

    if (mode === 'pk' && trimmedOptions.length !== 2) {
      setStatusText(CN.needPkOptions);
      return;
    }

    if (expiresAtInput.trim() && !expiresAt) {
      setStatusText(CN.invalidExpiresAt);
      return;
    }

    if (expiresAt && expiresAt <= Date.now()) {
      setStatusText(CN.expiresAtPast);
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
      setStatusText(error instanceof Error ? error.message : CN.createFailed);
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
                <Text size="H4">{CN.createPoll}</Text>
                <Text size="T300" priority="300">
                  {CN.createHint}
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
                  <Text size="L400">{CN.title}</Text>
                  <Input
                    size="500"
                    value={title}
                    onChange={(evt) => setTitle(evt.currentTarget.value)}
                    placeholder={CN.titlePlaceholder}
                    variant="Background"
                    outlined
                    required
                    style={{ width: '100%', minWidth: 0 }}
                  />
                </Box>

                <Box direction="Column" gap="100">
                  <Text size="L400">{CN.description}</Text>
                  <textarea
                    value={description}
                    onChange={(evt) => setDescription(evt.currentTarget.value)}
                    rows={4}
                    placeholder={CN.descriptionPlaceholder}
                    style={{
                      width: '100%',
                      minWidth: 0,
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
                  <Text size="L400">{CN.mode}</Text>
                  <Box gap="100" style={{ flexWrap: 'wrap' }}>
                    <Chip
                      variant={mode === 'single' ? 'Primary' : 'SurfaceVariant'}
                      radii="Pill"
                      outlined={mode !== 'single'}
                      onClick={() => handleModeChange('single')}
                    >
                      <Text size="B300">{CN.single}</Text>
                    </Chip>
                    <Chip
                      variant={mode === 'multiple' ? 'Primary' : 'SurfaceVariant'}
                      radii="Pill"
                      outlined={mode !== 'multiple'}
                      onClick={() => handleModeChange('multiple')}
                    >
                      <Text size="B300">{CN.multiple}</Text>
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
                    <Text size="L400">{CN.maxSelections}</Text>
                    <Input
                      size="500"
                      type="number"
                      min="1"
                      max={String(Math.max(2, options.length))}
                      value={maxSelections}
                      onChange={(evt) => setMaxSelections(evt.currentTarget.value)}
                      variant="Background"
                      outlined
                      style={{ width: '100%', minWidth: 0 }}
                    />
                  </Box>
                )}

                <Box direction="Column" gap="100">
                  <Text size="L400">{CN.expiresAt}</Text>
                  <Input
                    size="500"
                    type="datetime-local"
                    value={expiresAtInput}
                    onChange={(evt) => setExpiresAtInput(evt.currentTarget.value)}
                    variant="Background"
                    outlined
                    style={{ width: '100%', minWidth: 0 }}
                  />
                  <Box gap="100" style={{ flexWrap: 'wrap' }}>
                    <Chip radii="Pill" variant="SurfaceVariant" onClick={() => setQuickExpiry(DAY_MS)}>
                      <Text size="B300">{'\u0031 \u5929\u540e'}</Text>
                    </Chip>
                    <Chip
                      radii="Pill"
                      variant="SurfaceVariant"
                      onClick={() => setQuickExpiry(3 * DAY_MS)}
                    >
                      <Text size="B300">{'\u0033 \u5929\u540e'}</Text>
                    </Chip>
                    <Chip
                      radii="Pill"
                      variant="SurfaceVariant"
                      onClick={() => setQuickExpiry(7 * DAY_MS)}
                    >
                      <Text size="B300">{'\u0037 \u5929\u540e'}</Text>
                    </Chip>
                    <Chip
                      radii="Pill"
                      variant="SurfaceVariant"
                      onClick={() => setExpiresAtInput('')}
                    >
                      <Text size="B300">{CN.noExpiry}</Text>
                    </Chip>
                  </Box>
                </Box>

                <Box direction="Column" gap="100">
                  <Text size="L400">{CN.showVotes}</Text>
                  <Box gap="100" style={{ flexWrap: 'wrap' }}>
                    <Chip
                      variant={showVoters ? 'Primary' : 'SurfaceVariant'}
                      radii="Pill"
                      outlined={!showVoters}
                      onClick={() => setShowVoters(true)}
                    >
                      <Text size="B300">{CN.showVoters}</Text>
                    </Chip>
                    <Chip
                      variant={!showVoters ? 'Primary' : 'SurfaceVariant'}
                      radii="Pill"
                      outlined={showVoters}
                      onClick={() => setShowVoters(false)}
                    >
                      <Text size="B300">{CN.hideVoters}</Text>
                    </Chip>
                  </Box>
                  <Text size="T200" priority="300">
                    {CN.showVotesHint}
                  </Text>
                </Box>

                <Box direction="Column" gap="100">
                  <Text size="L400">{CN.options}</Text>
                  <Box direction="Column" gap="200" style={{ width: '100%', minWidth: 0 }}>
                    {options.map((option, index) => (
                      <Box
                        key={`${index}-${mode}`}
                        alignItems="Center"
                        gap="200"
                        style={{ width: '100%', minWidth: 0 }}
                      >
                        <Box grow="Yes" style={{ width: '100%', minWidth: 0 }}>
                          <Input
                            size="500"
                            value={option}
                            onChange={(evt) => handleOptionChange(index, evt.currentTarget.value)}
                            placeholder={`${CN.option} ${index + 1}`}
                            variant="Background"
                            outlined
                            style={{ width: '100%', minWidth: 0 }}
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
                      <Text size="B300">{`${CN.addOption} (${options.length}/${POLL_MAX_OPTIONS})`}</Text>
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
                    <Text size="B300">{CN.cancel}</Text>
                  </Button>
                  <Button type="submit" variant="Primary" size="300" radii="300" disabled={submitting}>
                    <Text size="B300">{submitting ? CN.sending : CN.sendPoll}</Text>
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
