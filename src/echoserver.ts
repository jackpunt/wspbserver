import * as moment from "moment";
import { CnxHandler, fmt, pbMessage } from "./wspbserver"

/** handle incoming() but sending back to this.ws */
export class EchoServer extends CnxHandler<pbMessage> {
	wsmessage(buf: Buffer | Uint8Array) {
		super.wsmessage(buf) // log reception
		let ack = (error: Error) => {
			if (!error) {
				console.log('%s sent: %s', moment().format(fmt), "success");
			} else {
				console.log('%s error: %s', moment().format(fmt), error);
			}
		}
		this.sendBuffer(buf,  ack);
	}
}

// const theGraid: WSSOpts = {
// 	domain: ".thegraid.com",
// 	port: 8443,
// 	keydir: "/Users/jpeck/keys/"
// }

// new CnxManager("game7", theGraid, EchoServer).run()