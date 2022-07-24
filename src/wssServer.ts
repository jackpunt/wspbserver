import { argVal } from '@thegraid/common-lib'
import { WSSOpts, WssListener, WSDriver } from './index.js';
import { EzPromise, stime } from '@thegraid/wspbclient';

export function srvrOpts(defHost = 'game7', defPort = '8447', keydir='~/keys/', k: string = '--'): WSSOpts {
  const host = argVal('host', defHost, k)
  const portStr = argVal('port', defPort, k)
  const port = Number.parseInt(portStr)

  return {
    host: host,
    domain: "thegraid.com",
    port: port,
    keydir: keydir
  }
}
/** return {cnlx, cnxlp, host, port, pid, srvropts} */
export function wssServer(listenp: boolean | EzPromise<WssListener>, logName: string, srvropts: WSSOpts, ...drivers: WSDriver[]) {
  //const srvropts: WSSOpts = srvrOpts(defHost, defPort)
  const host = srvropts.host, port = srvropts.port
  console.log(stime('wssServer.', logName), "--begin--", `${host}.${srvropts.domain}:${srvropts.port} -> pid=${process.pid}`)
  // WssListener injects its own SSD<ws$WebSocket> at the bottom of the stack
  const cnxl = new WssListener(host, srvropts, ...drivers)
  let cnxlp: EzPromise<WssListener>
  if (listenp !== false) cnxlp = startListening(cnxl, logName, listenp == true ? undefined : listenp)
  return { cnxl, cnxlp, host, port, pid: process.pid, srvropts: srvropts }
}
/** startListening */
export function startListening(cnxl: WssListener, logName: string, cnxlp = new EzPromise<WssListener>()): EzPromise<WssListener> {
  cnxl.startListening(cnxlp)
  cnxlp.then((cnxl) => {
    console.log(stime('wssServer.', logName), `listening ${cnxl.hostname}:${cnxl.port} -> pid=${process.pid}`)
  }, (reason) => {
    console.error(stime('wssServer.', logName), `reject: ${reason}`) // exit(1) before getting here!
    process.exit(1)
  })
  return cnxlp
}