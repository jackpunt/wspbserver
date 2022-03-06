import { WSSOpts, WssListener } from './wspbserver';
import { CgServerDriver } from './CgServerDriver'
import { stime } from '@thegraid/wspbclient';

let host = process.argv.find((val, ndx, ary) => (ndx>0 && ary[ndx-1] == "Xname")) || 'game7'
let portStr = process.argv.find((val, ndx, ary) => (ndx>0 && ary[ndx-1] == "Xport")) || '8444'
let port = Number.parseInt(portStr)

const cgserver: WSSOpts = {
	domain: ".thegraid.com",
	port: port,
	keydir: "/Users/jpeck/keys/"
}
console.log(stime(undefined, "cg-server"), "listen at:", `${host}${cgserver.domain}:${cgserver.port}`, process.pid)
// WssListener injects its own SSD<ws$WebSocket> at the bottom of the stack
let cnxlp = new WssListener(host, cgserver, CgServerDriver ).startListening()
cnxlp.then((cnxl) => {
	console.log("listening %s:%d", cnxl.hostname, cnxl.port)
}, (reason) => {
	console.log("reject:", reason)
})
