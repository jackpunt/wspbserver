import * as ws from "ws";
import * as moment from 'moment';
import { pbMessage, WebSocketEventHandler, PbParser, EitherWebSocket, DataBuf, fmt, SocketSender } from "./wspbserver";

/**
 * Simplest CnxHandler: just log each method with timeStamp.
 * Similar to gammaNg.wsConnect interface MsgParser
 * see also: WebSocketEventMap, <K extends keyof WebSocketEventMap>
 *
 * Override with deserialize(bytes):T, parseEval(T) or supply other msg_handler: PbParser<T>
 * Note: wsmessage(bytes) => parseEval(deserialize(bytes))
 */
export class CnxHandler<T extends pbMessage> implements WebSocketEventHandler, SocketSender, PbParser<T> {
	/** The underlying Socket to send/receive bytes. */
	ws: EitherWebSocket ; // set by connection

	/** in principal, one could inject an alternative msg_handler... */
	msg_handler: PbParser<T>;

	/**
	 * Send & Recieve [protobuf] messages over a WebSocket.
	 *
	 * @param ws the ws.WebSocket (or WebSocket or url) connection to be handled.
   * Can also be a SocketSender (ie another CnxHandler)
	 * @param msg_handler optional override PbMessage handler; default: 'this'
	 */
	constructor(ws: EitherWebSocket | string, msg_handler?: PbParser<T>) {
		if (typeof (ws) === 'string') {
			let url = ws;
			ws = new WebSocket(url); // TODO: handle failure of URL or connection
			ws.binaryType = "arraybuffer";
			// for outbound/browser client connections, use WebSocket interface directly:
			if (this.onopen)
				ws.onopen = this.onopen;
			if (this.onerror)
				ws.onerror = this.onerror;
			if (this.onclose)
				ws.onclose = this.onclose;
			if (this.onmessage)
				ws.onmessage = this.onmessage;
		}
		this.ws = ws;
		this.msg_handler = msg_handler || this;
	}

	/**
	 * Extract pbMessage<T> from bytes.
	 * Typically, invoke static T.deserializeBinary(bytes)
	 *
	 * deserialize(bytes: Default) { return T.deserializeBinary(bytes) }
	 */
	deserialize(bytes: DataBuf): T {
		// return T.deserializeBinary(bytes)
		throw new Error("Method not implemented: 'deserialize'");
	}
	/** take action based on the received pbMessage. */
	parseEval(message: T): void {
		throw new Error("Method not implemented: 'pareseEval'");
	}

	/** set and used for onerror, by/during sendBuffer */
	sendError: (error: Event) => void;

	/**
	 *
	 * @param data DataBuf to be sent
	 * @param cb provide specific function for 'onerror' [rare]
	 */
	sendBuffer(data: DataBuf, cb?: (error: Event | Error) => void): void {
		if (this.ws instanceof ws.EventEmitter) {
			this.ws.send(data, cb); // server-side API (no 'options', undefined)
		} else {
			// try emulate on browser/client-side:
			this.sendError = cb;
			this.ws.send(data);
			this.sendError = undefined;
    }
	}

	// Basically abstract methods:
	onopen(ev: Event) {
		console.log('%s open:', moment().format(fmt), ev);
	}
	onclose(ev: Event) {
		console.log('%s close:', moment().format(fmt), ev);
	}
	onerror(ev: Event) {
		console.log('%s error:', moment().format(fmt), ev);
		if (typeof (this.sendError) === 'function')
			this.sendBuffer.call(this, ev);
	}
	/** received a message<T> from EitherWebSocket */
	onmessage(msg: MessageEvent | DataBuf) {
		let data = (msg instanceof MessageEvent) ? msg.data : msg;
		this.wsmessage(data);
	}
	/** received a DataBuf<T> from ws.WebSocket or MessageEvent */
	wsmessage(buf: DataBuf) {
		let msg = this.msg_handler.deserialize(buf);
		this.msg_handler.parseEval(msg);
	}
}
