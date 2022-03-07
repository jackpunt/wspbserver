import { className, EzPromise, stime } from "@thegraid/wspbclient";
import { Server as HttpsServer } from "https";
//import { CLOSING, CLOSED } from "ws";
import { CgServerDriver, startListening, WssListener, wssServer } from "../src";

const RUNNING = 0;
const CLOSING = 1;
const CLOSED = 2;
// jest will NOT pass useful args to test file
let envhost = process.env["host"] || 'game7'
let envport = process.env["port"] || '8444'
let hostname = process.argv.find((val, ndx, ary) => (ndx>0 && ary[ndx-1] == "--name")) || envhost
let portStr = process.argv.find((val, ndx, ary) => (ndx>0 && ary[ndx-1] == "--port")) || envport
let port = Number.parseInt(portStr)

let info = wssServer(undefined, hostname, portStr, CgServerDriver ) // && startListening()
let cnxl = info.cnxl
let cnxlp = info.cnxlp || new EzPromise<WssListener>()

test("WssListener.constructor", () => {
  // WssListener injects its own SSD<ws$WebSocket> at the bottom of the stack
  expect(cnxl).toBeInstanceOf(WssListener)
  expect(cnxl.httpsServer).toBeInstanceOf(HttpsServer)
  if (!info.cnxlp) {
    cnxlp = startListening(cnxl, 'testListen')
    cnxlp.then((wssl: WssListener | PromiseLike<WssListener>) => { 
      isListening.fulfill(wssl) 
    })
  }
})

let isListening = new EzPromise<WssListener>()
test("isListening", () => {
  return isListening.then((wssl) => {
    console.log(stime(), "listening", `${wssl.hostname}:${wssl.port}`, '_state=', wssl.wss['_state'])
    expect(wssl.port).toEqual(port)
    expect(wssl.hostname).toEqual(`${hostname}${info.svropts.domain}`);
    //httpServer = cnxl.wss['_server']
    //console.log(stime(), '_server=', httpServer);
  }, (reason) => {
    expect(reason.code).toMatch(/EADDRINUSE|EADDRNOTAVAIL/)
    expect(reason.code).toBeNull()
  }).finally(() => {
    cnxl.wss.on("close", () => { 
      console.log(stime(), "cnxl.wss.closed:", cnxl.port, '_state=', cnxl.wss['_state'])
    })
    // close httpsServer before closing websocket server
    cnxl.close((err) => { 
      err && console.log(stime(), "cnxl.close: err=", err)
      console.log(stime(), `WssListener closed`, '_state=', cnxl.wss['_state'])
      closeDone.fulfill()
    })
    // httpsServer & cnxl.wss both have already fired their 'close' callbacks!
    console.log(stime(), `cnxl.close called: _state=`, cnxl.wss['_state'])
  })
})
let closeDone = new EzPromise<void>()
test("closeDone", () => {
  return closeDone.then(() => {
    expect(cnxl.wss['_state']).toBe(CLOSED)
  })
})
// test("timetolog", () => {
//   return new Promise<void>((fulfill) => {
//     setTimeout(() => { fulfill() }, 500)
//   })
// }) 