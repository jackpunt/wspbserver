import { CnxManager, WSSOpts, EchoServer } from "./wspbserver";


const theGraid: WSSOpts = {
	domain: ".thegraid.com",
	port: 8443,
	keydir: "/Users/jpeck/keys/"
}

console.log("game-server! ", new Date().toTimeString())
new CnxManager("game7", theGraid, EchoServer).run()