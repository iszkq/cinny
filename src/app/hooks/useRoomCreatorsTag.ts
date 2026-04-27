import { MemberPowerTag } from '../../types/matrix/room';

const DEFAULT_TAG: MemberPowerTag = {
  name: '创始人',
  color: '#0000ff',
};

export const useRoomCreatorsTag = (): MemberPowerTag => DEFAULT_TAG;
