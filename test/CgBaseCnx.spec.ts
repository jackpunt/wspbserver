import { CgBaseCnx } from '../src/CgBaseCnx'
import { EzPromise } from "../src/EzPromise";
const moment = require('moment');

var base = new CgBaseCnx(null, null)
test("CgBaseCnx.constructor", () => {
  expect(base).toBeInstanceOf(CgBaseCnx)
})