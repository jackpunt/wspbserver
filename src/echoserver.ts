import * as moment from "moment";
import { CnxHandler, DataBuf, fmt, pbMessage } from "./wspbserver"

/** A CnxHandler that handles incoming(buf) by sending it back to this.ws */
export class EchoServer extends CnxHandler<pbMessage> {
	/**
	 * Override to avoid deserialize, parseEval
	 * @param buf 
	 * @override
	 */
	wsmessage(buf: DataBuf) {
		console.log("%s RECEIVED:", moment().format(fmt), buf.length, buf)
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