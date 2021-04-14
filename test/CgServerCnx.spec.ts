import { CgServerCnx as CgServerCnx } from '../src/CgServerCnx'
import { EzPromise } from "../src/EzPromise";
const moment = require('moment');

var base = new CgServerCnx(null, null)
test("CgBaseCnx.constructor", () => {
  expect(base).toBeInstanceOf(CgServerCnx)
})