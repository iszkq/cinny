import React, { FormEventHandler, MouseEventHandler, useEffect, useState } from 'react';
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
import { CreatePollInput, CreatePollMode, POLL_MAX_OPTIONS } from '../../utils/polls';

type CreatePollModalProps = {
  open: boolean;
  requestClose: () => void;
  onCreate: (input: CreatePollInput) => Promise<void>;
};

const CN = {
  createPoll: '\u521b\u5efa\u6295\u7968',
  createHint:
    '\u652f\u6301\u5355\u9009\u548c\u591a\u9009\u6295\u7968\uff0c\u53d1\u9001\u540e\u9700\u7531\u53d1\u8d77\u8005\u624b\u52a8\u7ed3\u675f\u6295\u7968\u3002',
  title: '\u6295\u7968\u6807\u9898',
  titlePlaceholder: '\u4f8b\u5982\uff1a\u672c\u5468\u4ea7\u54c1\u8bc4\u5ba1\u65f6\u95f4',
  description: '\u8865\u5145\u8bf4\u660e',
  descriptionPlaceholder:
    '\u53ef\u4ee5\u586b\u5199\u6295\u7968\u80cc\u666f\u3001\u8bf4\u660e\u3001\u6ce8\u610f\u4e8b\u9879\u7b49\u3002',
  mode: '\u6295\u7968\u5f62\u5f0f',
  single: '\u5355\u9009',
  multiple: '\u591a\u9009',
  maxSelections: '\u6700\u591a\u53ef\u9009',
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
  createFailed: '\u521b\u5efa\u6295\u7968\u5931\u8d25\u3002',
} as const;

const DEFAULT_OPTIONS = [`${CN.option} 1`, `${CN.option} 2`];

export function CreatePollModal({ open, requestClose, onCreate }: CreatePollModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<CreatePollMode>('single');
  const [options, setOptions] = useState<string[]>(DEFAULT_OPTIONS);
  const [maxSelections, setMaxSelections] = useState('2');
  const [showVoters, setShowVoters] = useState(true);
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
    setStatusText(undefined);
    setSubmitting(false);
  }, [open]);

  const handleModeChange = (nextMode: CreatePollMode) => {
    setMode(nextMode);
    setStatusText(undefined);

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

  const preventImplicitSubmit = (callback: () => void): MouseEventHandler =>
    (evt) => {
      evt.preventDefault();
      callback();
    };

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (evt) => {
    evt.preventDefault();

    const nativeSubmitEvent = evt.nativeEvent as SubmitEvent;
    const submitter = nativeSubmitEvent.submitter as HTMLElement | null;
    if (submitter?.getAttribute('data-poll-submit') !== 'true') {
      return;
    }

    const trimmedTitle = title.trim();
    const trimmedOptions = options.map((option) => option.trim()).filter((option) => option.length > 0);

    if (!trimmedTitle) {
      setStatusText(CN.needTitle);
      return;
    }

    if (trimmedOptions.length < 2) {
      setStatusText(CN.needOptions);
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
                      onClick={preventImplicitSubmit(() => handleModeChange('single'))}
                    >
                      <Text size="B300">{CN.single}</Text>
                    </Chip>
                    <Chip
                      variant={mode === 'multiple' ? 'Primary' : 'SurfaceVariant'}
                      radii="Pill"
                      outlined={mode !== 'multiple'}
                      onClick={preventImplicitSubmit(() => handleModeChange('multiple'))}
                    >
                      <Text size="B300">{CN.multiple}</Text>
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
                  <Text size="L400">{CN.showVotes}</Text>
                  <Box gap="100" style={{ flexWrap: 'wrap' }}>
                    <Chip
                      variant={showVoters ? 'Primary' : 'SurfaceVariant'}
                      radii="Pill"
                      outlined={!showVoters}
                      onClick={preventImplicitSubmit(() => setShowVoters(true))}
                    >
                      <Text size="B300">{CN.showVoters}</Text>
                    </Chip>
                    <Chip
                      variant={!showVoters ? 'Primary' : 'SurfaceVariant'}
                      radii="Pill"
                      outlined={showVoters}
                      onClick={preventImplicitSubmit(() => setShowVoters(false))}
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
                            disabled={options.length <= 2}
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
                      disabled={options.length >= POLL_MAX_OPTIONS}
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
                  <Button
                    type="submit"
                    data-poll-submit="true"
                    variant="Primary"
                    size="300"
                    radii="300"
                    disabled={submitting}
                  >
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
