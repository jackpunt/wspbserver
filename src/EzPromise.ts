export class EzPromise<T> extends Promise<T> {
  constructor() {
    super((res, rej) => {
      this.resolve = res;
      this.reject = rej;
    });
  }
  resolve: (value: T) => void;
  reject: (value: any) => void;
}
