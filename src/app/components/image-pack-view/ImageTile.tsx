import React, { FormEventHandler, ReactNode, useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Chip,
  config,
  Icon,
  Icons,
  Input,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Spinner,
  Text,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { UsageSwitcher, useUsageStr } from './UsageSwitcher';
import { mxcUrlToHttp } from '../../utils/matrix';
import * as css from './style.css';
import { ImageUsage, imageUsageEqual, PackImageReader } from '../../plugins/custom-emoji';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useDisplayMediaUrl } from '../../hooks/useDisplayMediaUrl';
import { SettingTile } from '../setting-tile';
import { useObjectURL } from '../../hooks/useObjectURL';
import { createUploadAtom, TUploadAtom } from '../../state/upload';
import { replaceSpaceWithDash } from '../../utils/common';
import { stopPropagation } from '../../utils/keyboard';
import { PersonalImagePackTarget } from './personalPackActions';

type ImageTileProps = {
  defaultShortcode: string;
  useAuthentication: boolean;
  packUsage: ImageUsage[];
  image: PackImageReader;
  canEdit?: boolean;
  onEdit?: (defaultShortcode: string, image: PackImageReader) => void;
  deleted?: boolean;
  onDeleteToggle?: (defaultShortcode: string) => void;
  moveTargets?: PersonalImagePackTarget[];
  canMove?: boolean;
  moving?: boolean;
  onMove?: (defaultShortcode: string, image: PackImageReader, targetPackId: string) => void;
};
export function ImageTile({
  defaultShortcode,
  image,
  packUsage,
  useAuthentication,
  canEdit,
  onEdit,
  onDeleteToggle,
  deleted,
  moveTargets,
  canMove,
  moving,
  onMove,
}: ImageTileProps) {
  const mx = useMatrixClient();
  const getUsageStr = useUsageStr();
  const [menuCords, setMenuCords] = useState<RectCords>();
  const imageUrl = mxcUrlToHttp(mx, image.url, useAuthentication) ?? undefined;
  const displayImageUrl = useDisplayMediaUrl(imageUrl);

  const canShowMove = !!moveTargets && moveTargets.length > 0;

  return (
    <SettingTile
      before={
        displayImageUrl ? (
          <img
            className={css.ImagePackImage}
            src={displayImageUrl}
            alt={image.shortcode}
            loading="lazy"
          />
        ) : undefined
      }
      title={
        deleted ? (
          <span className={css.DeleteImageShortcode}>{image.shortcode}</span>
        ) : (
          image.shortcode
        )
      }
      description={
        <Box as="span" gap="200">
          {image.usage && getUsageStr(image.usage) !== getUsageStr(packUsage) && (
            <Badge as="span" variant="Secondary" size="400" radii="300" outlined>
              <Text as="span" size="L400">
                {getUsageStr(image.usage)}
              </Text>
            </Badge>
          )}
          {image.body}
        </Box>
      }
      after={
        canEdit ? (
          <Box shrink="No" alignItems="Center" gap="200">
            <Chip
              variant={deleted ? 'Critical' : 'Secondary'}
              fill="None"
              radii="Pill"
              onClick={() => onDeleteToggle?.(defaultShortcode)}
            >
              {deleted ? (
                <Text size="B300">{'\u64a4\u9500'}</Text>
              ) : (
                <Icon size="50" src={Icons.Delete} />
              )}
            </Chip>
            {!deleted && (
              <Chip
                variant="Secondary"
                radii="Pill"
                onClick={() => onEdit?.(defaultShortcode, image)}
              >
                <Text size="B300">{'\u7f16\u8f91'}</Text>
              </Chip>
            )}
            {!deleted && canShowMove && (
              <>
                <Chip
                  variant="Secondary"
                  radii="Pill"
                  aria-disabled={!canMove}
                  onClick={
                    canMove
                      ? (evt) => setMenuCords(evt.currentTarget.getBoundingClientRect())
                      : undefined
                  }
                >
                  {moving ? (
                    <Box alignItems="Center" gap="100">
                      <Spinner size="100" />
                      <Text size="B300">{'\u79fb\u52a8\u4e2d'}</Text>
                    </Box>
                  ) : (
                    <Text size="B300">{'\u79fb\u52a8\u5230'}</Text>
                  )}
                </Chip>
                <PopOut
                  anchor={menuCords}
                  offset={5}
                  position="Bottom"
                  align="End"
                  content={
                    <FocusTrap
                      focusTrapOptions={{
                        initialFocus: false,
                        onDeactivate: () => setMenuCords(undefined),
                        clickOutsideDeactivates: true,
                        isKeyForward: (evt: KeyboardEvent) =>
                          evt.key === 'ArrowDown' || evt.key === 'ArrowRight',
                        isKeyBackward: (evt: KeyboardEvent) =>
                          evt.key === 'ArrowUp' || evt.key === 'ArrowLeft',
                        escapeDeactivates: stopPropagation,
                      }}
                    >
                      <Menu>
                        <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
                          {moveTargets?.map((target) => (
                            <MenuItem
                              key={target.id}
                              size="300"
                              radii="300"
                              onClick={() => {
                                setMenuCords(undefined);
                                onMove?.(defaultShortcode, image, target.id);
                              }}
                            >
                              <Text size="T300">{target.label}</Text>
                            </MenuItem>
                          ))}
                        </Box>
                      </Menu>
                    </FocusTrap>
                  }
                />
              </>
            )}
          </Box>
        ) : undefined
      }
    />
  );
}

type ImageTileUploadProps = {
  file: File;
  children: (uploadAtom: TUploadAtom) => ReactNode;
};
export function ImageTileUpload({ file, children }: ImageTileUploadProps) {
  const url = useObjectURL(file);
  const uploadAtom = useMemo(() => createUploadAtom(file), [file]);

  return (
    <SettingTile before={<img className={css.ImagePackImage} src={url} alt={file.name} />}>
      {children(uploadAtom)}
    </SettingTile>
  );
}

type ImageTileEditProps = {
  defaultShortcode: string;
  useAuthentication: boolean;
  packUsage: ImageUsage[];
  image: PackImageReader;
  onCancel: (shortcode: string) => void;
  onSave: (shortcode: string, image: PackImageReader) => void;
};
export function ImageTileEdit({
  defaultShortcode,
  useAuthentication,
  packUsage,
  image,
  onCancel,
  onSave,
}: ImageTileEditProps) {
  const mx = useMatrixClient();
  const defaultUsage = image.usage ?? packUsage;
  const imageUrl = mxcUrlToHttp(mx, image.url, useAuthentication) ?? undefined;
  const displayImageUrl = useDisplayMediaUrl(imageUrl);

  const [unsavedUsage, setUnsavedUsages] = useState(defaultUsage);

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();

    const target = evt.target as HTMLFormElement | undefined;
    const shortcodeInput = target?.shortcodeInput as HTMLInputElement | undefined;
    const bodyInput = target?.bodyInput as HTMLTextAreaElement | undefined;
    if (!shortcodeInput || !bodyInput) return;

    const shortcode = replaceSpaceWithDash(shortcodeInput.value.trim());
    const body = bodyInput.value.trim() || undefined;
    const usage = unsavedUsage;

    if (!shortcode) return;

    if (
      shortcode === image.shortcode &&
      body === image.body &&
      imageUsageEqual(usage, defaultUsage)
    ) {
      onCancel(defaultShortcode);
      return;
    }

    const imageReader = new PackImageReader(shortcode, image.url, {
      info: image.info,
      body,
      usage: imageUsageEqual(usage, packUsage) ? undefined : usage,
    });

    onSave(defaultShortcode, imageReader);
  };

  return (
    <SettingTile
      before={
        displayImageUrl ? (
          <img
            className={css.ImagePackImage}
            src={displayImageUrl}
            alt={image.shortcode}
            loading="lazy"
          />
        ) : undefined
      }
    >
      <Box as="form" onSubmit={handleSubmit} direction="Column" gap="200">
        <Box direction="Column" className={css.ImagePackImageInputs}>
          <Input
            before={<Text size="L400">{'\u7f29\u5199\u7801\uff1a'}</Text>}
            defaultValue={image.shortcode}
            name="shortcodeInput"
            variant="Secondary"
            size="300"
            radii="0"
            required
            autoFocus
          />
          <Input
            before={<Text size="L400">{'\u8bf4\u660e\uff1a'}</Text>}
            defaultValue={image.body}
            name="bodyInput"
            variant="Secondary"
            size="300"
            radii="0"
          />
        </Box>
        <Box gap="200">
          <Box shrink="No" direction="Column">
            <UsageSwitcher usage={unsavedUsage} onChange={setUnsavedUsages} canEdit />
          </Box>
          <Box grow="Yes" />
          <Button type="submit" variant="Success" size="300" radii="300">
            <Text size="B300">{'\u4fdd\u5b58'}</Text>
          </Button>
          <Button
            type="reset"
            variant="Secondary"
            fill="Soft"
            size="300"
            radii="300"
            onClick={() => onCancel(defaultShortcode)}
          >
            <Text size="B300">{'\u53d6\u6d88'}</Text>
          </Button>
        </Box>
      </Box>
    </SettingTile>
  );
}
