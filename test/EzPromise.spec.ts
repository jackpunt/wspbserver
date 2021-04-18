import { EzPromise } from "../src/EzPromise";

var zpromise1 = new EzPromise<number>()
test("EzPromise.constructor", () => {
  expect(zpromise1).toBeInstanceOf(EzPromise)
})
// console.log("zpromise=", zpromise)

test("promise.fulfill(val)", done => {
  let val = 5
  let nret: number = 0
  zpromise1.then((n) => { 
    expect(n).toEqual(val)
    expect(zpromise1.value).toEqual(val)
    expect(zpromise1.resolved).toBe(true)
    done();
  }, (rej) => {
    expect(rej).toBe("not invoked")
  })
  zpromise1.fulfill(val)
})

var zpromise2 = new EzPromise<number>()
test("promise.reject(val)", done => {
  let val = "reject"
  let nret: number = 0
  zpromise2.then((n) => { 
    expect(n).toBe("not invoked")
  }, (rej) => {
    expect(rej).toEqual(val)
    expect(zpromise2.value).toBeUndefined()
    expect(zpromise2.reason).toBe(val)
    expect(zpromise2.resolved).toBe(true)
    done();
  })
  zpromise2.reject(val)
})
var zpromise3 = new EzPromise<number>()
test("promise.catch(val)", done => {
  let val = "catch"
  let nret: number = 0
  zpromise3.then((n) => { 
    expect(n).toBe("not invoked")
  }, (rej) => {
    expect(rej).toBe(val)
  })
  zpromise3.catch((rej) => {
    expect(rej).toEqual(val)
    expect(zpromise3.value).toBeUndefined()
    expect(zpromise3.reason).toBe(val)
    expect(zpromise3.resolved).toBe(true)
    done();
  })
  zpromise3.reject(val)
})
