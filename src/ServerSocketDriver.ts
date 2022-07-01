import { AnyWSD, AWebSocket, className, CLOSE_CODE, DataBuf, pbMessage, stime, UpstreamDrivable, WebSocketBase } from "@thegraid/wspbclient";
import ws, { WebSocket as ws$WebSocket} from "ws";
import type { Remote } from "./wspbserver.js";

// type SSD<I extends pbMessage> = ServerSocketDriver<I>
/**
 * Special WebSocketDriver that works on Node server, using ws$WebSocket.
 * 
 */
export class ServerSocketDriver<I extends pbMessage> extends WebSocketBase<I, I> {
  static logLevel = 1
	/** The underlying WebSocket to send/receive bytes. */
	wss: ws; // set by connectWebSocket
	remote: Remote; // provided by [wspbserver] WssListener.onConnection()

	// TODO: resolve how to manage "client_id" as a string/key into ClientGroup: Record<string, SSD>
	/**
	 * 
	 * @param remote from the https.responseMessage: {addr, port, family}
	 */
	constructor(remote: Remote) {
		super()
		this.remote = remote
    this.log = ServerSocketDriver.logLevel
	}

	override connectDnStream(ws_or_url: ws | AWebSocket | string | UpstreamDrivable<I>): this {
		if (ws_or_url instanceof ws) {
		  this.connectWebSocket(ws_or_url)
			return this
		} else {
			return super.connectDnStream(ws_or_url)
		}
	}
  /** handle an inbound ws: stack it with the given Drivers  
   * @param ws an open/inbound ws$WebSocket from WssListener
   */
	override connectStream(ws: ws | AWebSocket | string, ...drivers: Array<{ new(): AnyWSD }>): AnyWSD[] {
    // ASSERT: ws is an open/connected ws.WebSocket.
    // set this.wss = ws so CgServerDriver can addEventListener('close')
    // eventually WebSocketDriver.connectWebSocket() will [also] set it
		if (ws instanceof ws$WebSocket) this.wss = ws   
    this.ll(2) && console.log(stime(this, `.connectStream:`), ServerSocketDriver, ...drivers)
		return super.connectStream(ws as AWebSocket, ...drivers)
	}
  // create DOM Event, invoke BaseDriver.listener(type, evt) === this.ontype(evt)
  // BaseDriver.ontype(evt) will likely BaseDriver.dispatchEvent(evt)
	wsopen(wsevt: ws.Event) {
    let { type, target } = wsevt
    //let evt = new Event('open', {}) // TODO: set other properties as needed.
    let evt = { type } as Event
		this.ll(1) && console.log(stime(this, '.wsopen'), "SSD: open", evt)
    if (!target) return
    this.onopen(evt) // propagate 'sideways'; onopen() will propagate 'up'
	}
	/** default listener just logs event; ok to override: overwritten by CgServerDriver! */
  wsclose(wsevt: ws.CloseEvent) {
    let { type, code, reason, wasClean } = wsevt
    // If we had the DOM-library, with new CloseEvent(), it would be easy:
    //let evt = new CloseEvent('close', {code, reason, wasClean})
    let evt = { type, code, reason, wasClean} as CloseEvent
		this.ll(1) && console.log(stime(this, '.wsclose'), "SSD: close", evt)
    this.onclose(evt)
	}
	wserror(wsevt: ws.ErrorEvent) {
    let { type, error, message } = wsevt
    // let evt = new ErrorEvent('error', { error, message })
    let evt = { type, error, message } as ErrorEvent
		this.ll(1) && console.log(stime(this, '.wserror'), "SSD: error", evt)
    this.onerror(evt)
	}
	/**
	 * Handle MessageData for this driver [nothing];
   * 
   * Note: MessageEvent(data) -> listeners('message')
	 * @param data 
	 * @override to remove logging
	 */
  override wsmessage(data: DataBuf<I>): void {
    this.ll(2) && console.log(stime(this, `.wsmessage:`), `data[${data.length}]`)
    super.wsmessage(data)
  };
	override connectWebSocket(wss: ws | WebSocket | string): this {
		// use alternate server-side Events and handlers:
		if (wss instanceof ws) {
      console.log(stime(this, `.connectWebSocket: url =`), wss.url)
			this.wss = wss
      wss.addEventListener('open', (ev: ws.Event) => this.wsopen(ev))
      wss.addEventListener('close', (ev: ws.CloseEvent) => this.wsclose(ev))
      wss.addEventListener('error', (ev: ws.ErrorEvent) => this.wserror(ev))
      wss.addEventListener('message', (ev) => { this.onmessage(this.newMessageEvent(ev.data as DataBuf<I>)) })
      // Note: onmessage will invoke this.wsmessage(data) ---> this.upstream.wsmessage(data)
      // wss.emit('open', {}) // hmm, maybe wss was *already* open, so we need to kick it again?
		} else { super.connectWebSocket(wss) }
    return this
	}
	/**
	 *
	 * @param data DataBuf to be sent
	 * @param cb provide specific function for 'onerror' [rare]
	 */
	sendBuffer(data: DataBuf<I>, cb?: (error: Event | Error) => void): void {
		this.wss.send(data, cb); // server-side API (no 'options', undefined)
	}
  closeStream(code: CLOSE_CODE, reason: string): void {
    this.wss.close(code, reason)
  }
}
