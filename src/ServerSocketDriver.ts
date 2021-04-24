import * as ws$WebSocket from "ws";
import { DataBuf, pbMessage, WebSocketBase, stime, AWebSocket, AnyWSD, UpstreamDrivable, CLOSE_CODE } from "wspbclient";

/**
 * Simple WebSocketDriver: log each method with timeStamp.
 * connect dnstream ws to upstream Driver
 */
export class ServerSocketDriver<T extends pbMessage> extends WebSocketBase<T, T> {
	/** The underlying WebSocket to send/receive bytes. */
	wss: ws$WebSocket; // set by connectWebSocket

	/** set and used for onerror, by/during sendBuffer */
	sendError: (error: Event) => void;

	connectDnStream(ws_or_url: ws$WebSocket | AWebSocket | string | UpstreamDrivable<T>): this {
		if (ws_or_url instanceof ws$WebSocket) {
		  this.connectWebSocket(ws_or_url)
			return this
		} else {
			return super.connectDnStream(ws_or_url)
		}
	}
	connectStream(ws: ws$WebSocket | AWebSocket | string, ...drivers: Array<{ new(): AnyWSD }>): AnyWSD[] {
		return super.connectStream(ws as AWebSocket | string, ...drivers)
	}

	connectWebSocket(wss: ws$WebSocket | WebSocket | string) {
		if (wss instanceof ws$WebSocket) {
			this.wss = wss
			wss.onmessage = (ev: ws$WebSocket.MessageEvent) => {
				this.upstream.wsmessage(ev.data as Buffer)
			}
		} else { super.connectWebSocket(wss) }
	}
	/**
	 *
	 * @param data DataBuf to be sent
	 * @param cb provide specific function for 'onerror' [rare]
	 */
	sendBuffer(data: DataBuf<T>, cb?: (error: Event | Error) => void): void {
		this.wss.send(data, cb); // server-side API (no 'options', undefined)
	}
  closeStream(code: CLOSE_CODE, reason: string): void {
    this.wss.close(code, reason)
  }
}
