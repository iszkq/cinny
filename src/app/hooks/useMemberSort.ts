import { RoomMember } from 'matrix-js-sdk';
import { useCallback, useMemo } from 'react';

export const MemberSort = {
  Ascending: (a: RoomMember, b: RoomMember) =>
    a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1,
  Descending: (a: RoomMember, b: RoomMember) =>
    a.name.toLowerCase() > b.name.toLowerCase() ? -1 : 1,
  NewestFirst: (a: RoomMember, b: RoomMember) =>
    (b.events.member?.getTs() ?? 0) - (a.events.member?.getTs() ?? 0),
  Oldest: (a: RoomMember, b: RoomMember) =>
    (a.events.member?.getTs() ?? 0) - (b.events.member?.getTs() ?? 0),
};

export type MemberSortFn = (a: RoomMember, b: RoomMember) => number;

export type MemberSortItem = {
  name: string;
  sortFn: MemberSortFn;
};

export const useMemberSortMenu = (): MemberSortItem[] =>
  useMemo(
    () => [
      {
        name: '\u540d\u79f0 A-Z',
        sortFn: MemberSort.Ascending,
      },
      {
        name: '\u540d\u79f0 Z-A',
        sortFn: MemberSort.Descending,
      },
      {
        name: '\u6700\u65b0\u52a0\u5165',
        sortFn: MemberSort.NewestFirst,
      },
      {
        name: '\u6700\u65e9\u52a0\u5165',
        sortFn: MemberSort.Oldest,
      },
    ],
    []
  );

export const useMemberSort = (index: number, memberSort: MemberSortItem[]): MemberSortItem => {
  const item = memberSort[index] ?? memberSort[0];
  return item;
};

export const useMemberPowerSort = (
  creators: Set<string>,
  getPowerLevel: (userId: string) => number
): MemberSortFn => {
  const sort: MemberSortFn = useCallback(
    (a, b) => {
      if (creators.has(a.userId) && creators.has(b.userId)) {
        return 0;
      }
      if (creators.has(a.userId)) return -1;
      if (creators.has(b.userId)) return 1;

      return getPowerLevel(b.userId) - getPowerLevel(a.userId);
    },
    [creators]
  );

  return sort;
};
