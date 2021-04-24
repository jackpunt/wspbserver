import { WSSOpts, CnxListener } from './wspbserver';
import { CgServerCnx } from './CgServerCnx'
import type * as ws from 'ws'
import { ServerSocketDriver } from './CnxHandler';

const cgserve: WSSOpts = {
	domain: ".thegraid.com",
	port: 8444,
	keydir: "/Users/jpeck/keys/"
}
function newClient(ws: ws.WebSocket) {
	let wsb = new ServerSocketDriver()
	wsb.connectWebSocket(ws)
	wsb.connectStream(ws, CgServerCnx)
}
let cnxlp = new CnxListener("game7", cgserve, newClient).startListening()
cnxlp.then((cnxl) => {
	console.log("listening %s:%d", cnxl.hostname, cnxl.port)
}, (reason) => {
	console.log("reject:", reason)
})
