export function pushSessionToSW(baseUrl?: string, accessToken?: string, userId?: string) {
  if (!('serviceWorker' in navigator)) return;

  const message = {
    type: 'setSession',
    accessToken,
    baseUrl,
    userId,
  };

  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage(message);
    return;
  }

  void navigator.serviceWorker.ready.then((registration) => {
    registration.active?.postMessage(message);
  });
}
