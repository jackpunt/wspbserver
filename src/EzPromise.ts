export class EzPromise<T> extends Promise<T> {
  constructor(def = (res, rej) => { }) {
    let fulfill: (value: T | PromiseLike<T>) => void
    let reject: (reason?: any) => void;
    super((fil, rej) => {
      def(fil, rej);
      fulfill = fil;
      reject = rej;
    });
    this.fulfill = (value: T | PromiseLike<T>) => { this.value = value; this.resolved= true; fulfill(value) }
    this.reject = (reason: any) => {this.reason = reason; this.resolved = true; reject(reason)}
  }
  fulfill: (value: T | PromiseLike<T>) => void;
  reject: (value: any) => void;
  value: T | PromiseLike<T>;
  reason: any;
  resolved: boolean;
}
// https://gist.github.com/oliverfoster/00897f4552cef64653ef14d8b26338a6
// with the trick to supply/invoke a default/dummy method arg.