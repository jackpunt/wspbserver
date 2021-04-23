import * as fs from "fs";
import * as https from "https";
import type * as http from "http";
import * as dns from "dns";
import * as ws from "ws";
import * as moment from 'moment';
import type * as jspb from 'google-protobuf';
import { EzPromise } from "@thegraid/EzPromise";


// Access to ws.WebSocket class! https://github.com/websockets/ws/issues/1517 
declare module 'ws' {
  export interface WebSocket extends ws { }
}

export interface pbMessage extends jspb.Message {}

// node_modules/ws/lib/constants: BINARY_TYPES: ['nodebuffer', 'arraybuffer', 'fragments'],
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
export type DataBuf = Buffer | Uint8Array
export interface SocketSender { sendBuffer(bytes: DataBuf, cb?: (error: Event | Error) => void): void }
export type CnxFactory = (ws: ws.WebSocket, request?: http.IncomingMessage) => void;
export const fmt = "YYYY-MM-DD kk:mm:ss.SSS"
export function stime() { return moment().format(fmt)}

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
	parseEval(message:T, ...args:any): void;
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
	
	/** 
	 * Promise fulfills when server is Listening; rejects if error (EADDRINUSE). 
	 * @return EzPromise\<this\> where this.wss is the ws.Server
	 */
	startListening(): EzPromise<this> {
		return this.make_wss_server(this.hostname, this.port)
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
		let privateKey = fs.readFileSync(this.keypath, 'utf8');
		let certificate = fs.readFileSync(this.certpath, 'utf8');
		return { key: privateKey, cert: certificate };
	}

  baseOpts: WsServerOptions = {
		binaryType: 'arraybuffer',
		perMessageDeflate: false
	}
	wssUpgrade(httpsServer: https.Server, opts: WsServerOptions = this.baseOpts): ws.Server {
		return new ws.Server(Object.assign({}, opts, {server: httpsServer}));
	}
	/** 
	 * Promise fulfills when server is Listening; rejects if error (ex: EADDRINUSE). 
	 * @return EzPromise\<this\> where this.wss is the ws.Server
	 */
	make_wss_server(host: string, port: number): EzPromise<this> {
		// console.log('%s try listen on %s:%d', moment().format(fmt), host, port);
		// pass in your express app and credentials to create an https server
		let pserver = new EzPromise<this>()
		let httpsServer = https.createServer(this.credentials, undefined)
		let wss = this.wss = this.wssUpgrade(httpsServer)
		wss.on('error', (error: Error)=>{ pserver.reject(error) })
		wss.on('listening', () => { pserver.fulfill(this) })
		wss.on('connection', (ws: ws.WebSocket, req: http.IncomingMessage) => this.onconnection(ws, req));
		httpsServer.listen(port, host);
		return pserver;
	}
	/** All server-listeners or on Node.js, using ws.WebSocket. */
  onconnection(ws: ws.WebSocket, req: http.IncomingMessage) {
    let remote_addr: string = req.socket.remoteAddress
    let remote_port: number = req.socket.remotePort
    let remote_family: string = req.socket.remoteFamily
    let remote = {addr: req.socket.remoteAddress, port: req.socket.remotePort, family: req.socket.remoteFamily}
    let cnxHandler = this.cnxFactory(ws, req)
  }
}


