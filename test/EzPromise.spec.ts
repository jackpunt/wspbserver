import { EzPromise } from "../src/EzPromise";

var zpromise = new EzPromise<number>()
test("EzPromise.constructor", () => {
  expect(zpromise).toBeInstanceOf(EzPromise)
})
console.log("zpromise=", zpromise)

test("promise.then", done => {
  let val = 5
  let nret: number = 0
  zpromise.then((n) => { 
    nret = n;
    console.log("promise = ", n); 
    expect(nret).toEqual(val)
    done();
  })
  zpromise.resolve(val)
})
