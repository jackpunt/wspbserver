import { WSSOpts, WssListener } from './wspbserver';
import { CgServerDriver } from './CgServerDriver'

const cgserver: WSSOpts = {
	domain: ".thegraid.com",
	port: 8444,
	keydir: "/Users/jpeck/keys/"
}
let host = process.argv[2] || "game7"
// WssListener injects its own SSD<ws$WebSocket> at the bottom of the stack
let cnxlp = new WssListener(host, cgserver, CgServerDriver ).startListening()
cnxlp.then((cnxl) => {
	console.log("listening %s:%d", cnxl.hostname, cnxl.port)
}, (reason) => {
	console.log("reject:", reason)
})
