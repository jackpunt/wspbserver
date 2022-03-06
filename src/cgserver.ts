import { WSSOpts, WssListener, CgServerDriver } from '.';
import { stime } from '@thegraid/wspbclient';

export function cgserver() {
  let host = process.argv.find((val, ndx, ary) => (ndx > 0 && ary[ndx - 1] == "Xname")) || 'game7'
  let portStr = process.argv.find((val, ndx, ary) => (ndx > 0 && ary[ndx - 1] == "Xport")) || '8444'
  let port = Number.parseInt(portStr)

  const svropts: WSSOpts = {
    domain: ".thegraid.com",
    port: port,
    keydir: "/Users/jpeck/keys/"
  }
  console.log(stime(undefined, "cg-server"), "begin", `${host}${svropts.domain}:${svropts.port}`, process.pid)
  // WssListener injects its own SSD<ws$WebSocket> at the bottom of the stack
  let cnxlp = new WssListener(host, svropts, CgServerDriver).startListening()
  cnxlp.then((cnxl) => {
    console.log(stime(undefined, "cg-server"), `listening ${cnxl.hostname}:${cnxl.port}`, process.pid)
  }, (reason) => {
    console.log(stime(undefined, "cg-server"), "reject:", reason)
  })
}
cgserver()