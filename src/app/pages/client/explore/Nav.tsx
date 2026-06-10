import React, { FormEventHandler, useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Box,
  Button,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Input,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Scroll,
  Spinner,
  Text,
  color,
  config,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Page, PageContent, PageContentCenter, PageHeader } from '../../../components/page';
import { BackRouteHandler } from '../../../components/BackRouteHandler';
import { useAccountData } from '../../../hooks/useAccountData';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import {
  isCompactScreenSize,
  isDesktopLikeScreenSize,
  ScreenSize,
  useScreenSizeContext,
} from '../../../hooks/useScreenSize';
import {
  AccountDataEvent,
  CinnyExploreNavCard,
  CinnyExploreNavSection,
  CinnyExploreSourcesContent,
} from '../../../../types/matrix/accountData';
import {
  getExploreCustomSourceById,
  removeExploreNavCard,
  removeExploreNavSection,
  upsertExploreNavCard,
  upsertExploreNavSection,
} from './customSources';
import { getExploreFeaturedPath } from '../../pathUtils';
import { stopPropagation } from '../../../utils/keyboard';
import * as css from './style.css';

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return '保存失败，请稍后重试。';
};

const fullWidthStyle = {
  width: '100%',
  maxWidth: '100%',
  minWidth: 0,
  boxSizing: 'border-box' as const,
};

const fieldGroupStyle = {
  ...fullWidthStyle,
  alignSelf: 'stretch' as const,
};

const helperTextStyle = {
  whiteSpace: 'normal' as const,
  wordBreak: 'break-word' as const,
  overflowWrap: 'anywhere' as const,
};

const textAreaStyle = {
  ...fullWidthStyle,
  resize: 'vertical' as const,
  minHeight: '6rem',
  padding: config.space.S300,
  borderRadius: config.radii.R300,
  border: '1px solid rgba(120, 120, 120, 0.22)',
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
};

const dialogStyle = (width: string) => ({
  width: 'calc(100vw - 1.5rem)',
  maxWidth: width,
  maxHeight: 'calc(100vh - 1.5rem)',
  minWidth: 0,
  boxSizing: 'border-box' as const,
  overflow: 'hidden' as const,
});

const dialogFormStyle = {
  minWidth: 0,
  padding: config.space.S400,
  boxSizing: 'border-box' as const,
};

type SectionDialogProps = {
  open: boolean;
  initialSection?: CinnyExploreNavSection;
  onClose: () => void;
  onSave: (title: string) => Promise<void>;
};

function SectionDialog({ open, initialSection, onClose, onSave }: SectionDialogProps) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(initialSection?.title ?? '');
    setError(undefined);
    setSaving(false);
  }, [initialSection, open]);

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (evt) => {
    evt.preventDefault();
    setError(undefined);
    setSaving(true);

    try {
      await onSave(title);
      onClose();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Overlay open={open} backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            clickOutsideDeactivates: true,
            onDeactivate: onClose,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Dialog variant="Surface" style={dialogStyle('26rem')}>
              <Header
                style={{
                  padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
                  borderBottomWidth: config.borderWidth.B300,
                }}
                variant="Surface"
                size="500"
              >
                <Box grow="Yes">
                  <Text size="H4">{initialSection ? '编辑分组' : '添加分组'}</Text>
                </Box>
                <IconButton size="300" onClick={onClose} radii="300">
                  <Icon src={Icons.Cross} />
                </IconButton>
              </Header>
              <Scroll size="300" hideTrack visibility="Hover">
                <Box
                  as="form"
                  onSubmit={handleSubmit}
                  style={dialogFormStyle}
                  direction="Column"
                  gap="300"
                >
                  <Box direction="Column" gap="100" style={fieldGroupStyle}>
                    <Text size="L400">分组名称</Text>
                    <Input
                      autoFocus
                      required
                      variant="Background"
                      value={title}
                      onChange={(evt) => setTitle(evt.currentTarget.value)}
                      style={fullWidthStyle}
                      placeholder="例如：常用工具"
                    />
                  </Box>

                  {error && (
                    <Text style={{ ...helperTextStyle, color: color.Critical.Main }} size="T300">
                      {error}
                    </Text>
                  )}

                  <Box style={fullWidthStyle} direction="Column">
                    <Button
                      type="submit"
                      variant="Primary"
                      disabled={saving}
                      before={
                        saving ? <Spinner fill="Solid" variant="Primary" size="200" /> : undefined
                      }
                    >
                      <Text size="B400">{initialSection ? '保存分组' : '创建分组'}</Text>
                    </Button>
                  </Box>
                </Box>
              </Scroll>
            </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}

type CardDialogProps = {
  open: boolean;
  initialCard?: CinnyExploreNavCard;
  onClose: () => void;
  onSave: (payload: {
    title: string;
    url: string;
    description?: string;
    iconUrl?: string;
    tags?: string[];
  }) => Promise<void>;
};

function CardDialog({ open, initialCard, onClose, onSave }: CardDialogProps) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(initialCard?.title ?? '');
    setUrl(initialCard?.url ?? '');
    setDescription(initialCard?.description ?? '');
    setIconUrl(initialCard?.iconUrl ?? '');
    setTagsText(initialCard?.tags?.join(', ') ?? '');
    setError(undefined);
    setSaving(false);
  }, [initialCard, open]);

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (evt) => {
    evt.preventDefault();
    setError(undefined);
    setSaving(true);

    try {
      await onSave({
        title,
        url,
        description,
        iconUrl,
        tags: tagsText
          .split(',')
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
      });
      onClose();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Overlay open={open} backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            clickOutsideDeactivates: true,
            onDeactivate: onClose,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Dialog variant="Surface" style={dialogStyle('30rem')}>
              <Header
                style={{
                  padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
                  borderBottomWidth: config.borderWidth.B300,
                }}
                variant="Surface"
                size="500"
              >
                <Box grow="Yes">
                  <Text size="H4">{initialCard ? '编辑卡片' : '添加卡片'}</Text>
                </Box>
                <IconButton size="300" onClick={onClose} radii="300">
                  <Icon src={Icons.Cross} />
                </IconButton>
              </Header>
              <Scroll size="300" hideTrack visibility="Hover">
                <Box
                  as="form"
                  onSubmit={handleSubmit}
                  style={dialogFormStyle}
                  direction="Column"
                  gap="300"
                >
                  <Box direction="Column" gap="100" style={fieldGroupStyle}>
                    <Text size="L400">标题</Text>
                    <Input
                      autoFocus
                      required
                      variant="Background"
                      value={title}
                      onChange={(evt) => setTitle(evt.currentTarget.value)}
                      style={fullWidthStyle}
                      placeholder="例如：Google 翻译"
                    />
                  </Box>

                  <Box direction="Column" gap="100" style={fieldGroupStyle}>
                    <Text size="L400">链接地址</Text>
                    <Input
                      required
                      variant="Background"
                      value={url}
                      onChange={(evt) => setUrl(evt.currentTarget.value)}
                      style={fullWidthStyle}
                      placeholder="例如：https://translate.google.com"
                    />
                  </Box>

                  <Box direction="Column" gap="100" style={fieldGroupStyle}>
                    <Text size="L400">描述（可选）</Text>
                    <textarea
                      value={description}
                      onChange={(evt) => setDescription(evt.currentTarget.value)}
                      rows={4}
                      style={textAreaStyle}
                    />
                  </Box>

                  <Box direction="Column" gap="100" style={fieldGroupStyle}>
                    <Text size="L400">图标链接（可选）</Text>
                    <Input
                      variant="Background"
                      value={iconUrl}
                      onChange={(evt) => setIconUrl(evt.currentTarget.value)}
                      style={fullWidthStyle}
                      placeholder="例如：https://example.com/logo.png"
                    />
                  </Box>

                  <Box direction="Column" gap="100" style={fieldGroupStyle}>
                    <Text size="L400">标签（可选）</Text>
                    <Input
                      variant="Background"
                      value={tagsText}
                      onChange={(evt) => setTagsText(evt.currentTarget.value)}
                      style={fullWidthStyle}
                      placeholder="用逗号分隔，例如：翻译, 工具"
                    />
                  </Box>

                  {error && (
                    <Text style={{ ...helperTextStyle, color: color.Critical.Main }} size="T300">
                      {error}
                    </Text>
                  )}

                  <Box style={fullWidthStyle} direction="Column">
                    <Button
                      type="submit"
                      variant="Primary"
                      disabled={saving}
                      before={
                        saving ? <Spinner fill="Solid" variant="Primary" size="200" /> : undefined
                      }
                    >
                      <Text size="B400">{initialCard ? '保存卡片' : '创建卡片'}</Text>
                    </Button>
                  </Box>
                </Box>
              </Scroll>
            </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}

type ExploreNavCardItemProps = {
  sectionId: string;
  card: CinnyExploreNavCard;
  busy: boolean;
  onEdit: (sectionId: string, card: CinnyExploreNavCard) => void;
  onRemove: (sectionId: string, cardId: string) => void;
};

function ExploreNavCardItem({
  sectionId,
  card,
  busy,
  onEdit,
  onRemove,
}: ExploreNavCardItemProps) {
  const visibleTags = card.tags?.slice(0, 2) ?? [];
  const hiddenTagCount = (card.tags?.length ?? 0) - visibleTags.length;
  const hasTags = visibleTags.length > 0 || hiddenTagCount > 0;
  const showDescription =
    !!card.description && card.description.trim() !== card.title.trim();

  return (
    <Box className={css.ExploreNavCard} direction="Column">
      <Box className={css.ExploreNavCardHead}>
        <a
          className={css.ExploreNavCardButton}
          href={card.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Box className={css.ExploreNavCardMain}>
            <Box className={css.ExploreNavCardAvatarShell} alignItems="Center" justifyContent="Center">
              <Avatar size="300" radii="400">
                {card.iconUrl ? (
                  <AvatarImage src={card.iconUrl} alt={card.title} />
                ) : (
                  <AvatarFallback>
                    <Text size="L400">{card.title.slice(0, 1).toUpperCase()}</Text>
                  </AvatarFallback>
                )}
              </Avatar>
            </Box>
            <Box className={css.ExploreNavCardContent}>
              <Box className={css.ExploreNavCardTitleBlock}>
                <Text size="H5" truncate>
                  {card.title}
                </Text>

                {hasTags && (
                  <Box className={css.ExploreNavTagRail}>
                    {visibleTags.map((tag) => (
                      <span key={tag} className={css.ExploreNavTag}>
                        {tag}
                      </span>
                    ))}
                    {hiddenTagCount > 0 && (
                      <span className={css.ExploreNavTag}>{`+${hiddenTagCount}`}</span>
                    )}
                  </Box>
                )}
              </Box>

              {showDescription && (
                <Text
                  size="T300"
                  priority="300"
                  className={css.ExploreNavCardDescription}
                  style={helperTextStyle}
                >
                  {card.description}
                </Text>
              )}
            </Box>
          </Box>
        </a>

        <Box className={css.ExploreNavCardFooter} alignItems="Center" justifyContent="End" gap="100">
          <IconButton
            type="button"
            size="300"
            fill="Soft"
            radii="300"
            aria-label="编辑卡片"
            title="编辑卡片"
            onClick={() => onEdit(sectionId, card)}
          >
            <Icon size="100" src={Icons.Pencil} />
          </IconButton>
          <IconButton
            type="button"
            size="300"
            fill="Soft"
            radii="300"
            aria-label="删除卡片"
            title="删除卡片"
            disabled={busy}
            onClick={() => onRemove(sectionId, card.id)}
          >
            {busy ? <Spinner size="100" variant="Secondary" /> : <Icon size="100" src={Icons.Delete} />}
          </IconButton>
        </Box>
      </Box>
    </Box>
  );
}

export function ExploreNavView() {
  const mx = useMatrixClient();
  const { navId } = useParams();
  const navigate = useNavigate();
  const screenSize = useScreenSizeContext();
  const showBackButton = !isDesktopLikeScreenSize(screenSize);
  const [sectionDialogOpen, setSectionDialogOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<CinnyExploreNavSection>();
  const [cardDialogState, setCardDialogState] = useState<{
    sectionId: string;
    card?: CinnyExploreNavCard;
  }>();
  const [busySectionId, setBusySectionId] = useState<string>();
  const [busyCardKey, setBusyCardKey] = useState<string>();
  const [actionError, setActionError] = useState<string>();

  const sourceEvent = useAccountData(AccountDataEvent.CinnyExploreSources);
  const source = useMemo(
    () =>
      getExploreCustomSourceById(
        sourceEvent?.getContent<CinnyExploreSourcesContent>(),
        navId
      ),
    [sourceEvent, navId]
  );

  const sections = source?.kind === 'nav' ? source.navSections ?? [] : [];

  const closeSectionDialog = () => {
    setSectionDialogOpen(false);
    setEditingSection(undefined);
  };

  const closeCardDialog = () => {
    setCardDialogState(undefined);
  };

  const handleSaveSection = async (title: string) => {
    if (!source || source.kind !== 'nav') return;

    await upsertExploreNavSection(mx, source.id, {
      id: editingSection?.id,
      title,
    });
  };

  const handleDeleteSection = async (sectionId: string) => {
    if (!source || source.kind !== 'nav') return;

    setActionError(undefined);
    setBusySectionId(sectionId);
    try {
      await removeExploreNavSection(mx, source.id, sectionId);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setBusySectionId(undefined);
    }
  };

  const handleSaveCard = async (payload: {
    title: string;
    url: string;
    description?: string;
    iconUrl?: string;
    tags?: string[];
  }) => {
    if (!source || source.kind !== 'nav' || !cardDialogState) return;

    await upsertExploreNavCard(mx, source.id, cardDialogState.sectionId, {
      id: cardDialogState.card?.id,
      ...payload,
    });
  };

  const handleDeleteCard = async (sectionId: string, cardId: string) => {
    if (!source || source.kind !== 'nav') return;

    const busyKey = `${sectionId}:${cardId}`;
    setActionError(undefined);
    setBusyCardKey(busyKey);
    try {
      await removeExploreNavCard(mx, source.id, sectionId, cardId);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setBusyCardKey(undefined);
    }
  };

  if (!source || source.kind !== 'nav') {
    return (
      <Page>
        <Box
          grow="Yes"
          direction="Column"
          justifyContent="Center"
          alignItems="Center"
          gap="300"
          style={{ padding: config.space.S400 }}
        >
          <Box
            className={css.RoomsInfoCard}
            direction="Column"
            justifyContent="Center"
            alignItems="Center"
            gap="200"
          >
            <Icon size="400" src={Icons.Info} />
            <Text size="L400" align="Center">
              没有找到这个导航站
            </Text>
            <Text size="T300" align="Center" priority="300" style={helperTextStyle}>
              它可能已经被删除，或者还没有同步到当前设备。
            </Text>
          </Box>
          <Button
            variant="Secondary"
            fill="Soft"
            size="300"
            onClick={() => navigate(getExploreFeaturedPath(), { replace: true })}
          >
            <Text size="B300">返回探索页</Text>
          </Button>
        </Box>
      </Page>
    );
  }

  return (
    <Page>
      <SectionDialog
        open={sectionDialogOpen}
        initialSection={editingSection}
        onClose={closeSectionDialog}
        onSave={handleSaveSection}
      />
      <CardDialog
        open={!!cardDialogState}
        initialCard={cardDialogState?.card}
        onClose={closeCardDialog}
        onSave={handleSaveCard}
      />

      <PageHeader balance={isCompactScreenSize(screenSize)}>
        <Box grow="Yes" basis="No">
          {showBackButton && (
            <BackRouteHandler>
              {(onBack) => (
                <IconButton onClick={onBack}>
                  <Icon src={Icons.ArrowLeft} />
                </IconButton>
              )}
            </BackRouteHandler>
          )}
        </Box>
        <Box grow="Yes" direction="Column" alignItems="Center" gap="100">
          <Text size="H3" truncate>
            {source.title}
          </Text>
          {source.value && (
            <Text size="T200" priority="300" truncate>
              {source.value}
            </Text>
          )}
        </Box>
        <Box grow="Yes" basis="No" justifyContent="End" gap="100" wrap="Wrap">
          <Button
            variant="Secondary"
            fill="Soft"
            size="300"
            before={<Icon size="100" src={Icons.Plus} />}
            onClick={() => {
              setEditingSection(undefined);
              setSectionDialogOpen(true);
            }}
          >
            <Text size="B300">添加分组</Text>
          </Button>
        </Box>
      </PageHeader>

      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <PageContentCenter>
              <Box className={css.ExploreNavCanvas} direction="Column" gap="500">
                {actionError && (
                  <Text size="T300" style={{ ...helperTextStyle, color: color.Critical.Main }}>
                    {actionError}
                  </Text>
                )}

                {sections.length === 0 ? (
                  <Box
                    className={css.RoomsInfoCard}
                    direction="Column"
                    justifyContent="Center"
                    alignItems="Center"
                    gap="200"
                  >
                    <Icon size="400" src={Icons.Link} />
                    <Text size="L400" align="Center">
                      这里还没有导航卡片
                    </Text>
                    <Text
                      size="T300"
                      align="Center"
                      priority="300"
                      style={helperTextStyle}
                    >
                      先创建一个分组，再把常用链接卡片放进去。
                    </Text>
                    <Button
                      variant="Secondary"
                      fill="Soft"
                      size="300"
                      onClick={() => {
                        setEditingSection(undefined);
                        setSectionDialogOpen(true);
                      }}
                    >
                      <Text size="B300">创建第一个分组</Text>
                    </Button>
                  </Box>
                ) : (
                  sections.map((section) => (
                    <Box
                      key={section.id}
                      className={css.ExploreNavSection}
                      direction="Column"
                      gap="300"
                    >
                      <Box className={css.ExploreNavSectionHeader}>
                        <Box className={css.ExploreNavSectionMeta}>
                          <Text size="H4" style={helperTextStyle}>
                            {section.title}
                          </Text>
                          <Text size="T200" priority="300">
                            {`${section.cards.length} 张卡片`}
                          </Text>
                        </Box>
                        <Box className={css.ExploreNavSectionActions}>
                          <Button
                            size="300"
                            variant="Secondary"
                            fill="Soft"
                            before={<Icon size="100" src={Icons.Plus} />}
                            onClick={() => setCardDialogState({ sectionId: section.id })}
                          >
                            <Text size="B300">添加卡片</Text>
                          </Button>
                          <Button
                            size="300"
                            variant="Secondary"
                            fill="Soft"
                            onClick={() => {
                              setEditingSection(section);
                              setSectionDialogOpen(true);
                            }}
                          >
                            <Text size="B300">编辑分组</Text>
                          </Button>
                          <Button
                            size="300"
                            variant="Secondary"
                            fill="Soft"
                            disabled={busySectionId === section.id}
                            onClick={() => handleDeleteSection(section.id)}
                          >
                            <Text size="B300">
                              {busySectionId === section.id ? '删除中...' : '删除分组'}
                            </Text>
                          </Button>
                        </Box>
                      </Box>

                      {section.cards.length > 0 ? (
                        <div className={css.ExploreNavGrid}>
                          {section.cards.map((card) => (
                            <ExploreNavCardItem
                              key={card.id}
                              sectionId={section.id}
                              card={card}
                              busy={busyCardKey === `${section.id}:${card.id}`}
                              onEdit={(sectionId, currentCard) =>
                                setCardDialogState({ sectionId, card: currentCard })
                              }
                              onRemove={handleDeleteCard}
                            />
                          ))}
                        </div>
                      ) : (
                        <Box
                          className={css.RoomsInfoCard}
                          direction="Column"
                          justifyContent="Center"
                          alignItems="Center"
                          gap="200"
                        >
                          <Icon size="300" src={Icons.Info} />
                          <Text size="T300" align="Center" style={helperTextStyle}>
                            这个分组还没有卡片。
                          </Text>
                        </Box>
                      )}
                    </Box>
                  ))
                )}
              </Box>
            </PageContentCenter>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
