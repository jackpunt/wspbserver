import { WSSOpts, WssListener } from '../src/wspbserver';
import { CgServerDriver } from '../src/CgServerDriver'
import { EzPromise } from '@thegraid/ezpromise';
import { stime } from '@thegraid/wspbclient';
import type { Server } from 'ws';

// jest will NOT pass useful args to test file
let envhost = process.env["host"] || 'game7'
let envport = process.env["port"] || '8444'
let hostname = process.argv.find((val, ndx, ary) => (ndx>0 && ary[ndx-1] == "--name")) || envhost
let portStr = process.argv.find((val, ndx, ary) => (ndx>0 && ary[ndx-1] == "--port")) || envport
let port = Number.parseInt(portStr)

const cgserver: WSSOpts = {
	domain: ".thegraid.com",
	port: port,
	keydir: "/Users/jpeck/keys/"
}
console.log(stime(), "listen at:", `${hostname}${cgserver.domain}:${cgserver.port}`, process.argv)


let cnxl: WssListener = new WssListener(hostname, cgserver, CgServerDriver);
test("WssListener.constructor", () => {
   // WssListener injects its own SSD<ws$WebSocket> at the bottom of the stack
  expect(cnxl).toBeInstanceOf(WssListener)
})
let cnxlp: EzPromise<WssListener> = cnxl.startListening()
test("startListening", () => {
  return cnxlp.then((wssl) => {
    console.log(stime(), "listening", `${wssl.hostname}:${wssl.port}`)
    expect(wssl.port).toEqual(port)
    expect(wssl.hostname).toEqual(`${hostname}${cgserver.domain}`);
    wssl.wss.on("close", () => { console.log(stime(), "stop listening:", wssl.port)} )
  }, (reason) => {
    console.log(stime(), "reject:", reason)
    expect(reason.code).toEqual("EADDRINUSE")
    expect(reason.code).toBeNull()
  }).finally(() => {
    cnxl.wss.close((err) => { 
      console.log(stime(), "cnxl.wss.close", err)
      closeDone.fulfill(err) 
    })
  })
})
let closeDone = new EzPromise<Error>()
test("closeListenerDone", () => {
  closeDone.then((closeErr) => {
  expect(closeErr).toBeFalsy()
  setTimeout(() => { timedone.fulfill(true) }, 800)
  })
})
let timedone = new EzPromise<boolean>()
test("timeHasPassed", () => {
  return timedone.then((timed) => {
    expect(timed).toBeTruthy()
  })
}) 
