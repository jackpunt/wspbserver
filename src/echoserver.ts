import * as moment from "moment";
import { WSSOpts, CnxManager, CnxHandler, fmt } from "./wspbserver"

/** handle incoming() but sending back to this.ws */
export class EchoServer extends CnxHandler {
	// message appears to be a 'Buffer'
	wsmessage(message: Buffer) {
		super.wsmessage(message)
		let ack = (error: Error) => {
			if (!error) {
				console.log('%s sent: %s', moment().format(fmt), "success");
			} else {
				console.log('%s error: %s', moment().format(fmt), error);
			}
		}
		this.ws.send(message,  ack);
	}
}

// const theGraid: WSSOpts = {
// 	domain: ".thegraid.com",
// 	port: 8443,
// 	keydir: "/Users/jpeck/keys/"
// }

// new CnxManager("game7", theGraid, EchoServer).run()