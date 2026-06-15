import React, { FormEventHandler, useState } from 'react';
import { useSetAtom } from 'jotai';
import { Avatar, Box, Button, Icon, Icons, Input, Text, config } from 'folds';
import { NavButton, NavItem, NavItemContent } from '../../components/nav';
import { useRoomNavCategoriesAtom } from '../../state/hooks/roomNavCategories';

type RoomNavCreateCategoryItemProps = {
  scope: string;
  label: string;
};

const makeCustomCategoryId = (): string =>
  `category-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function RoomNavCreateCategoryItem({ scope, label }: RoomNavCreateCategoryItemProps) {
  const setRoomNavCategories = useSetAtom(useRoomNavCategoriesAtom());
  const [formOpen, setFormOpen] = useState(false);

  const handleCreateCategory: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    const nameInput = evt.currentTarget.elements.namedItem('categoryNameInput');
    if (!(nameInput instanceof HTMLInputElement)) return;
    const name = nameInput.value.trim();
    if (!name) return;

    setRoomNavCategories({
      type: 'CREATE_CATEGORY',
      category: {
        id: makeCustomCategoryId(),
        scope,
        name,
      },
    });
    setFormOpen(false);
  };

  if (formOpen) {
    return (
      <Box
        as="form"
        onSubmit={handleCreateCategory}
        direction="Column"
        gap="100"
        style={{ padding: config.space.S100 }}
      >
        <Input
          name="categoryNameInput"
          size="300"
          variant="Background"
          radii="300"
          autoFocus
          required
          placeholder={'\u5206\u7c7b\u540d\u79f0'}
        />
        <Box gap="100">
          <Button type="submit" size="300" variant="Primary" radii="300">
            <Text size="B300" truncate>
              {'\u521b\u5efa'}
            </Text>
          </Button>
          <Button
            type="button"
            size="300"
            variant="Secondary"
            fill="Soft"
            radii="300"
            onClick={() => setFormOpen(false)}
          >
            <Text size="B300" truncate>
              {'\u53d6\u6d88'}
            </Text>
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <NavItem variant="Background" radii="400">
      <NavButton onClick={() => setFormOpen(true)}>
        <NavItemContent>
          <Box as="span" grow="Yes" alignItems="Center" gap="200">
            <Avatar size="200" radii="400">
              <Icon src={Icons.Plus} size="100" />
            </Avatar>
            <Box as="span" grow="Yes">
              <Text as="span" size="Inherit" truncate>
                {label}
              </Text>
            </Box>
          </Box>
        </NavItemContent>
      </NavButton>
    </NavItem>
  );
}
