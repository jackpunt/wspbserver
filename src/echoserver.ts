import { WSSOpts, CnxManager, EchoServer } from "./wspbserver"

const theGraid: WSSOpts = {
	domain: ".thegraid.com",
	port: 8443,
	keydir: "/Users/jpeck/keys/"
}

new CnxManager("game7", theGraid, EchoServer).run()