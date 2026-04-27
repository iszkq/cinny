import { useMemo } from 'react';
import { StateEvent } from '../../../../types/matrix/room';
import { PermissionGroup } from '../../common-settings/permissions';

export const usePermissionGroups = (): PermissionGroup[] => {
  const groups: PermissionGroup[] = useMemo(() => {
    const messagesGroup: PermissionGroup = {
      name: '管理',
      items: [
        {
          location: {
            state: true,
            key: StateEvent.SpaceChild,
          },
          name: '管理空间房间',
        },
        {
          location: {},
          name: '消息事件',
        },
      ],
    };

    const moderationGroup: PermissionGroup = {
      name: '管理',
      items: [
        {
          location: {
            action: true,
            key: 'invite',
          },
          name: '邀请',
        },
        {
          location: {
            action: true,
            key: 'kick',
          },
          name: '移出',
        },
        {
          location: {
            action: true,
            key: 'ban',
          },
          name: '封禁',
        },
      ],
    };

    const roomOverviewGroup: PermissionGroup = {
      name: '空间概况',
      items: [
        {
          location: {
            state: true,
            key: StateEvent.RoomAvatar,
          },
          name: '空间头像',
        },
        {
          location: {
            state: true,
            key: StateEvent.RoomName,
          },
          name: '空间名称',
        },
        {
          location: {
            state: true,
            key: StateEvent.RoomTopic,
          },
          name: '空间主题',
        },
      ],
    };

    const roomSettingsGroup: PermissionGroup = {
      name: '设置',
      items: [
        {
          location: {
            state: true,
            key: StateEvent.RoomJoinRules,
          },
          name: '更改空间访问权限',
        },
        {
          location: {
            state: true,
            key: StateEvent.RoomCanonicalAlias,
          },
          name: '发布地址',
        },
        {
          location: {
            state: true,
            key: StateEvent.RoomPowerLevels,
          },
          name: '修改全部权限',
        },
        {
          location: {
            state: true,
            key: StateEvent.PowerLevelTags,
          },
          name: '编辑权限等级',
        },
        {
          location: {
            state: true,
            key: StateEvent.RoomTombstone,
          },
          name: '升级空间',
        },
        {
          location: {
            state: true,
          },
          name: '其他设置',
        },
      ],
    };

    const otherSettingsGroup: PermissionGroup = {
      name: '其他',
      items: [
        {
          location: {
            state: true,
            key: StateEvent.PoniesRoomEmotes,
          },
          name: '管理表情与分类',
        },
        {
          location: {
            state: true,
            key: StateEvent.RoomServerAcl,
          },
          name: '修改服务器 ACL',
        },
      ],
    };

    return [
      messagesGroup,
      moderationGroup,
      roomOverviewGroup,
      roomSettingsGroup,
      otherSettingsGroup,
    ];
  }, []);

  return groups;
};
