import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, Icons } from 'folds';
import { SidebarAvatar, SidebarItem, SidebarItemTooltip } from '../../../components/sidebar';
import { useFavoritesSelected } from '../../../hooks/router/useFavoritesSelected';
import { getFavoritesPath } from '../../pathUtils';

export function FavoritesTab() {
  const navigate = useNavigate();
  const favoritesSelected = useFavoritesSelected();

  return (
    <SidebarItem active={favoritesSelected}>
      <SidebarItemTooltip tooltip="收藏">
        {(triggerRef) => (
          <SidebarAvatar
            as="button"
            ref={triggerRef}
            outlined
            onClick={() => navigate(getFavoritesPath())}
          >
            <Icon src={Icons.Heart} filled={favoritesSelected} />
          </SidebarAvatar>
        )}
      </SidebarItemTooltip>
    </SidebarItem>
  );
}
