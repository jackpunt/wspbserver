import * as fs from "fs";
import * as https from "https";
import type * as http from "http";
import * as dns from "dns";
import * as ws from "ws";
import { EzPromise } from "@thegraid/EzPromise";
import { ServerSocketDriver } from "./ServerSocketDriver";
import { AnyWSD, pbMessage, stime } from "@thegraid/wspbclient";

/** class/constructor for AnyWSD [a WebSocketDriver for browser or ws/nodejs WebSocket] */
export type WSDriver = (new () => AnyWSD)
// Access to ws.WebSocket class! https://github.com/websockets/ws/issues/1517 
declare module 'ws' {
  export interface WebSocket extends ws { }
}

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

export type Remote = {addr: string, port: number, family: string}

/** Reminder of options that 'ws' makes available, 
 * WssListener default sets binaryType: 'arraybuffer' 
 */
export interface WsServerOptions extends ws.ServerOptions {
	host?: string, port?: number, 
	backlog?: number,
	server?: http.Server | https.Server, 
	verifyClient?: ws.VerifyClientCallbackAsync | ws.VerifyClientCallbackSync, 
	handleProtocols?: () => string | false, // choose from client-offered protocols
	path?: string,  // restrict websocket to [urls with] path
	noServer?: boolean, 
	perMessageDeflate?: boolean | ws.PerMessageDeflateOptions, 
	clientTracking?: boolean,
	maxPayload?: number
	binaryType?: BINARY_TYPES,
}

/**
 * a Secure WebSocket Listener (wss://)
 * Listening for connections on the given wss://host.domain:port/ [secured by keydir] 
 * 
 */
export class WssListener {
	basename: string = "localhost"
	domain: string = ".local"
	hostname: string = this.basename + this.domain
	port: number = 8443;
	keydir: string;
	keypath: string;
	certpath: string;
	credentials: Credentials
	/** ServerSocketDriver class contructor. */
	SSD: (new (remote?: Remote) => ServerSocketDriver<pbMessage>) = ServerSocketDriver;
	drivers: (new()=>AnyWSD)[]
  httpsServer: https.Server;
	wss: ws.Server
  baseOpts: WsServerOptions = {
		binaryType: 'arraybuffer',
		perMessageDeflate: false
	}
  static stateNames = ['OPEN', 'CLOSING', 'CLOSED']
  get state() { return WssListener.stateNames[this.wss['_state']] }

	/**
	 * Listen for connections;  
	 * Make stream from ServerSocketDriver up through given Drivers
	 * @param basename identifies the hostname and the key/cert alias
	 * @param wssOpts {domain, port, keypath}
	 * @param drivers any stackable WebSocketDriver
	 */
	constructor(basename: string, wssOpts: WSSOpts, ...drivers: WSDriver[]) {
		let { domain, port, keydir } = wssOpts
    this.port = port;
    this.keydir = keydir;
    this.keypath = this.keydir + basename + '.key.pem';
    this.certpath = this.keydir + basename + '.cert.pem';
    this.hostname = basename + domain;
    this.credentials = this.getCredentials(this.keypath, this.certpath)
		this.drivers = drivers
		this.httpsServer = https.createServer(this.credentials, undefined)
		this.wss = this.makeWsServer(this.httpsServer, this.baseOpts)
  }
	
	/** 
	 * Promise fulfills when server is Listening; rejects if error (EADDRINUSE). 
   * @param pListener an EzPromise: fulfill on 'listen'; reject on 'error'
	 * @return EzPromise\<this> where this.wss is the ws.Server
	 */
	startListening(pListener = new EzPromise<WssListener>(), backlog?: number): EzPromise<WssListener> {
    let wss = this.wss
    wss.on('error', (error: Error) => { pListener.reject(error) })
    wss.on('connection', (ws: ws.WebSocket, req: http.IncomingMessage) => this.onconnection(ws, req));
    this.httpsServer.listen(this.port, this.hostname, backlog, () => { pListener.fulfill(this) });
		return pListener;
	}
  /** close httpsServer & then wss */
  close(cb?: (err: Error) => void) {
    this.httpsServer.close((err) => { err; this.wss.close(cb) })
  }
	
  /** https.Server.listen(host, port) does not require DNS addr */
  dnsLookup(hostname: string, callback: (addr: string, fam: number) => void, thisArg: any = this) {
		dns.lookup(hostname, (err, addr, fam) => {
			console.debug(stime(this, `.dnsLookup: return =`), { err, addr, fam });
			if (err) console.error(stime(this, `.dnsLookup: Error =`), { code: err.code, error: err, addr, fam })
			else callback.call(thisArg, addr, fam)
		})
	}
	getCredentials(keypath: string, certpath: string): Credentials {
		let privateKey = fs.readFileSync(this.keypath, 'utf8');
		let certificate = fs.readFileSync(this.certpath, 'utf8');
		return { key: privateKey, cert: certificate };
	}

	makeWsServer(httpsServer: https.Server, opts: WsServerOptions = this.baseOpts): ws.Server {
    return new ws.Server(Object.assign({ server: httpsServer }, opts));
	}

	/**
	 * Invoked for each new connection to this server.
	 * 
	 * new this.WSB().connectStream(ws, ...this.drivers)
	 * 
	 * @param ws the newly connected ws.WebSocket
	 * @param request contains info from HTTP 
	 */
  onconnection(ws: ws.WebSocket, request: http.IncomingMessage) {
		let addr: string = request.socket.remoteAddress
		let port: number = request.socket.remotePort
		let family: string = request.socket.remoteFamily
		let remote: Remote = { addr, port, family }
		let ssd = new this.SSD(remote) // new () => ServerSocketDriver: WebSocketBase
		ssd.connectStream(ws, ...this.drivers)
  }
}
