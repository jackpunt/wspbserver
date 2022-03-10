import { buildURL, stime } from "@thegraid/common-lib"
import { wsWebSocketBase } from './wsWebSocketBase'
import { wsWebSocket } from "./wsWebSocket"
import { EzPromise } from '@thegraid/ezpromise'
import { pbMessage, CloseInfo, close_fail, close_normal, readyState } from '@thegraid/wspbclient'
import type { AWebSocket, WebSocketBase } from '@thegraid/wspbclient'
import { argVal } from '../src'

const wsbase = new wsWebSocketBase<pbMessage, pbMessage>()

const openP = new EzPromise<AWebSocket>()
openP.then(opened, rejected).catch(catchRej)
function rejected(reason: any) { console.log(stime(), `rejected: ${reason}`)}
function catchRej(reason: any) { console.log(stime(), `catchRej: ${reason}`)}
function opened(ws: WebSocket) {
  console.log(stime(), `opened:`, ws.url)
  closeStream(wsbase)
}

function closeStream(wsbase: WebSocketBase<pbMessage, pbMessage>) {
  console.log(stime(), `try closeStream(normal, '${close_normal.reason}')`)
  try {
    wsbase.closeStream(close_normal.code, close_normal.reason) // wsbase.ws.close(code, reason)
  } catch (err) {
    console.log(stime(), "closeStream error:", err)
    closeP.fulfill(close_fail)
  }
}

const closeP = new EzPromise<CloseInfo>()
closeP.then(() => closed)
function closed(cinfo: any) {
  let opened = wsWebSocket.socketsOpened, closed = wsWebSocket.socketsClosed
  console.log(stime(), `test done: socket count=`, { opened, closed, pid: process.pid })
  console.log(stime(), "client CLOSED:", cinfo, readyState(wsbase.ws))
  setTimeout(() => { console.log(stime(), "client END OF TEST!") }, 10)
}
let host = argVal('host', 'game7', 'X')  // jest-compatible: Xhost game6
let portStr = argVal('port', '8444', 'X'), port = Number.parseInt(portStr)

const echourl = buildURL('wss', host, 'thegraid.com', 8443)   // "wss://game7.thegraid.com:8443"
const servurl = buildURL('wss', host, 'thegraid.com', port)   // "wss://game7.thegraid.com:8444"
const testurl: string = servurl;
const echoserver: boolean = (testurl == echourl) // if echoserver, don't expect server to ACK msgs
console.log(`testCnx:`, testurl)
let wsDriver = wsbase.connectWebSocket(testurl, openP, closeP)
