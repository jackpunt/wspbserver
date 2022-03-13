import { className, EzPromise, stime } from "@thegraid/wspbclient";
import { Server as HttpsServer } from "https";
//import { CLOSING, CLOSED } from "ws";
import { CgServerDriver, srvrOpts, startListening, WssListener, wssServer } from "../src";

// jest will NOT pass useful args to test file
let srvropts = srvrOpts('game6', '8443', '=')
let isListening = new EzPromise<WssListener>()
let info = wssServer(isListening, 'testListen', srvropts, CgServerDriver ) // NOT startListening()
let cnxl = info.cnxl

test("WssListener.constructor", () => {
  // WssListener injects its own SSD<ws$WebSocket> at the bottom of the stack
  expect(cnxl).toBeInstanceOf(WssListener)
  expect(cnxl.httpsServer).toBeInstanceOf(HttpsServer)
  if (!info.cnxlp) startListening(cnxl, 'testListen', isListening)
})

test("isListening", () => {
  return isListening.then((wssl) => {
    expect(wssl.port).toEqual(srvropts.port)
    expect(wssl.hostname).toEqual(`${info.host}.${srvropts.domain}`);
  }, (reason) => {
    expect(reason.code).toMatch(/EADDRINUSE|EADDRNOTAVAIL/)
    expect(reason.code).toBeNull()
  }).finally(() => {
    cnxl.close((err) => { 
      console.log(stime('isListening'), `WssListener closed`, 'state=', cnxl.state, 'err=', err)
      closeDone.fulfill()
    })
    // httpsServer & cnxl.wss both have already fired their 'close' callbacks!
    console.log(stime('isListening'), `cnxl.close called: state=`, cnxl.state)
  })
})
let closeDone = new EzPromise<void>()
test("closeDone", () => {
  return closeDone.then(() => {
    expect(cnxl.state).toBe('CLOSED')
  })
})
test("timetolog", () => {
  return new Promise<void>((fulfill) => {
    setTimeout(() => { fulfill() }, 10)
  })
}) 