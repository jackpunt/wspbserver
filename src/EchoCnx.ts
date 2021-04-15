import * as moment from 'moment';
import { CnxHandler } from "./CnxHandler";
import { pbMessage, DataBuf, fmt } from "./wspbserver";

/** A CnxHandler that handles incoming(buf) by sending it back to this.ws */

export class EchoCnx extends CnxHandler<pbMessage> {
	/**
	 * Override to avoid deserialize, parseEval
	 * @param buf
	 * @override
	 */
	wsmessage(buf: DataBuf) {
		console.log("%s RECEIVED:", moment().format(fmt), buf.length, buf);
		let sendBufCb = (error: Error) => {
			if (!error) {
				console.log('%s EchoCnx sent: %s', moment().format(fmt), "success");
			} else {
				console.log('%s EchoCnx error: %s', moment().format(fmt), error);
			}
		};
		this.sendBuffer(buf, sendBufCb);
	}
}
