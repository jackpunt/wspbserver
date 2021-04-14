import { WSSOpts, CnxListener } from './wspbserver';
import { CgServerCnx } from './CgServerCnx'

const theGraid: WSSOpts = {
	domain: ".thegraid.com",
	port: 8444,
	keydir: "/Users/jpeck/keys/"
}

new CnxListener("game7", theGraid, (ws) => new CgServerCnx(ws, null)).startListening()
