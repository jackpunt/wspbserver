import { WSSOpts, WssListener, WSDriver } from '.';
import { EzPromise, stime } from '@thegraid/wspbclient';

export function wssServer(cnxlp: boolean | EzPromise<WssListener>, logName: string, defHost: string, defPort: string, ...drivers: WSDriver[]) {
  const host = process.argv.find((val, ndx, ary) => (ndx > 0 && ary[ndx - 1] == "--host")) || defHost
  const portStr = process.argv.find((val, ndx, ary) => (ndx > 0 && ary[ndx - 1] == "--port")) || defPort
  const port = Number.parseInt(portStr)

  const svropts: WSSOpts = {
    domain: ".thegraid.com",
    port: port,
    keydir: "/Users/jpeck/keys/"
  }
  console.log(stime(undefined, logName), "begin", `${host}${svropts.domain}:${svropts.port}`, process.pid)
  // WssListener injects its own SSD<ws$WebSocket> at the bottom of the stack
  const cnxl = new WssListener(host, svropts, ...drivers)
  if (cnxlp !== false) startListening(cnxl, logName, cnxlp == true ? undefined : cnxlp)
  return { cnxl, cnxlp: typeof cnxlp == 'boolean' ? undefined : cnxlp , host, port, pid: process.pid, svropts }
}
/** startListening */
export function startListening(cnxl: WssListener, logName: string, cnxlp = new EzPromise<WssListener>()): EzPromise<WssListener> {
  cnxl.startListening(cnxlp)
  cnxlp.then((cnxl) => {
    console.log(stime(undefined, logName), `listening ${cnxl.hostname}:${cnxl.port}`, process.pid)
  }, (reason) => {
    console.log(stime(undefined, logName), "reject:", reason)
  })
  return cnxlp
}