import { CnxListener, WSSOpts } from "./wspbserver"
import { EchoCnx } from "./EchoCnx"

const echoserve: WSSOpts = {
	domain: ".thegraid.com",
	port: 8443,
	keydir: "/Users/jpeck/keys/"
}

let cnxl = new CnxListener("game7", echoserve, (ws) => new EchoCnx(ws, null)).startListening()
cnxl.then((cnxl)=>{console.log("listening %s:%d", cnxl.hostname, cnxl.port)}, (reason) => {console.log("reject:", reason)})
