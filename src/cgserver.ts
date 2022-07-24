import { argVal, stime } from '@thegraid/common-lib';
import { CgServerDriver, srvrOpts, wssServer } from './index.js';
import { ServerSocketDriver } from './ServerSocketDriver.js';

let lld0 = Number.parseInt(argVal('lld0', '0'))
let lld1 = Number.parseInt(argVal('lld1', '1'))
ServerSocketDriver.logLevel = lld0
CgServerDriver.logLevel = lld1

wssServer(true, 'cgserver', srvrOpts('cgserver', '8447'), CgServerDriver)