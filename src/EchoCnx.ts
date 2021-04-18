import * as moment from 'moment';
import { CnxHandler } from "./CnxHandler";
import { pbMessage, DataBuf, stime } from "./wspbserver";

/** A CnxHandler that handles incoming(buf) by sending it back to this.ws */

export class EchoCnx extends CnxHandler<pbMessage> {
	/**
	 * Override to avoid deserialize, parseEval
	 * @param buf
	 * @override
	 */
	wsmessage(buf: DataBuf) {
		this.wsreceived(buf)
		this.wsechoback(buf);
	}
	wsreceived(buf: DataBuf) {
		console.log(stime(), "RECEIVED:", buf.length, buf);
	}
	wsechoback(buf: DataBuf) {
		let sendBufCb = (error: Error) => {
			if (!error) {
				console.log(stime(), 'EchoCnx sent: %s', "success");
			} else {
				console.log(stime(), 'EchoCnx error: %s', error);
			}
		};
		this.sendBuffer(buf, sendBufCb);
	}
}
