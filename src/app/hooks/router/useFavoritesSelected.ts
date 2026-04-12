import { useMatch } from 'react-router-dom';
import { getFavoritesPath } from '../../pages/pathUtils';

export const useFavoritesSelected = (): boolean => {
  const favoritesMatch = useMatch({
    path: getFavoritesPath(),
    caseSensitive: true,
    end: false,
  });

  return !!favoritesMatch;
};
