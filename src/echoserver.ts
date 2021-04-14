import { CnxListener, WSSOpts } from "./wspbserver"
import { EchoCnx } from "./EchoCnx"

const theGraid: WSSOpts = {
	domain: ".thegraid.com",
	port: 8443,
	keydir: "/Users/jpeck/keys/"
}

new CnxListener("game7", theGraid, (ws) => new EchoCnx(ws)).startListening()