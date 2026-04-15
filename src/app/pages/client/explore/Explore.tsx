import React, { FormEventHandler, MouseEventHandler, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FocusTrap from 'focus-trap-react';
import {
  Avatar,
  Box,
  Button,
  Chip,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Input,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Spinner,
  Text,
  color,
  config,
} from 'folds';
import {
  NavCategory,
  NavCategoryHeader,
  NavItem,
  NavItemContent,
  NavLink,
} from '../../../components/nav';
import {
  getExploreFeaturedPath,
  getExploreNavPath,
  getExploreServerPath,
  getExploreWebPath,
} from '../../pathUtils';
import { useClientConfig } from '../../../hooks/useClientConfig';
import {
  useExploreFeaturedSelected,
  useExploreNavSourceId,
  useExploreServer,
  useExploreWebSourceId,
} from '../../../hooks/router/useExploreSelected';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { getMxIdServer } from '../../../utils/matrix';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { useNavToActivePathMapper } from '../../../hooks/useNavToActivePathMapper';
import { PageNav, PageNavContent, PageNavHeader } from '../../../components/page';
import { stopPropagation } from '../../../utils/keyboard';
import { useAccountData } from '../../../hooks/useAccountData';
import {
  AccountDataEvent,
  CinnyExploreSource,
  CinnyExploreSourceKind,
  CinnyExploreSourcesContent,
} from '../../../../types/matrix/accountData';
import {
  getExploreCustomSources,
  normalizeExploreServerAddress,
  removeExploreCustomSource,
  upsertExploreCustomSource,
} from './customSources';

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return '保存失败，请稍后重试。';
};

const openExternalUrl = (url: string) => {
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => link.remove(), 0);
};

const fullWidthStyle = {
  width: '100%',
  minWidth: 0,
};

const helperTextStyle = {
  whiteSpace: 'normal' as const,
  wordBreak: 'break-word' as const,
  overflowWrap: 'anywhere' as const,
};

const getSourceIcon = (kind: CinnyExploreSourceKind, selected: boolean) => {
  if (kind === 'server') {
    return <Icon src={Icons.Server} size="100" filled={selected} />;
  }

  if (kind === 'nav') {
    return <Icon src={Icons.Space} size="100" filled={selected} />;
  }

  return <Icon src={Icons.Link} size="100" filled={selected} />;
};

const getSourceRoute = (source: CinnyExploreSource): string => {
  if (source.kind === 'server') {
    return getExploreServerPath(source.value);
  }

  if (source.kind === 'nav') {
    return getExploreNavPath(source.id);
  }

  return getExploreWebPath(source.id);
};

const getSourceSubtitle = (source: CinnyExploreSource): string => {
  if (source.kind === 'nav') {
    const sectionCount = source.navSections?.length ?? 0;
    const cardCount =
      source.navSections?.reduce((count, section) => count + section.cards.length, 0) ?? 0;

    if (source.value) {
      return source.value;
    }

    return `${sectionCount} 个分组，${cardCount} 张卡片`;
  }

  if (source.kind === 'web' && source.webOpenMode === 'external') {
    return '点击后将直接在浏览器打开';
  }

  return source.value;
};

function AddExploreSource({ builtInServers }: { builtInServers: Set<string> }) {
  const mx = useMatrixClient();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState(false);
  const [sourceKind, setSourceKind] = useState<CinnyExploreSourceKind>('server');
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [validationError, setValidationError] = useState<string>();

  const [saveState, saveSource] = useAsyncCallback(
    async (kind: CinnyExploreSourceKind, nextTitle: string, nextValue: string) =>
      upsertExploreCustomSource(mx, {
        kind,
        title: nextTitle,
        value: nextValue,
      })
  );

  const closeDialog = () => {
    setDialog(false);
    setSourceKind('server');
    setTitle('');
    setValue('');
    setValidationError(undefined);
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    setValidationError(undefined);

    if (sourceKind === 'nav' && !title.trim()) {
      setValidationError('请输入导航站名称。');
      return;
    }

    try {
      if (sourceKind === 'server') {
        const normalizedServer = normalizeExploreServerAddress(value);
        if (builtInServers.has(normalizedServer)) {
          navigate(getExploreServerPath(normalizedServer));
          closeDialog();
          return;
        }
      }
    } catch (error) {
      setValidationError(getErrorMessage(error));
      return;
    }

    saveSource(sourceKind, title, value)
      .then((source) => {
        if (source.kind === 'web' && source.webOpenMode === 'external') {
          openExternalUrl(source.value);
        } else {
          navigate(getSourceRoute(source));
        }
        closeDialog();
      })
      .catch((error) => {
        setValidationError(getErrorMessage(error));
      });
  };

  return (
    <>
      <Overlay open={dialog} backdrop={<OverlayBackdrop />}>
        <OverlayCenter>
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              clickOutsideDeactivates: true,
              onDeactivate: closeDialog,
              escapeDeactivates: stopPropagation,
            }}
          >
            <Dialog variant="Surface">
              <Header
                style={{
                  padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
                  borderBottomWidth: config.borderWidth.B300,
                }}
                variant="Surface"
                size="500"
              >
                <Box grow="Yes">
                  <Text size="H4">添加探索来源</Text>
                </Box>
                <IconButton size="300" onClick={closeDialog} radii="300">
                  <Icon src={Icons.Cross} />
                </IconButton>
              </Header>
              <Box
                as="form"
                onSubmit={handleSubmit}
                style={{
                  padding: config.space.S400,
                  width: '28rem',
                  maxWidth: 'calc(100vw - 2rem)',
                  boxSizing: 'border-box',
                }}
                direction="Column"
                gap="400"
              >
                <Box direction="Column" gap="50">
                  <Text priority="400" style={helperTextStyle}>
                    添加的来源会写入当前 Matrix 账号。
                  </Text>
                  <Text priority="400" style={helperTextStyle}>
                    同账号的其他设备也会自动同步。
                  </Text>
                </Box>

                <Box direction="Column" gap="100">
                  <Text size="L400">来源类型</Text>
                  <Box gap="100" wrap="Wrap">
                    <Chip
                      type="button"
                      variant={sourceKind === 'server' ? 'Primary' : 'Surface'}
                      radii="Pill"
                      outlined={sourceKind !== 'server'}
                      onClick={() => {
                        setSourceKind('server');
                        setValidationError(undefined);
                      }}
                    >
                      <Text size="T200">社区服务器</Text>
                    </Chip>
                    <Chip
                      type="button"
                      variant={sourceKind === 'web' ? 'Primary' : 'Surface'}
                      radii="Pill"
                      outlined={sourceKind !== 'web'}
                      onClick={() => {
                        setSourceKind('web');
                        setValidationError(undefined);
                      }}
                    >
                      <Text size="T200">自定义网页</Text>
                    </Chip>
                    <Chip
                      type="button"
                      variant={sourceKind === 'nav' ? 'Primary' : 'Surface'}
                      radii="Pill"
                      outlined={sourceKind !== 'nav'}
                      onClick={() => {
                        setSourceKind('nav');
                        setValidationError(undefined);
                      }}
                    >
                      <Text size="T200">导航站</Text>
                    </Chip>
                  </Box>
                </Box>

                <Box direction="Column" gap="100">
                  <Text size="L400">
                    {sourceKind === 'nav' ? '导航站名称' : '显示名称（可选）'}
                  </Text>
                  <Input
                    name="titleInput"
                    variant="Background"
                    required={sourceKind === 'nav'}
                    value={title}
                    onChange={(evt) => setTitle(evt.currentTarget.value)}
                    style={fullWidthStyle}
                    placeholder={
                      sourceKind === 'server'
                        ? '默认显示服务器地址'
                        : sourceKind === 'web'
                          ? '例如：官网文档'
                          : '例如：工作台'
                    }
                  />
                </Box>

                <Box direction="Column" gap="100">
                  <Text size="L400">
                    {sourceKind === 'server'
                      ? '服务器地址'
                      : sourceKind === 'web'
                        ? '网页地址'
                        : '导航站简介（可选）'}
                  </Text>
                  <Input
                    name="valueInput"
                    variant="Background"
                    required={sourceKind !== 'nav'}
                    value={value}
                    onChange={(evt) => setValue(evt.currentTarget.value)}
                    style={fullWidthStyle}
                    placeholder={
                      sourceKind === 'server'
                        ? '例如：matrix.org'
                        : sourceKind === 'web'
                          ? '例如：https://www.mozilla.org'
                          : '例如：收纳常用网站和工具'
                    }
                  />

                  {sourceKind === 'server' && (
                    <Text size="T200" priority="300" style={helperTextStyle}>
                      用于探索该服务器公开的房间与空间。
                    </Text>
                  )}
                  {sourceKind === 'web' && (
                    <Box direction="Column" gap="50">
                      <Text size="T200" priority="300" style={helperTextStyle}>
                        支持内嵌时，会保留网页内嵌。
                      </Text>
                      <Text size="T200" priority="300" style={helperTextStyle}>
                        不适合内嵌时，会自动改为浏览器打开。
                      </Text>
                    </Box>
                  )}
                  {sourceKind === 'nav' && (
                    <Box direction="Column" gap="50">
                      <Text size="T200" priority="300" style={helperTextStyle}>
                        导航站适合收纳多个常用链接和卡片。
                      </Text>
                      <Text size="T200" priority="300" style={helperTextStyle}>
                        创建后可以继续添加分组和链接卡片。
                      </Text>
                    </Box>
                  )}

                  {(validationError || saveState.status === AsyncStatus.Error) && (
                    <Text style={{ ...helperTextStyle, color: color.Critical.Main }} size="T300">
                      {validationError ?? getErrorMessage(saveState.error)}
                    </Text>
                  )}
                </Box>

                <Button
                  type="submit"
                  variant="Primary"
                  disabled={saveState.status === AsyncStatus.Loading}
                  before={
                    saveState.status === AsyncStatus.Loading ? (
                      <Spinner fill="Solid" variant="Primary" size="200" />
                    ) : undefined
                  }
                >
                  <Text size="B400">保存并打开</Text>
                </Button>
              </Box>
            </Dialog>
          </FocusTrap>
        </OverlayCenter>
      </Overlay>
      <Button
        variant="Secondary"
        fill="Soft"
        size="300"
        before={<Icon size="100" src={Icons.Plus} />}
        onClick={() => setDialog(true)}
      >
        <Text size="B300" truncate>
          添加来源
        </Text>
      </Button>
    </>
  );
}

type CustomSourceNavItemProps = {
  source: CinnyExploreSource;
  selected: boolean;
  deleting: boolean;
  onRemove: (source: CinnyExploreSource) => void;
};

function CustomSourceNavItem({
  source,
  selected,
  deleting,
  onRemove,
}: CustomSourceNavItemProps) {
  const directExternalOpen = source.kind === 'web' && source.webOpenMode === 'external';

  const handleRemove: MouseEventHandler<HTMLButtonElement> = (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    onRemove(source);
  };

  const handleOpen: MouseEventHandler<HTMLAnchorElement> = (evt) => {
    if (!directExternalOpen) return;

    evt.preventDefault();
    evt.stopPropagation();
    openExternalUrl(source.value);
  };

  return (
    <NavItem
      variant="Background"
      radii="400"
      aria-selected={directExternalOpen ? false : selected}
    >
      <Box as="span" grow="Yes" alignItems="Center" gap="100">
        <Box as="span" grow="Yes">
          <NavLink to={getSourceRoute(source)} onClick={handleOpen}>
            <NavItemContent>
              <Box as="span" grow="Yes" alignItems="Center" gap="200">
                <Avatar size="200" radii="400">
                  {getSourceIcon(source.kind, selected)}
                </Avatar>
                <Box as="span" grow="Yes" direction="Column" gap="50">
                  <Text as="span" size="Inherit" truncate>
                    {source.title}
                  </Text>
                  <Text as="span" size="T200" priority="300" truncate>
                    {getSourceSubtitle(source)}
                  </Text>
                </Box>
              </Box>
            </NavItemContent>
          </NavLink>
        </Box>
        <IconButton
          type="button"
          size="300"
          fill="None"
          radii="300"
          aria-label="删除来源"
          onClick={handleRemove}
          disabled={deleting}
        >
          {deleting ? <Spinner size="100" variant="Secondary" /> : <Icon src={Icons.Cross} />}
        </IconButton>
      </Box>
    </NavItem>
  );
}

export function Explore() {
  const mx = useMatrixClient();
  useNavToActivePathMapper('explore');
  const navigate = useNavigate();
  const userId = mx.getUserId();
  const clientConfig = useClientConfig();
  const userServer = userId ? getMxIdServer(userId) : undefined;
  const servers =
    clientConfig.featuredCommunities?.servers?.filter((server) => server !== userServer) ?? [];

  const builtInServers = useMemo(() => {
    const nextServers = new Set<string>();

    [userServer, ...servers].forEach((server) => {
      if (!server) return;
      try {
        nextServers.add(normalizeExploreServerAddress(server));
      } catch {
        // Ignore invalid server entries from config.
      }
    });

    return nextServers;
  }, [servers, userServer]);

  const customSourcesEvent = useAccountData(AccountDataEvent.CinnyExploreSources);
  const customSources = useMemo(
    () => getExploreCustomSources(customSourcesEvent?.getContent<CinnyExploreSourcesContent>()),
    [customSourcesEvent]
  );

  const customServerSources = useMemo(
    () =>
      customSources.filter(
        (source) => source.kind === 'server' && !builtInServers.has(source.value)
      ),
    [builtInServers, customSources]
  );
  const customNavSources = useMemo(
    () => customSources.filter((source) => source.kind === 'nav'),
    [customSources]
  );
  const customWebSources = useMemo(
    () => customSources.filter((source) => source.kind === 'web'),
    [customSources]
  );

  const featuredSelected = useExploreFeaturedSelected();
  const selectedServer = useExploreServer();
  const selectedWebSourceId = useExploreWebSourceId();
  const selectedNavSourceId = useExploreNavSourceId();

  const [deletingSourceId, setDeletingSourceId] = useState<string>();
  const [removeState, removeSource] = useAsyncCallback(async (sourceId: string) => {
    await removeExploreCustomSource(mx, sourceId);
    return sourceId;
  });

  const handleRemoveSource = (source: CinnyExploreSource) => {
    if (deletingSourceId) return;

    setDeletingSourceId(source.id);
    removeSource(source.id)
      .then(() => {
        const deletedSelectedWeb =
          source.kind === 'web' && selectedWebSourceId === source.id;
        const deletedSelectedServer =
          source.kind === 'server' &&
          selectedServer === source.value &&
          !builtInServers.has(source.value);
        const deletedSelectedNav = source.kind === 'nav' && selectedNavSourceId === source.id;

        if (deletedSelectedWeb || deletedSelectedServer || deletedSelectedNav) {
          navigate(getExploreFeaturedPath(), { replace: true });
        }
      })
      .catch(() => undefined)
      .finally(() => setDeletingSourceId(undefined));
  };

  return (
    <PageNav>
      <PageNavHeader>
        <Box grow="Yes" gap="300">
          <Box grow="Yes">
            <Text size="H4" truncate>
              社区探索
            </Text>
          </Box>
        </Box>
      </PageNavHeader>

      <PageNavContent>
        <Box direction="Column" gap="300">
          <NavCategory>
            <NavItem variant="Background" radii="400" aria-selected={featuredSelected}>
              <NavLink to={getExploreFeaturedPath()}>
                <NavItemContent>
                  <Box as="span" grow="Yes" alignItems="Center" gap="200">
                    <Avatar size="200" radii="400">
                      <Icon src={Icons.Bulb} size="100" filled={featuredSelected} />
                    </Avatar>
                    <Box as="span" grow="Yes">
                      <Text as="span" size="Inherit" truncate>
                        推荐
                      </Text>
                    </Box>
                  </Box>
                </NavItemContent>
              </NavLink>
            </NavItem>
            {userServer && (
              <NavItem
                variant="Background"
                radii="400"
                aria-selected={selectedServer === userServer}
              >
                <NavLink to={getExploreServerPath(userServer)}>
                  <NavItemContent>
                    <Box as="span" grow="Yes" alignItems="Center" gap="200">
                      <Avatar size="200" radii="400">
                        <Icon
                          src={Icons.Server}
                          size="100"
                          filled={selectedServer === userServer}
                        />
                      </Avatar>
                      <Box as="span" grow="Yes">
                        <Text as="span" size="Inherit" truncate>
                          {userServer}
                        </Text>
                      </Box>
                    </Box>
                  </NavItemContent>
                </NavLink>
              </NavItem>
            )}
          </NavCategory>

          {servers.length > 0 && (
            <NavCategory>
              <NavCategoryHeader>
                <Text size="O400" style={{ paddingLeft: config.space.S200 }}>
                  公共服务器
                </Text>
              </NavCategoryHeader>
              {servers.map((server) => (
                <NavItem
                  key={server}
                  variant="Background"
                  radii="400"
                  aria-selected={server === selectedServer}
                >
                  <NavLink to={getExploreServerPath(server)}>
                    <NavItemContent>
                      <Box as="span" grow="Yes" alignItems="Center" gap="200">
                        <Avatar size="200" radii="400">
                          <Icon src={Icons.Server} size="100" filled={server === selectedServer} />
                        </Avatar>
                        <Box as="span" grow="Yes">
                          <Text as="span" size="Inherit" truncate>
                            {server}
                          </Text>
                        </Box>
                      </Box>
                    </NavItemContent>
                  </NavLink>
                </NavItem>
              ))}
            </NavCategory>
          )}

          {customServerSources.length > 0 && (
            <NavCategory>
              <NavCategoryHeader>
                <Text size="O400" style={{ paddingLeft: config.space.S200 }}>
                  自定义服务器
                </Text>
              </NavCategoryHeader>
              {customServerSources.map((source) => (
                <CustomSourceNavItem
                  key={source.id}
                  source={source}
                  selected={selectedServer === source.value}
                  deleting={deletingSourceId === source.id}
                  onRemove={handleRemoveSource}
                />
              ))}
            </NavCategory>
          )}

          {customNavSources.length > 0 && (
            <NavCategory>
              <NavCategoryHeader>
                <Text size="O400" style={{ paddingLeft: config.space.S200 }}>
                  导航站
                </Text>
              </NavCategoryHeader>
              {customNavSources.map((source) => (
                <CustomSourceNavItem
                  key={source.id}
                  source={source}
                  selected={selectedNavSourceId === source.id}
                  deleting={deletingSourceId === source.id}
                  onRemove={handleRemoveSource}
                />
              ))}
            </NavCategory>
          )}

          {customWebSources.length > 0 && (
            <NavCategory>
              <NavCategoryHeader>
                <Text size="O400" style={{ paddingLeft: config.space.S200 }}>
                  自定义网页
                </Text>
              </NavCategoryHeader>
              {customWebSources.map((source) => (
                <CustomSourceNavItem
                  key={source.id}
                  source={source}
                  selected={source.webOpenMode === 'external' ? false : selectedWebSourceId === source.id}
                  deleting={deletingSourceId === source.id}
                  onRemove={handleRemoveSource}
                />
              ))}
            </NavCategory>
          )}

          {removeState.status === AsyncStatus.Error && (
            <Text size="T300" style={{ ...helperTextStyle, color: color.Critical.Main }}>
              {getErrorMessage(removeState.error)}
            </Text>
          )}

          <Box direction="Column">
            <AddExploreSource builtInServers={builtInServers} />
          </Box>
        </Box>
      </PageNavContent>
    </PageNav>
  );
}
