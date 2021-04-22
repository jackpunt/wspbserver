import { CnxHandler } from "../src/CnxHandler";
import { EzPromise } from "@thegraid/EzPromise";
const moment = require('moment');

var cnx = new CnxHandler(null)
test("CnxHandler.constructor", () => {
  expect(cnx).toBeInstanceOf(CnxHandler)
})
