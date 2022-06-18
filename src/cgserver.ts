import { stime } from '@thegraid/common-lib';
import { EzPromise } from '@thegraid/ezpromise';
import { CgServerDriver, srvrOpts, WssListener, wssServer } from './index.js';

let cnxlp = new EzPromise<WssListener>(), logName = 'cgserver', ln = process.argv[0]
cnxlp.then(() => { }, (reason) => {
  console.error(stime('wssServer.', logName), `exit(1) ${process.pid} -- ${reason}`)
  process.exit(1)
})

wssServer(cnxlp, 'cgserver', srvrOpts('game7', '8447'), CgServerDriver)