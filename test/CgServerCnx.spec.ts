import { CgServerCnx as CgServerCnx } from '../src/CgServerCnx'
import { EzPromise } from "@thegraid/EzPromise";
const moment = require('moment');

var base = new CgServerCnx(null, null)
test("CgBaseCnx.constructor", () => {
  expect(base).toBeInstanceOf(CgServerCnx)
})