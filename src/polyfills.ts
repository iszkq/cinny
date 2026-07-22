type PromiseWithResolversResult<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

type PromiseConstructorWithResolvers = PromiseConstructor & {
  withResolvers?: <T>() => PromiseWithResolversResult<T>;
};

const promiseConstructor = Promise as PromiseConstructorWithResolvers;

if (typeof promiseConstructor.withResolvers !== 'function') {
  Object.defineProperty(promiseConstructor, 'withResolvers', {
    configurable: true,
    writable: true,
    value: <T>(): PromiseWithResolversResult<T> => {
      let resolve!: PromiseWithResolversResult<T>['resolve'];
      let reject!: PromiseWithResolversResult<T>['reject'];
      const promise = new Promise<T>((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
      });

      return { promise, resolve, reject };
    },
  });
}
