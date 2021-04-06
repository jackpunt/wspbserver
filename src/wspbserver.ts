import * as fs from "fs";
import * as https from "https";
import * as http from "http";
import * as dns from "dns";
import * as ws from "ws"

// Access to ws.WebSocket class! https://github.com/websockets/ws/issues/1517 
declare module 'ws' {
  export interface WebSocket extends ws { }
}

// BINARY_TYPES: ['nodebuffer', 'arraybuffer', 'fragments'],
type BINARY_TYPES = 'nodebuffer' | 'arraybuffer' | 'fragments';

export interface  WSSOpts { domain: string, port: number, keydir: string, }

const theGraid: WSSOpts = {
	domain: ".thegraid.com",
	port: 8443,
	keydir: "/Users/jpeck/keys/"
}

export interface WSOpts extends ws.ServerOptions {
	host?: string, port?: number, backlog?: number,
	server?: http.Server | https.Server, 
	verifyClient?: ws.VerifyClientCallbackAsync | ws.VerifyClientCallbackSync, 
	handleProtocols?: () => void,
	path?: string, 
	noServer?: boolean, 
	perMessageDeflate?: boolean | ws.PerMessageDeflateOptions, 
	clientTracking?: boolean,
	maxPayload?: number
	binaryType?: BINARY_TYPES,
}
/** log each method with timeStamp. */
export class CnxHandler {
	ws: ws.WebSocket; // set by connection

	constructor(ws: ws.WebSocket) {
		this.ws = ws
	}

	error(e: Error) {
		console.log('%s error: %s', new Date(), e.message);
	}
	open() {
		console.log('%s open', new Date().toTimeString());
	}
	message(message: Buffer, flags) {
		// message appears to be a 'Buffer'
		console.log("%s RECEIVED:", new Date().toTimeString(), {message, flags})
		console.log("%s received: message.length= %s, flags= %s, flags.binary=%s",
			new Date().toTimeString(), message.length, flags, (flags && flags.binary));
	}
	close() {
		console.log('%s disconnected', new Date());
	}
}
/** handle incoming() but sending back to this.ws */
export class EchoServer extends CnxHandler {
	// message appears to be a 'Buffer'
	message(message: Buffer, flags) {
		super.message(message, flags)
		let ack = (error: Error) => {
			if (!error) {
				console.log('%s sent: %s', new Date().toTimeString(), "success");
			} else {
				console.log('%s error: %s', new Date().toTimeString(), error);
			}
		}
		this.ws.send(message,  ack);
	}
}

// a subset of https.ServerOptions
export type Credentials = https.ServerOptions // {key: string, cert: string}
/**
 * a Secure WebSocket Server (wss://)
 * listening and responding on wss://NAME.thegraid.com:PORT/
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
	cnxType: typeof CnxHandler;
	handler: CnxHandler;
	
	run() {
		this.dnsLookup(this.hostname, this.run_server)
	}
	dnsLookup(hostname: string, callback: (addr: string, fam: number) => void) {
		dns.lookup(hostname, (err, addr, fam) => {
			console.log('rv=', { err: err, addr: addr, fam: fam });
			console.log('rv.address=%s', addr);
			if (err) console.log("Error", { code: err.code, error: err })
			else callback(addr, this.port)
		})
	}
	getCredentials(keypath: string, certpath: string): Credentials {
		let privateKey = fs.readFileSync(this.keypath, 'utf8');
		let certificate = fs.readFileSync(this.certpath, 'utf8');
		return { key: privateKey, cert: certificate };
	}

	constructor(basename: string = "game7", wssOpts: WSSOpts, cnxType: typeof CnxHandler) {
		let { domain, port, keydir } = wssOpts
		this.port = port;
		this.keydir = keydir;
		this.keypath = this.keydir + basename + '.key.pem';
		this.certpath = this.keydir + basename + '.cert.pem';
		this.hostname = basename + domain;
		this.credentials = this.getCredentials(this.keypath, this.certpath)
		this.cnxType = cnxType
	}

	dumpobj = (name, obj) => {
		console.log("dumping obj=" + name);
		if (obj) {
			for (let k in obj) {
				console.log(name + "." + k + "=" + obj[k]);
			}
		}
	};
	baseOpts: WSOpts = {
		binaryType: 'arraybuffer',
		perMessageDeflate: false
	}
	wssUpgrade(httpsServer: https.Server, opts: WSOpts = this.baseOpts): ws.Server {
		opts.server = httpsServer;
		return new ws.Server(opts);
	}
	make_wss_server(host: string, port: number): ws.Server {
		console.log('try listen on %s:%d', host, port);
		//pass in your express app and credentials to create an https server
		let httpsServer = https.createServer(this.credentials, undefined).listen(port, host);
		console.log('listening on %s:%d', host, port);
		const wss = this.wssUpgrade(httpsServer)
		console.log('d: %s starting: wss=%s', new Date(), wss);
		return wss;
	}
	connection(ws: ws.WebSocket, req: http.IncomingMessage) {
  		let remote_addr: string = req.socket.remoteAddress
			this.handler = new this.cnxType(ws)

      ws.on('open', () => this.handler.open());
			ws.on('message', (buf: Buffer, flags: any) => this.handler.message(buf, flags));
			ws.on('error', (e: Error) => this.handler.error(e));
			ws.on('close', () => this.handler.close());
		}

	run_server = (host: string, port: number) => {
		let wss = this.make_wss_server(host, port)
    let cnxmgr = this
		wss.on('connection', (ws: ws.WebSocket, req: http.IncomingMessage) => this.connection(ws, req));
    // (socket: ws.WebSocket, req: http.IncomingMessage) => {this.connection.call(mgr, ws, req)}
	}
}

