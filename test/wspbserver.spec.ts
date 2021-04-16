import { CLOSE_CODE, CnxFactory, CnxListener, DataBuf, EitherWebSocket, pbMessage, stime, WSSOpts } from "../src/wspbserver";
import { EchoCnx } from '../src/EchoCnx'
import { EzPromise } from "../src/EzPromise";

const theGraid: WSSOpts = {
	domain: ".thegraid.com",
	port: 8443,
	keydir: "/Users/jpeck/keys/"
}
var testTimeout = 8000

var qtest = (name: string, fn?, timeout?) => {}

var dtest = (name: string, pfunc: ()=>void, timeout?: number): void => {
  let donefn: jest.DoneCallback;
  let func = () => { pfunc(); donefn() }
  //test(name, func0, timeout)
  test(name, donfn => { donefn = donfn; func() }, timeout)
}

/** Promise filled when cnx.promiseAll is resolved. */
var msg_cnt_rcvd: EzPromise<number> = new EzPromise<number>()
/** Promise filled({code, reason}) when socket is closed. */
var closeP: EzPromise<CloseInfo> = new EzPromise<CloseInfo>()

type CloseInfo = {code: number, reason: string}
/** TestEcho has no deserialize, parseEval nor msg_handler */
class TestEchoCnx extends EchoCnx {
  constructor(ws, mh, msg_count) {
    super(ws, mh)
    this.setMsgCount(msg_count)
  }

  /** Promise filled when all Promise<message> filled; rejected when any Promise<message> is rejected. */
  promiseAll: Promise<DataBuf[]>;
  msgP: EzPromise<DataBuf>[] = Array<EzPromise<DataBuf>>()
  msgMax: number = 3;    // decrement to 0 -> 
  msgCount: number = 0;  // increment 
  setMsgCount(n:number) {
    for (let i = 0; i<n; i++) {
      let msgPith = new EzPromise<DataBuf>()
      msgPith.catch((reason: any) => {
        console.log("%s msgP.catch: reason=", stime(), reason)
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
  getMsgs(count: number): Promise<DataBuf[]>  {
    let zero = this.msgCount
    let promises = this.msgP.slice(zero, zero+count)
    // console.log("%s getMsgs: promises.length=", timeStr, promises.length, zero, count)
    this.promiseAll = Promise.all(promises)
    this.promiseAll.finally(() => msg_cnt_rcvd.resolve(this.msgCount - zero))
    return this.promiseAll
  }
  setMsgTimeout(base: number, perMsg: number) {
    let promises = this.msgP.slice(0, )
    promises.forEach((p, ndx) => 
      setTimeout(() => { p.reject("timeout") }, base + ndx*perMsg) // No-op if promise already fulfilled
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
    setTimeout(() => {
      super.wsmessage(buf)  // echo the message to sender
      this.countP.resolve(buf)
      this.msgCount++
    }, 15)
  }
  onopen(ev: Event) {
    console.log("TestEcho. onopen:", ev)
  }
  onclose(ev: any) {
    super.onclose(ev)
    if (this.msgCount < this.msgP.length)
      this.countP.reject("client closed")
    closeP.resolve({code: ev, reason: undefined}) // synthesize {code, reason} (wss only supplies code)
  }
}

// console.log("Start Test", stime())
test("wss: WSSOpts", () => {
  expect(Object.entries(theGraid).length).toEqual(3);
})

var pserver = new EzPromise<CnxListener>()
pserver.catch((reason: any) => {
  console.log("%s pserver.catch: reason=", stime(), reason)
})
// console.log("pserver", pserver)
var server: CnxListener;
/** set when CnxHandler is created. */
var pcnxt = new EzPromise<TestEchoCnx>()
/** Promises for each Message received and for Close */
var testEchoCnx = new TestEchoCnx(null, null, 3); // Promises: testEchoCnx.msgP[3], closeP

var cnxFactory: CnxFactory = (ws: EitherWebSocket) => {
  testEchoCnx.ws = ws;
  pcnxt.resolve(testEchoCnx)
  return testEchoCnx
}
test("wss: make server", () => {
    server = new CnxListener("game7", theGraid, cnxFactory)
    expect(server).toBeInstanceOf(CnxListener)
    server.startListening()
    console.log("%s Ready for client connection", stime())
    pserver.resolve(server)
})

var cnx: TestEchoCnx = testEchoCnx;
dtest("wss: zconnection", () =>
  pcnxt.then((cnxHandler: TestEchoCnx) => {
    expect(cnxHandler).toBeInstanceOf(TestEchoCnx)
    console.log("%s client connection", stime())
    cnx.setMsgTimeout(400, 50)
  }), testTimeout)

var close_reason = "all messages recieved"
dtest("wss: all messages received", () => {
      msg_cnt_rcvd.then((count) => {
        setTimeout(()=>{
        console.log("%s allMsgs.filled: count=", stime(), count)
        expect(count).toBe(cnx.msgMax)
        cnx.ws.close(CLOSE_CODE.NormalCLosure, close_reason)
        }, 30)
      }, (rej_reason: any) => {
        console.log("%s allMsgs.rejected: reason=", stime(), rej_reason)
        cnx.ws.close(CLOSE_CODE.Empty, "failed")
      }).catch((rej_reason) => {
        console.log("%s allMsgs.catch: reason=", stime(), rej_reason)
        expect(rej_reason).toBeDefined()
      })
}, testTimeout+5000)

/** verify local socket closed cleanly */
dtest("wss: close client", () =>
  closeP.then((result: CloseInfo) => {
    console.log("%s close client: resfn result=", stime(), result)
    let close_code = CLOSE_CODE.NormalCLosure
    let { code, reason } = result
    expect(code).toBe(close_code)
    expect(reason || close_reason).toBe(close_reason)
}), testTimeout)


test("wss: close server", srv_closed => {
  closeP.finally(() => {
    // wait a bit, then close server socket:
    // setTimeout(() => {
      console.log("%s close server", stime(), server.wss.clients.size)
      server.wss.close((err: Error) => {
        expect(err).toBeUndefined()
        expect(server.wss.clients.size).toBe(0)
        srv_closed()
      })
    // }, 20)
  })
}, testTimeout)
