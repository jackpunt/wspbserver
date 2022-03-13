import { argVal } from '@thegraid/common-lib'
import { WSSOpts, WssListener, WSDriver } from '.';
import { EzPromise, stime } from '@thegraid/wspbclient';

export function srvrOpts(defHost = 'game7', defPort = '8443', k: string = '--'): WSSOpts {
  const host = argVal('host', defHost, k)
  const portStr = argVal('port', defPort, k)
  const port = Number.parseInt(portStr)

  return {
    host: host,
    domain: "thegraid.com",
    port: port,
    keydir: "/Users/jpeck/keys/"
  }
}
/** return {cnlx, cnxlp, host, port, pid, srvropts} */
export function wssServer(listenp: boolean | EzPromise<WssListener>, logName: string, srvropts: WSSOpts, ...drivers: WSDriver[]) {
  //const srvropts: WSSOpts = srvrOpts(defHost, defPort)
  const host = srvropts.host, port = srvropts.port
  console.log(stime('wssServer.', logName), "begin", `${host}.${srvropts.domain}:${srvropts.port}`, process.pid)
  // WssListener injects its own SSD<ws$WebSocket> at the bottom of the stack
  const cnxl = new WssListener(host, srvropts, ...drivers)
  if (listenp !== false) startListening(cnxl, logName, listenp == true ? undefined : listenp)
  return { cnxl, cnxlp: typeof listenp == 'boolean' ? undefined : listenp, host, port, pid: process.pid, srvropts: srvropts }
}
/** startListening */
export function startListening(cnxl: WssListener, logName: string, cnxlp = new EzPromise<WssListener>()): EzPromise<WssListener> {
  cnxl.startListening(cnxlp)
  cnxlp.then((cnxl) => {
    console.log(stime('wssServer.', logName), `listening ${cnxl.hostname}:${cnxl.port}`, process.pid)
  }, (reason) => {
    console.log(stime('wssServer.', logName), "reject:", reason)
  })
  return cnxlp
}