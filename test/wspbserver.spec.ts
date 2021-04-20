import { CLOSE_CODE, CnxFactory, CnxListener, DataBuf, EitherWebSocket, pbMessage, stime, WSSOpts } from "../src/wspbserver";
import { EchoCnx } from '../src/EchoCnx'
import { EzPromise } from "../src/EzPromise";

const theGraid: WSSOpts = {
  domain: ".thegraid.com",
  port: 8443,
  keydir: "/Users/jpeck/keys/"
}
var testTimeout = 4000
/** Promises for each Message received and for Close */
var testEchoCnx: TestEchoCnx;

/** Promise filled when cnx.promiseAll is resolved. */
var msg_cnt_rcvd: EzPromise<number> = new EzPromise<number>()
msg_cnt_rcvd.catch((reason) => { console.log(stime(), "msg_cnt_rcvd-catch", reason) })
msg_cnt_rcvd.finally(() => {
  let code = !!msg_cnt_rcvd.reason ? CLOSE_CODE.Empty : CLOSE_CODE.NormalCLosure;
  console.log(stime(), "msg_cnt_rcvd-finally", code, msg_cnt_rcvd.reason)
  if (testEchoCnx.ws)
    testEchoCnx.ws.close(code, msg_cnt_rcvd.reason || close_success)
})
/** Promise filled({code, reason}) when socket is closed. */
var closeP: EzPromise<CloseInfo> = new EzPromise<CloseInfo>()
closeP.catch((reason) => { console.log(stime(), "closeP-catch:", reason) })

type CloseInfo = { code: number, reason: string }
/** TestEcho has no deserialize, parseEval nor msg_handler */
class TestEchoCnx extends EchoCnx {
  name = "TestEchoCnx instance"
  constructor(ws, mh, msg_count) {
    super(ws, mh)
    this.setMsgCount(msg_count)
  }

  /** Promise filled when all Promise<message> filled; rejected when any Promise<message> is rejected. */
  promiseAll: Promise<DataBuf[]>;
  msgP: EzPromise<DataBuf>[] = Array<EzPromise<DataBuf>>()
  msgMax: number = 3;    // decrement to 0 -> 
  msgCount: number = 0;  // increment 
  setMsgCount(n: number) {
    for (let i = 0; i < n; i++) {
      let msgPith = new EzPromise<DataBuf>()
      msgPith.catch((reason: any) => {
        console.log(stime(), "msgP.catch: reason=", reason)
      })
      this.msgP.push(msgPith)
    }
    this.msgMax = n
    this.getMsgs(this.msgMax)   // Promise to get all the msgMax messages
  }
  /** 
   * Promise to fullfil next [count] Promise<message>: fulfilled(all) or reject(timeout) 
   * setTimeout on each Promise<message>
   * @param number of message Promises to wait on.
   */
  getMsgs(count: number): Promise<DataBuf[]> {
    let zero = this.msgCount
    let promises = this.msgP.slice(zero, zero + count)
    // console.log(stime(), "getMsgs: promises.length=", promises.length, zero, count)
    this.promiseAll = Promise.all(promises)
    this.promiseAll.finally(() => msg_cnt_rcvd.fulfill(this.msgCount - zero))
    return this.promiseAll
  }
  setMsgTimeout(base: number, perMsg: number) {
    let promises = this.msgP.slice(0,)
    promises.forEach((p, ndx) =>
      setTimeout(() => { p.reject("timeout") }, base + ndx * perMsg) // No-op if promise already fulfilled
    )
  }

  /** Promise resolved(msg_number) when next message recieved. */
  get countP(): EzPromise<DataBuf> {
    return (this.msgCount < this.msgP.length) ? this.msgP[this.msgCount] : new EzPromise<DataBuf>()
  }

  onerror(reason: Event) {
    super.onerror(reason)
    this.countP.reject(reason)
  }
  /** Interpose to count messages. */
  wsmessage(buf: DataBuf) {
    this.wsreceived(buf)
    setTimeout(() => {
      this.wsechoback(buf)  // echo the message to sender
      this.countP.fulfill(buf)
      this.msgCount++
    }, 20)
  }
  onopen(ev: Event) {
    console.log(stime(), "TestEcho. onopen:", ev)
  }
  onclose(ev: any) {
    super.onclose(ev)
    if (this.msgCount < this.msgP.length)
      this.countP.reject("client closed")
    closeP.fulfill({ code: ev, reason: undefined }) // synthesize {code, reason} (wss only supplies code)
  }
}
testEchoCnx = new TestEchoCnx(null, null, 3); // Promises: testEchoCnx.msgP[3], closeP

// console.log(stime(), "Start Test")
test("wss: WSSOpts", () => {
  expect(Object.entries(theGraid).length).toEqual(3);
})

var pserver = new EzPromise<CnxListener>()
pserver.catch((reason: any) => {
  console.log(stime(), "pserver.catch: reason=", reason)
})
// console.log(stime(), "pserver", pserver)

/** set when CnxHandler is created. */
var pcnxt = new EzPromise<TestEchoCnx>();
pcnxt.catch((reason) => { 
  console.log(stime(), "pcnxt-catch:", reason) 
  msg_cnt_rcvd.reject(reason) 
})

var cnxFactory: CnxFactory = (ws: EitherWebSocket) => {
  testEchoCnx.ws = ws;
  pcnxt.fulfill(testEchoCnx)
  return testEchoCnx
}
const server: CnxListener = new CnxListener("game7", theGraid, cnxFactory);
test("wss: make server", () => {
  console.log(stime(), "make server:", server.hostname, "wss=", server.wss)
  expect(server).toBeInstanceOf(CnxListener)
})

test("wss: server listening", () => {
  return server.startListening().then((server_also) => {
    console.log(stime(), "Server Listening")
    expect(server_also).toBe(server)
    pserver.fulfill(server)
  }, (reason) => {
    fail(reason)
  }).catch((reason: Error) => {
    console.log(stime(), "Listen failed:", reason.message)
  })
}, 1000)

test("wss: connection", done => {
  //pcnxt.then(() => done())
  setTimeout(() => {
    if (!pcnxt.resolved) console.log(stime(), "wss: connection -- timeout, no client")
    pcnxt.reject(close_failure)
  }, testTimeout - 300)
  pcnxt.then((cnxHandler: TestEchoCnx) => {
    console.log(stime(), "client connection", cnxHandler.name)
    expect(pcnxt.value).toBeInstanceOf(TestEchoCnx)
    cnx.setMsgTimeout(400, 50)
    done()
  }, (rej) => {
    // Hack to fake a reject(reason), which would confuse Jest:
    closeP.fulfill({ code: CLOSE_CODE.Empty, reason: rej });
    //closeP.reject(rej)
  }).catch((rej) => console.log(stime(), "catching pcnxt--", rej))
}, testTimeout - 100)

var close_success = "all messages recieved"
var close_failure = "no client connection"
var cnx: TestEchoCnx = testEchoCnx;
describe("messages received", () => {
  test("wss: all messages", () => {
    return msg_cnt_rcvd.then((value) => {
      expect(value).toBe(cnx.msgMax)
    }).catch((reason) => {
      expect(reason).toMatch(/no client connection/)
    })
    // OR: exclusive test:
    //return expect(msg_cnt_rcvd).resolves.toBe(cnx.msgMax);
    //return expect(msg_cnt_rcvd).rejects.toMatch(/no client connection/);
  }, testTimeout)
})

describe("closing", () => {
  /** verify local socket closed cleanly */
  test("wss: close client", done =>
    closeP.then((result: CloseInfo) => {
      console.log(stime(), "close client: resfn result=", result)
      let close_code = CLOSE_CODE.NormalCLosure
      let { code, reason } = result
      // Hack because using closeP.reject() explodes the jest framework
      if (code == CLOSE_CODE.Empty) {
        expect(reason).toBe(close_failure)
      } else {
        expect(code).toBe(close_code)
        expect(reason || close_success).toBe(close_success)
      }
      done()
    },
      (rej) => {
        expect(rej).toBe(close_failure)
        done()
      })
    , testTimeout + 50)


  test("wss: close server", srv_closed => {
    closeP.finally(() => {
      // wait a bit, then close server socket:
      // setTimeout(() => {
      // console.log(stime(), "close server", server)
      // console.log(stime(), "close server", server.wss)
      // console.log(stime(), "close server", server.wss.clients)
      console.log(stime(), "close server", server.wss.clients.size)
      server.wss.close((err: Error) => {
        expect(err).toBeUndefined()
        expect(server.wss.clients.size).toBe(0)
        srv_closed()
      })
      // }, 20)
    })
  }, testTimeout + 100)
})
