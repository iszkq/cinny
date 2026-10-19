export const resolveSpaceSheetExpanded = (expanded: boolean, deltaY: number): boolean => {
  if (deltaY <= -48) return true;
  if (deltaY >= 48) return false;
  return expanded;
};
