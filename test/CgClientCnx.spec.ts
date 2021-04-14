import { CnxHandler } from '../src/CnxHandler';
import { CgClientCnx } from '../src/CgClientCnx'
import type { CgMessage } from '../src/CgProto';
import type { CgBaseCnx, ParserFactory } from '../src/CgBaseCnx';
import { EzPromise } from "../src/EzPromise";
const moment = require('moment');

var inner_fac: ParserFactory<never, CgMessage> = (cnx: CgBaseCnx<never, CgMessage>) => {
  let parser: CnxHandler<never> = new CnxHandler(null, null)
  
  return parser
}

var base = new CgClientCnx<never>(null, inner_fac)
test("CgBaseCnx.constructor", () => {
  expect(base).toBeInstanceOf(CgClientCnx)
})