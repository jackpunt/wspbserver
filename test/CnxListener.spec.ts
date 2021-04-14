import { CnxListener } from "../src/wspbserver";
import { EchoCnx } from '../src/EchoCnx'
import { EzPromise } from "../src/EzPromise";
const moment = require('moment');

const wssOpts = {
	domain: ".thegraid.com",
	port: 8445,
	keydir: "/Users/jpeck/keys/"
}
var wss = new CnxListener("game7", wssOpts, (ws) => new EchoCnx(ws))
test("CnxListener.constructor", () => {
  expect(wss).toBeInstanceOf(CnxListener)
})