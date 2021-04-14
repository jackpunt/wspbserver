export class EzPromise<T> extends Promise<T> {
  constructor(def = (res, rej) => { }) {
    let result: (value: T | PromiseLike<T>) => void
    let reject: (reason?: any) => void;
    super((res, rej) => {
      def(res, rej);
      result = res;
      reject = rej;
    });
    this.resolve = result
    this.reject = reject
  }
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (value: any) => void;
}
// https://gist.github.com/oliverfoster/00897f4552cef64653ef14d8b26338a6
// with the trick to supply/invoke a default/dummy method arg.