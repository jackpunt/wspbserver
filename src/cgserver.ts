import { argVal, stime } from '@thegraid/common-lib';
import { CgServerDriver, srvrOpts, wssServer } from './index.js';
import { ServerSocketDriver } from './ServerSocketDriver.js';

let lld0 = Number.parseInt(argVal('lld0', '1'))
let lld1 = Number.parseInt(argVal('lld1', '1'))
ServerSocketDriver.logLevel = lld0
CgServerDriver.logLevel = lld1

wssServer(true, 'cgserver', srvrOpts('game7', '8447'), CgServerDriver)