import { AnyWSD, AWebSocket, CLOSE_CODE, DataBuf, pbMessage, stime, UpstreamDrivable, WebSocketBase } from "@thegraid/wspbclient";
import ws$WebSocket from "ws";
import type { Remote } from "./wspbserver.js";

// type SSD<T extends pbMessage> = ServerSocketDriver<T>
/**
 * Special WebSocketDriver that works on Node server, using ws$WebSocket.
 * 
 */
export class ServerSocketDriver<T extends pbMessage> extends WebSocketBase<T, T> {
	/** The underlying WebSocket to send/receive bytes. */
	wss: ws$WebSocket; // set by connectWebSocket
	remote: Remote;

	// TODO: resolve how to manage "client_id" as a string/key into ClientGroup: Record<string, SSD>
	/**
	 * 
	 * @param remote from the https.responseMessage: {addr, port, family}
	 */
	constructor(remote: Remote) {
		super()
		this.remote = remote
	}

	/** set and used for onerror, by/during sendBuffer */
	sendSendError: (error: Event) => void;

	connectDnStream(ws_or_url: ws$WebSocket | AWebSocket | string | UpstreamDrivable<T>): this {
		if (ws_or_url instanceof ws$WebSocket) {
		  this.connectWebSocket(ws_or_url)
			return this
		} else {
			return super.connectDnStream(ws_or_url)
		}
	}
	connectStream(ws: ws$WebSocket | AWebSocket | string, ...drivers: Array<{ new(): AnyWSD }>): AnyWSD[] {
		// if (ws instanceof ws$WebSocket)  // eventually WebSocketDriver.connectWebSocket() would do this
		// 	this.wss = ws                  // but it simplifies CgServerDriver to set this early
		return super.connectStream(ws as AWebSocket | string, ...drivers)
	}
	wsopen(ev: ws$WebSocket.Event) {
		this.log && console.log(stime(this, '.wsopen'), "SSD: open", ev)
	}
	/** default listener just logs event; ok to override. */
	wsclose(ev: ws$WebSocket.CloseEvent) {
		let { target, wasClean, reason, code } = ev
		this.log && console.log(stime(this, '.wsclose'), "SSD: close", {code, reason, wasClean})
	}
	wserror(ev: ws$WebSocket.ErrorEvent) {
		this.log && console.log(stime(this, '.wserror'), "SSD: error", ev)
	}
	/**
	 * send data to upstream.wsmessage(data)
	 * @param data 
	 * @override to remove logging
	 */
  wsmessage(data: DataBuf<T>): void {
    // this.log && console.log(stime(), "BaseDriver.wsmessage: upstream.wsmessage(data)", this.upstream)
    if (!!this.upstream) this.upstream.wsmessage(data)
  };
	connectWebSocket(wss: ws$WebSocket | WebSocket | string): this {
		// use alternate server-side Events and handlers:
		if (wss instanceof ws$WebSocket) {
			this.wss = wss
			// TODO: something useful with this.{onopen, onclose, onerror} or this.wss.{onopen, onclose, onerror}
			wss.onopen = (ev: ws$WebSocket.Event) => this.wsopen(ev)
			wss.onclose = (ev: ws$WebSocket.CloseEvent) => this.wsclose(ev)
			wss.onerror = (ev: ws$WebSocket.ErrorEvent) => this.wserror(ev)
			// BaseDriver.onmessage(ev) -> this.wsmessage(ev.data) [works for DOM & Node onmessage(ev)]
			wss.onmessage = (ev: ws$WebSocket.MessageEvent) => this.wsmessage(ev.data as Buffer)
		} else { super.connectWebSocket(wss) }
    return this
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
