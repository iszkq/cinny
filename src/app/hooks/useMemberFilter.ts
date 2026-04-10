import { useMemo } from 'react';
import { RoomMember } from 'matrix-js-sdk';
import { Membership } from '../../types/matrix/room';

export const MembershipFilter = {
  filterJoined: (m: RoomMember) => m.membership === Membership.Join,
  filterInvited: (m: RoomMember) => m.membership === Membership.Invite,
  filterLeaved: (m: RoomMember) =>
    m.membership === Membership.Leave &&
    m.events.member?.getStateKey() === m.events.member?.getSender(),
  filterKicked: (m: RoomMember) =>
    m.membership === Membership.Leave &&
    m.events.member?.getStateKey() !== m.events.member?.getSender(),
  filterBanned: (m: RoomMember) => m.membership === Membership.Ban,
};

export type MembershipFilterFn = (m: RoomMember) => boolean;

export type MembershipFilterItem = {
  name: string;
  filterFn: MembershipFilterFn;
};

export const useMembershipFilterMenu = (): MembershipFilterItem[] =>
  useMemo(
    () => [
      {
        name: '\u5df2\u52a0\u5165',
        filterFn: MembershipFilter.filterJoined,
      },
      {
        name: '\u5df2\u9080\u8bf7',
        filterFn: MembershipFilter.filterInvited,
      },
      {
        name: '\u5df2\u79bb\u5f00',
        filterFn: MembershipFilter.filterLeaved,
      },
      {
        name: '\u5df2\u79fb\u51fa',
        filterFn: MembershipFilter.filterKicked,
      },
      {
        name: '\u5df2\u5c01\u7981',
        filterFn: MembershipFilter.filterBanned,
      },
    ],
    []
  );

export const useMembershipFilter = (
  index: number,
  membershipFilter: MembershipFilterItem[]
): MembershipFilterItem => {
  const filter = membershipFilter[index] ?? membershipFilter[0];
  return filter;
};
