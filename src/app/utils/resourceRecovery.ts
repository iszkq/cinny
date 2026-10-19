// Native assets ship inside the installation package. Reloading cannot update
// them, and would reset the calculator gate during ordinary network failures.
export function isResourceLoadError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return /dynamically imported module|importing a module script failed|loading chunk|chunkloaderror|failed to fetch.*module|module script|module.*(?:load|fetch)|unable to preload css|preload.*css|css.*(?:load|fetch)|模块.*加载/i.test(message);
}
export const canAutomaticallyRecoverResources = (error: unknown, native: boolean): boolean =>
  !native && isResourceLoadError(error);
