import type ws = require("ws");
import { pbMessage, DataBuf, stime, BaseDriver } from "wspbclient";
import { CgServerCnx } from "./CgServerCnx";
import { ServerSocketDriver } from "./CnxHandler";
import { CnxListener, WSSOpts } from "./wspbserver";

/** A CnxHandler that handles incoming(buf) by sending it back to this.ws */
const echoserver: WSSOpts = {
	domain: ".thegraid.com",
	port: 8443,
	keydir: "/Users/jpeck/keys/"
}
export class EchoCnx<T extends pbMessage> extends BaseDriver<T, T> {
	/**
	 * Override to avoid deserialize, parseEval
	 * @param buf
	 * @override
	 */
	wsmessage(buf: DataBuf<T>) {
		this.wsreceived(buf)
		this.wsechoback(buf);
	}
	wsreceived(buf: DataBuf<T>) {
		console.log(stime(), "RECEIVED:", buf.length, buf);
	}
	wsechoback(buf: DataBuf<T>) {
		// TODO: see if this is needed and find generic solution, see also CgBase.ts
		let sendBufCb = (error: Error) => {
			if (!error) {
				console.log(stime(), 'EchoCnx sent: %s', "success");
			} else {
				console.log(stime(), 'EchoCnx error: %s', error);
			}
		};
		this.sendBuffer(buf);
	}
}

let cnxlp = new CnxListener("game7", echoserver, ServerSocketDriver, EchoCnx).startListening()
cnxlp.then((cnxl) => {
	console.log("listening %s:%d", cnxl.hostname, cnxl.port)
}, (reason) => {
	console.log("reject:", reason)
})