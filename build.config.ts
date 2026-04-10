const normalizeBasePath = (basePath: string): string => {
  const trimmedBasePath = basePath.trim();

  if (!trimmedBasePath || trimmedBasePath === '/') {
    return '/';
  }

  return `/${trimmedBasePath.replace(/^\/+|\/+$/g, '')}/`;
};

export default {
  base: normalizeBasePath(process.env.APP_BASE_PATH ?? '/'),
};
