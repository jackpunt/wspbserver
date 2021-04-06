var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var fs = require("fs");
var https = require("https");
var dns = require("dns");
var ws = require("ws");
'nodebuffer' | 'arraybuffer' | 'fragments';
var theGraid = {
    domain: ".thegraid.com",
    port: 8443,
    keydir: "/Users/jpeck/keys/"
};
/** log each method with timeStamp. */
var CnxHandler = (function () {
    function CnxHandler(ws) {
        this.ws = ws;
    }
    CnxHandler.prototype.error = function (e) {
        console.log('%s error: %s', new Date(), e.message);
    };
    CnxHandler.prototype.open = function () {
        console.log('%s open', new Date().toTimeString());
    };
    CnxHandler.prototype.message = function (message, flags) {
        // message appears to be a 'Buffer'
        console.log("%s RECEIVED:", new Date().toTimeString(), { message: message, flags: flags });
        console.log("%s received: message.length= %s, flags= %s, flags.binary=%s", new Date().toTimeString(), message.length, flags, (flags && flags.binary));
    };
    CnxHandler.prototype.close = function () {
        console.log('%s disconnected', new Date());
    };
    return CnxHandler;
})();
exports.CnxHandler = CnxHandler;
/** handle incoming() but sending back to this.ws */
var EchoServer = (function (_super) {
    __extends(EchoServer, _super);
    function EchoServer() {
        _super.apply(this, arguments);
    }
    // message appears to be a 'Buffer'
    EchoServer.prototype.message = function (message, flags) {
        _super.prototype.message.call(this, message, flags);
        var ack = function (error) {
            if (!error) {
                console.log('%s sent: %s', new Date().toTimeString(), "success");
            }
            else {
                console.log('%s error: %s', new Date().toTimeString(), error);
            }
        };
        this.ws.send(message, ack);
    };
    return EchoServer;
})(CnxHandler);
exports.EchoServer = EchoServer;
/**
 * a Secure WebSocket Server (wss://)
 * listening and responding on wss://NAME.thegraid.com:PORT/
 */
var CnxManager = (function () {
    function CnxManager(basename, wssOpts, cnxType) {
        var _this = this;
        if (basename === void 0) { basename = "game7"; }
        this.basename = "localhost";
        this.domain = ".local";
        this.hostname = this.basename + this.domain;
        this.port = 8443;
        this.keydir = "/Users/jpeck/keys/";
        this.keypath = this.keydir + this.basename + '.key.pem';
        this.certpath = this.keydir + this.basename + '.cert.pem';
        this.dumpobj = function (name, obj) {
            console.log("dumping obj=" + name);
            if (obj) {
                for (var k in obj) {
                    console.log(name + "." + k + "=" + obj[k]);
                }
            }
        };
        this.baseOpts = {
            binaryType: 'arraybuffer',
            perMessageDeflate: false
        };
        this.run_server = function (host, port) {
            var wss = _this.make_wss_server(host, port);
            var cnxmgr = _this;
            wss.on('connection', function (ws, req) { return _this.connection(ws, req); });
            // (socket: ws.WebSocket, req: http.IncomingMessage) => {this.connection.call(mgr, ws, req)}
        };
        var domain = wssOpts.domain, port = wssOpts.port, keydir = wssOpts.keydir;
        this.port = port;
        this.keydir = keydir;
        this.keypath = this.keydir + basename + '.key.pem';
        this.certpath = this.keydir + basename + '.cert.pem';
        this.hostname = basename + domain;
        this.credentials = this.getCredentials(this.keypath, this.certpath);
        this.cnxType = cnxType;
    }
    CnxManager.prototype.run = function () {
        this.dnsLookup(this.hostname, this.run_server);
    };
    CnxManager.prototype.dnsLookup = function (hostname, callback) {
        var _this = this;
        dns.lookup(hostname, function (err, addr, fam) {
            console.log('rv=', { err: err, addr: addr, fam: fam });
            console.log('rv.address=%s', addr);
            if (err)
                console.log("Error", { code: err.code, error: err });
            else
                callback(addr, _this.port);
        });
    };
    CnxManager.prototype.getCredentials = function (keypath, certpath) {
        var privateKey = fs.readFileSync(this.keypath, 'utf8');
        var certificate = fs.readFileSync(this.certpath, 'utf8');
        return { key: privateKey, cert: certificate };
    };
    CnxManager.prototype.wssUpgrade = function (httpsServer, opts) {
        if (opts === void 0) { opts = this.baseOpts; }
        opts.server = httpsServer;
        return new ws.Server(opts);
    };
    CnxManager.prototype.make_wss_server = function (host, port) {
        console.log('try listen on %s:%d', host, port);
        //pass in your express app and credentials to create an https server
        var httpsServer = https.createServer(this.credentials, undefined).listen(port, host);
        console.log('listening on %s:%d', host, port);
        var wss = this.wssUpgrade(httpsServer);
        console.log('d: %s starting: wss=%s', new Date(), wss);
        return wss;
    };
    CnxManager.prototype.connection = function (ws, req) {
        var _this = this;
        var remote_addr = req.socket.remoteAddress;
        this.handler = new this.cnxType(ws);
        ws.on('open', function () { return _this.handler.open(); });
        ws.on('message', function (buf, flags) { return _this.handler.message(buf, flags); });
        ws.on('error', function (e) { return _this.handler.error(e); });
        ws.on('close', function () { return _this.handler.close(); });
    };
    return CnxManager;
})();
exports.CnxManager = CnxManager;
