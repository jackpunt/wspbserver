import * as wspb from "fs";
import * as https from "https";
import * as http from "http";
import * as dns from "dns";
import * as ws from "ws";
import * as moment from 'moment';
import * as jspb from 'google-protobuf';

// Access to ws.WebSocket class! https://github.com/websockets/ws/issues/1517 
declare module 'ws' {
  export interface WebSocket extends ws { }
}

export interface pbMessage extends jspb.Message {}

// BINARY_TYPES: ['nodebuffer', 'arraybuffer', 'fragments'],
export type BINARY_TYPES = 'nodebuffer' | 'arraybuffer' | 'fragments';

/** parameters for WebSocket Secure Listener */
export interface  WSSOpts { domain: string, port: number, keydir: string, }

/** a subset of https.ServerOptions */
export type Credentials = https.ServerOptions // {key: string, cert: string}

export interface WsServerOptions extends ws.ServerOptions {
	host?: string, port?: number, 
	backlog?: number,
	server?: http.Server | https.Server, 
	verifyClient?: ws.VerifyClientCallbackAsync | ws.VerifyClientCallbackSync, 
	handleProtocols?: () => void,
	path?: string,  // restrict websocket to [urls with] path
	noServer?: boolean, 
	perMessageDeflate?: boolean | ws.PerMessageDeflateOptions, 
	clientTracking?: boolean,
	maxPayload?: number
	binaryType?: BINARY_TYPES,
}

export	type eitherWebSocket = WebSocket | ws.WebSocket
export type CnxFactory = (ws: eitherWebSocket) => CnxHandler<pbMessage>;
export const fmt = "YYYY-MM-DD kk:mm:ss.SS"

/** standard HTML [Web]Socket events, for client (& server?) */
export interface WebSocketEventHandler {
	onopen?: (ev: Event) => void | null;  // { target: WebSocket }
	onerror?: (ev: Event) => void | null; // { target: WebSocket, error: any, message: any, type: string }
	onclose?: (ev: CloseEvent) => void | null; // { target: WebSocket, wasClean: boolean, code: number, reason: string; }
	onmessage: (ev: MessageEvent) => void | null; // { target: WebSocket, data: any, type: string }
}

interface wsCallbacks {
	onopen: (event: ws.OpenEvent) => void;
	onerror: (event: ws.ErrorEvent) => void;
	onclose: (event: ws.CloseEvent) => void;
	onmessage: (event: ws.MessageEvent) => void;
}
/** node ws.WebSocket events, for server */
export interface WsServerEventHandler {
	onopen?: (ev: Event) => void | null;
	onerror?: (ev: Event) => void | null;
	onclose?: (ev: CloseEvent) => void | null;
	wsmessage: (buf: Buffer | Uint8Array) => void | null; // (buf: {any[] | Buffer | ArrayBuffer })
}
export interface PbMessageHandler<T extends pbMessage> {
	deserialize(bytes: Buffer | Uint8Array): T;
	serialize(message:T): Buffer | Uint8Array;
	parseEval(message:T): void;
}
/**
 * Simplest CnxHandler: just log each method with timeStamp.
 * Similar to gammaNg.wsConnect interface MsgParser
 * see also: WebSocketEventMap, <K extends keyof WebSocketEventMap>
 */
export class CnxHandler<T extends pbMessage> implements WsServerEventHandler {
	ws: eitherWebSocket; // set by connection
	msg_handler: PbMessageHandler<T>;

	sendError: (error: Event) => void;

	serialize(message: pbMessage): Uint8Array {
		let writer = new jspb.BinaryWriter();
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/dot-notation
		message["serialize"](writer)
		return writer.getResultBuffer()
	}
	sendBuffer(data: Buffer | Uint8Array, cb?: (error: Event | Error) => void) {
		if (this.ws instanceof WebSocket) {
			this.sendError = cb
			this.ws.send(data)
		} else {
			this.ws.send(data, undefined, cb)
		}
	}

	constructor(ws: eitherWebSocket) {
		this.ws = ws
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
		if (typeof(this.sendError) === 'function')
		  this.sendBuffer.call(this, ev)
	}
	/** received a message<T> from eitherWebSocket */
	onmessage(msg: MessageEvent | Buffer | Uint8Array) {
		let data = (msg instanceof MessageEvent) ? msg.data : msg
		this.wsmessage(data)
	}
	/** received a ArrayBuffer<T> from WebSocket or ws.WebSocket */
  wsmessage(buf: Buffer | Uint8Array) {
    console.log("%s RECEIVED:", moment().format(fmt), buf.length, buf)
		let msg = this.msg_handler.deserialize(buf)
		this.msg_handler.parseEval(msg)
	}
}

/**
 * a Secure WebSocket Listener (wss://)
 * Listening for connections on the given wss://host.domain:port/ [secured by keydir] 
 * 
 */
export class CnxManager {
	basename: string = "localhost"
	domain: string = ".local"
	hostname: string = this.basename + this.domain
	port: number = 8443;
	keydir = "/Users/jpeck/keys/";
	keypath: string = this.keydir + this.basename + '.key.pem'
	certpath: string = this.keydir + this.basename + '.cert.pem'
	credentials: Credentials
	cnxFactory: CnxFactory;
	cnxHandler: CnxHandler<pbMessage>;

  /**
   * 
   * @param basename identifies the hostname and the key/cert alias
   * @param wssOpts 
   * @param cnxHanlder a class of CnxHandler: new cnxHanlder(ws)
   * @param cnxFactory (ws) => CnxHandler; must supply cnxHandler == undefined
   */
  constructor(basename: string, wssOpts: WSSOpts, cnxHandler: typeof CnxHandler, cnxFactory?: CnxFactory ) {
    let { domain, port, keydir } = wssOpts
    this.port = port;
    this.keydir = keydir;
    this.keypath = this.keydir + basename + '.key.pem';
    this.certpath = this.keydir + basename + '.cert.pem';
    this.hostname = basename + domain;
    this.credentials = this.getCredentials(this.keypath, this.certpath)

    this.cnxFactory = (cnxHandler !== undefined)
      ? (ws) => new cnxHandler(ws)
      : cnxFactory as CnxFactory
  }
	
	run() {
    this.run_server(this.hostname, this.port)
    //this.dnsLookup(this.hostname, (addr,fam)=>{this.run_server(addr, this.port)})
	}
	/** https.Server.listen(host, port) does not require DNS addr */
  dnsLookup(hostname: string, callback: (addr: string, fam: number) => void, thisArg: any = this) {
		dns.lookup(hostname, (err, addr, fam) => {
			console.log('rv=', { err, addr, fam });
			if (err) console.log("Error", { code: err.code, error: err })
			else callback.call(thisArg, addr, fam)
		})
	}
	getCredentials(keypath: string, certpath: string): Credentials {
		let privateKey = wspb.readFileSync(this.keypath, 'utf8');
		let certificate = wspb.readFileSync(this.certpath, 'utf8');
		return { key: privateKey, cert: certificate };
	}

  baseOpts: WsServerOptions = {
		binaryType: 'arraybuffer',
		perMessageDeflate: false
	}
	wssUpgrade(httpsServer: https.Server, opts: WsServerOptions = this.baseOpts): ws.Server {
		return new ws.Server(Object.assign({}, opts, {server: httpsServer}));
	}
	make_wss_server(host: string, port: number): ws.Server {
		console.log('try listen on %s:%d', host, port);
		//pass in your express app and credentials to create an https server
		let httpsServer = https.createServer(this.credentials, undefined).listen(port, host);
		console.log('listening on %s:%d', host, port);
		const wss = this.wssUpgrade(httpsServer)
		console.log('d: %s starting: wss=%s', moment().format(fmt), wss);
		return wss;
	}
  connection(ws: ws.WebSocket, req: http.IncomingMessage) {
    let remote_addr: string = req.socket.remoteAddress
    let remote_port: number = req.socket.remotePort
    let remote_family: string = req.socket.remoteFamily
    let remote = {addr: req.socket.remoteAddress, port: req.socket.remotePort, family: req.socket.remoteFamily}
    this.cnxHandler = this.cnxFactory(ws)

    ws.on('open', (ev: Event) => this.cnxHandler.onopen(ev));
    ws.on('close', (ev: Event) => this.cnxHandler.onclose(ev));
    ws.on('error', (ev: Event) => this.cnxHandler.onerror(ev));
    ws.on('message', (buf: Buffer) => this.cnxHandler.wsmessage(buf));
    // QQQQ: do we need to invoke: this.cnxHandler.open() ??
  }

	run_server(host: string, port: number = this.port) {
		let wss = this.make_wss_server(host, port)
		wss.on('connection', (ws: ws.WebSocket, req: http.IncomingMessage) => this.connection(ws, req));
	}
}

