import { WSSOpts, WssListener, CgServerDriver } from '.';
import { AnyWSD, stime } from '@thegraid/wspbclient';

export function wssServer(logName: string, driver: new () => AnyWSD, defHost: string, defPort: string) {
  let host = process.argv.find((val, ndx, ary) => (ndx > 0 && ary[ndx - 1] == "Xname")) || defHost
  let portStr = process.argv.find((val, ndx, ary) => (ndx > 0 && ary[ndx - 1] == "Xport")) || defPort
  let port = Number.parseInt(portStr)

  const svropts: WSSOpts = {
    domain: ".thegraid.com",
    port: port,
    keydir: "/Users/jpeck/keys/"
  }
  console.log(stime(undefined, logName), "begin", `${host}${svropts.domain}:${svropts.port}`, process.pid)
  // WssListener injects its own SSD<ws$WebSocket> at the bottom of the stack
  let cnxlp = new WssListener(host, svropts, driver).startListening()
  cnxlp.then((cnxl) => {
    console.log(stime(undefined, logName), `listening ${cnxl.hostname}:${cnxl.port}`, process.pid)
  }, (reason) => {
    console.log(stime(undefined, logName), "reject:", reason)
  })
}