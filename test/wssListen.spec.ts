import { className, EzPromise, stime } from "@thegraid/wspbclient";
import { Server as HttpsServer } from "https";
//import { CLOSING, CLOSED } from "ws";
import { CgServerDriver, startListening, WssListener, wssServer } from "../src";

// jest will NOT pass useful args to test file
let envhost = process.env["host"] || 'game7'
let envport = process.env["port"] || '8444'
let hostname = process.argv.find((val, ndx, ary) => (ndx>0 && ary[ndx-1] == "host=")) || envhost
let portStr = process.argv.find((val, ndx, ary) => (ndx>0 && ary[ndx-1] == "port=")) || envport
let port = Number.parseInt(portStr)

let isListening = new EzPromise<WssListener>()
let info = wssServer(isListening, 'testListen', hostname, portStr, CgServerDriver ) // NOT startListening()
let cnxl = info.cnxl

test("WssListener.constructor", () => {
  // WssListener injects its own SSD<ws$WebSocket> at the bottom of the stack
  expect(cnxl).toBeInstanceOf(WssListener)
  expect(cnxl.httpsServer).toBeInstanceOf(HttpsServer)
  if (!info.cnxlp) startListening(cnxl, 'testListen', isListening)
})

test("isListening", () => {
  return isListening.then((wssl) => {
    expect(wssl.port).toEqual(port)
    expect(wssl.hostname).toEqual(`${hostname}${info.svropts.domain}`);
  }, (reason) => {
    expect(reason.code).toMatch(/EADDRINUSE|EADDRNOTAVAIL/)
    expect(reason.code).toBeNull()
  }).finally(() => {
    cnxl.close((err) => { 
      console.log(stime(), `WssListener closed`, '_state=', cnxl.state, 'err=', err)
      closeDone.fulfill()
    })
    // httpsServer & cnxl.wss both have already fired their 'close' callbacks!
    console.log(stime(), `cnxl.close called: _state=`, cnxl.state)
  })
})
let closeDone = new EzPromise<void>()
test("closeDone", () => {
  return closeDone.then(() => {
    expect(cnxl.state).toBe('CLOSED')
  })
})
// test("timetolog", () => {
//   return new Promise<void>((fulfill) => {
//     setTimeout(() => { fulfill() }, 500)
//   })
// }) 