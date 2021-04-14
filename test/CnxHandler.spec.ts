import { CnxHandler } from "../src/CnxHandler";
import { EzPromise } from "../src/EzPromise";
const moment = require('moment');

var cnx = new CnxHandler(null)
test("CnxHandler.constructor", () => {
  expect(cnx).toBeInstanceOf(CnxHandler)
})
