import { pbMessage, DataBuf, stime, BaseDriver } from "wspbclient";
import { WssListener, WSSOpts } from "./wspbserver";

/** A BaseDriver that handles incoming(buf) by sending it back to this.ws */
const echoserver: WSSOpts = {
	domain: ".thegraid.com",
	port: 8443,
	keydir: "/Users/jpeck/keys/"
}
export class EchoDriver<T extends pbMessage> extends BaseDriver<T, T> {
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

let cnxlp = new WssListener("game7", echoserver, EchoDriver).startListening()
cnxlp.then((cnxl) => {
	console.log("listening %s:%d", cnxl.hostname, cnxl.port)
}, (reason) => {
	console.log("reject:", reason)
})