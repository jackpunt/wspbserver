import { WSSOpts, CnxListener } from './wspbserver';
import { CgServerCnx } from './CgServerCnx'

const theGraid: WSSOpts = {
	domain: ".thegraid.com",
	port: 8444,
	keydir: "/Users/jpeck/keys/"
}

let cnxl = new CnxListener("game7", theGraid, (ws) => new CgServerCnx(ws, null)).startListening()
cnxl.then((cnxl)=>{console.log("listening %s:%d", cnxl.hostname, cnxl.port)}, (reason) => {console.log("reject:", reason)})
cnxl.catch((reason) => {console.log("caught:", reason)})

