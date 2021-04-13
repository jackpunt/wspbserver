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

/** 
 * websocket close codes.
 * 
 * https://docs.microsoft.com/en-us/dotnet/api/system.net.websockets.websocketclosestatus 
 */
export enum CLOSE_CODE { NormalCLosure = 1000, EndpointUnavailable = 1001, Empty = 1005 }

/** parameters for WebSocket Secure Listener */
export interface  WSSOpts { domain: string, port: number, keydir: string, }

/** a subset of https.ServerOptions */
export type Credentials = https.ServerOptions // {key: string, cert: string}
export type EitherWebSocket = WebSocket | ws.WebSocket
export type DataBuf = Buffer | Uint8Array
export type CnxFactory = (ws: EitherWebSocket) => CnxHandler<pbMessage>;
export const fmt = "YYYY-MM-DD kk:mm:ss.SS"

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

/** standard HTML [Web]Socket events, for client (& server ws.WebSocket) */
export interface WebSocketEventHandler {
	onopen: (ev: Event) => void | null;  // { target: WebSocket }
	onerror: (ev: Event) => void | null; // { target: WebSocket, error: any, message: any, type: string }
	onclose: (ev: CloseEvent) => void | null; // { target: WebSocket, wasClean: boolean, code: number, reason: string; }
	onmessage: (ev: MessageEvent) => void | null; // { target: WebSocket, data: any, type: string }
	wsmessage: (buf: DataBuf) => void | null; // from ws.WebSocket Node.js server (buf: {any[] | Buffer })
}

export interface PbParser<T extends pbMessage> {
	deserialize(bytes: DataBuf): T
	parseEval(message:T): void;
}
/**
 * Simplest CnxHandler: just log each method with timeStamp.
 * Similar to gammaNg.wsConnect interface MsgParser
 * see also: WebSocketEventMap, <K extends keyof WebSocketEventMap>
 */
export class CnxHandler<T extends pbMessage> implements WebSocketEventHandler, PbParser<T> {
	/** The underlying Socket to send/receive bytes. */
	ws: EitherWebSocket; // set by connection
  /** in principal, one could inject an alternative msg_handler... */
  msg_handler: PbParser<T>;

	/**
	 * Send & Recieve [protobuf] messages over a WebSocket.
	 * 
	 * @param ws the WebSocket or ws.WebSocket being serviced
	 * @param msg_handler optional override PbMessage handler; default: 'this'
	 */
	constructor(ws: EitherWebSocket, msg_handler?: PbParser<T>) {
		this.ws = ws
		this.msg_handler = msg_handler || this
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

	sendError: (error: Event) => void;

	/**
	 * 
	 * @param data DataBuf to be sent
	 * @param cb provide specific function for 'onerror'
	 */
	sendBuffer(data: DataBuf, cb?: (error: Event | Error) => void) {
		if (this.ws instanceof ws.EventEmitter) {
			this.ws.send(data, undefined, cb)
		} else {
			this.sendError = cb
			this.ws.send(data)
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
		if (typeof(this.sendError) === 'function')
		  this.sendBuffer.call(this, ev)
	}
	/** received a message<T> from EitherWebSocket */
	onmessage(msg: MessageEvent | DataBuf) {
		let data = (msg instanceof MessageEvent) ? msg.data : msg
		this.wsmessage(data)
	}
	/** received a DataBuf<T> from ws.WebSocket or MessageEvent */
	wsmessage(buf: DataBuf) {
		if (!!this.msg_handler) {
			let msg = this.msg_handler.deserialize(buf)
			this.msg_handler.parseEval(msg)
		}
	}
}

/**
 * a Secure WebSocket Listener (wss://)
 * Listening for connections on the given wss://host.domain:port/ [secured by keydir] 
 * 
 */
export class CnxListener {
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
	wss: ws.Server
  /**
   * 
   * @param basename identifies the hostname and the key/cert alias
   * @param wssOpts 
   * @param cnxHanlder a class of CnxHandler: new cnxHanlder(ws)
   * @param cnxFactory (ws) => CnxHandler; must supply cnxHandler == undefined
   */
  constructor(basename: string, wssOpts: WSSOpts, cnxFactory: CnxFactory ) {
    let { domain, port, keydir } = wssOpts
    this.port = port;
    this.keydir = keydir;
    this.keypath = this.keydir + basename + '.key.pem';
    this.certpath = this.keydir + basename + '.cert.pem';
    this.hostname = basename + domain;
    this.credentials = this.getCredentials(this.keypath, this.certpath)

    this.cnxFactory = cnxFactory
  }
	
	startListening() {
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
	/** All server-listeners or on Node.js, using ws.WebSocket. */
  connection(ws: ws.WebSocket, req: http.IncomingMessage) {
    let remote_addr: string = req.socket.remoteAddress
    let remote_port: number = req.socket.remotePort
    let remote_family: string = req.socket.remoteFamily
    let remote = {addr: req.socket.remoteAddress, port: req.socket.remotePort, family: req.socket.remoteFamily}
    this.cnxHandler = this.cnxFactory(ws)

    ws.on('open', (ev: Event) => this.cnxHandler.onopen(ev));
    ws.on('close', (ev: Event) => this.cnxHandler.onclose(ev));
    ws.on('error', (ev: Event) => this.cnxHandler.onerror(ev));
    ws.on('message', (buf: DataBuf) => this.cnxHandler.wsmessage(buf));
    // QQQQ: do we need to invoke: this.cnxHandler.open() ??
  }

	run_server(host: string, port: number = this.port) {
		this.wss = this.make_wss_server(host, port)
		this.wss.on('connection', (ws: ws.WebSocket, req: http.IncomingMessage) => this.connection(ws, req));
	}
}

/** A CnxHandler that handles incoming(buf) by sending it back to this.ws */
export class EchoCnx extends CnxHandler<pbMessage> {
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
