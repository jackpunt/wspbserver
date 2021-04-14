import { EzPromise } from "../src/EzPromise";

var zpromise = new EzPromise<number>()
test("EzPromise.constructor", () => {
  expect(zpromise).toBeInstanceOf(EzPromise)
})
// console.log("zpromise=", zpromise)

test("promise.resolve(val)", done => {
  let val = 5
  let nret: number = 0
  zpromise.then((n) => { 
    expect(n).toEqual(val)
    done();
  })
  zpromise.resolve(val)
})
