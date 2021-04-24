import { WSSOpts, WssListener } from './wspbserver';
import { CgServerDriver } from './CgServerCnx'

const cgserve: WSSOpts = {
	domain: ".thegraid.com",
	port: 8444,
	keydir: "/Users/jpeck/keys/"
}

let cnxlp = new WssListener("game7", cgserve, CgServerDriver ).startListening()
cnxlp.then((cnxl) => {
	console.log("listening %s:%d", cnxl.hostname, cnxl.port)
}, (reason) => {
	console.log("reject:", reason)
})
