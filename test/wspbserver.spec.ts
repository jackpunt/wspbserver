import { CLOSE_CODE, CnxFactory, CnxListener, DataBuf, EitherWebSocket, pbMessage, WSSOpts } from "../src/wspbserver";
import type { CnxHandler } from '../src/CnxHandler'
import { EchoCnx } from '../src/EchoCnx'
import { EzPromise } from "../src/EzPromise";

const moment = require('moment');

const fmt = "YYYY-MM-DD kk:mm:ss.SSS"
var timeStr = () => moment().format(fmt)

const theGraid: WSSOpts = {
	domain: ".thegraid.com",
	port: 8443,
	keydir: "/Users/jpeck/keys/"
}
var testTimeout = 8000

var qtest = (name: string, fn?, timeout?) => {}
var ztest = (name: string, promises: EzPromise<any>[], resfn?, rejfn?, timeout?: number): void => {
  if (typeof (rejfn) !== 'function') { timeout = rejfn; rejfn = (reason: any) => { } }
  if (typeof (resfn) !== 'function') { timeout = resfn; resfn = (value: any) => { } }
  console.log("ztest: name=%s, timeout=%s", name, timeout)
  let prev = promises.reverse()
  let inner = prev.shift()
  let donefn: jest.DoneCallback;
  let fil = (val) => {resfn(val); donefn() }
  let rej = (rea) => {rejfn(rea); donefn() }
  let func = () => { inner.then(fil, rej) }
  let funcs: Array<()=>void> = [ func ]
  prev.forEach((p,n) => {
    func = funcs[n+1] = () => p.finally(() => funcs[n]()); 
  });
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
        console.log("%s msgP.catch: reason=", timeStr(), reason)
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
    super.wsmessage(buf)  // echo the message to sender
    this.countP.resolve(buf)
    this.msgCount++
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

// console.log("Start Test", timeStr())
test("wss: WSSOpts", () => {
  expect(Object.entries(theGraid).length).toEqual(3);
})

var pserver = new EzPromise<CnxListener>()
pserver.catch((reason: any) => {
  console.log("%s pserver.catch: reason=", timeStr(), reason)
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
    console.log("%s Ready for client connection", timeStr())
    pserver.resolve(server)
})

var cnx: TestEchoCnx = testEchoCnx;
qtest("wss: connection", cnx_done => {
  pserver.finally(() => {
    pcnxt.then((cnxHandler: TestEchoCnx) => {
      expect(cnxHandler).toBeInstanceOf(TestEchoCnx)
      console.log("%s client connection", timeStr())
      cnx.setMsgTimeout(400, 50)
      cnx_done()
    })
  })
}, testTimeout)
// ztest("wss: zconnection", [pserver, pcnxt],
//   (cnxHandler: TestEchoCnx) => {
//     expect(cnxHandler).toBeInstanceOf(TestEchoCnx)
//     console.log("%s client connection", timeStr())
//     cnx.setMsgTimeout(400, 50)
//   },
//     testTimeout)


var simpleres = (result: any) => {
  expect(result).toBeTruthy()
  console.log("%s wss: simple", timeStr())
}
var simplerej = (reason: any) => {
  expect(reason).toBeTruthy()
  console.log("%s wss: simple", timeStr())
}
var simplep = new EzPromise<number>(); simplep.resolve(5)
ztest("wss: simple", [simplep, pserver], simpleres, simplerej, testTimeout)
test("wss: simple test",
  donef => {
    let func = () => {
        pserver.then(
          (res) => { simpleres(res); donef() },
          (rea) => { simplerej(rea); donef() }
        )
      };
     let fin = () => {
      simplep.finally(
        () => func()
      )
    }
    fin()
  },
  testTimeout)
/** linked to cnx.promiseAll: Promises.all() */
var all_msgs_recd = new EzPromise<string>()
test("wss: all messages received", msg_done => {
  let count = cnx.msgMax // get all requested messages
  let allMsgs = cnx.promiseAll // uber Promise
  pserver.finally(() => {
    pcnxt.then(() => {
      allMsgs.then((data) => {
        console.log("%s allMsgs.filled: data.length=", timeStr(), data.length)
        expect(data.length).toBe(count)
        cnx.ws.close(CLOSE_CODE.NormalCLosure, "all messages received")
      }, (reason: any) => {
        console.log("%s allMsgs.rejected: reason=", timeStr(), reason)
        cnx.ws.close(CLOSE_CODE.Empty, "failed")
      }).catch((reason) => {
        console.log("%s allMsgs.catch: reason=", timeStr(), reason)
        expect(reason).toBeDefined()
      }).finally(() => {
        // console.log("%s allMsgs.finally: count= %s", timeStr(), count)
        all_msgs_recd.resolve("all messages done")
        msg_done()
      })
    })
  })
}, testTimeout+5000)

// ztest("name", [], (res) => { expect(foo).toBe() })
// test("name", done => { fn(); done(); })
// test("name", done => inner.then(n(); done(); ) )
let resfn = (result: CloseInfo) => {
  console.log("%s close client: resfn result=", timeStr(), result)
  let close_msg = "Message done", close_code = CLOSE_CODE.NormalCLosure
  let { code, reason } = result
  expect(code).toBe(close_code)
  expect(reason).toBe(undefined)
}
let rejfn = (rej: any): void => {
  console.log("%s close client: rejfn", timeStr(), rej)
}

//ztest("wss: close", [pserver, pcnxt, msg_cnt_rcvd, closeP], resfn, rejfn, testTimeout )

/** verify local socket is closed, due to closing client socket */
test("wss: close client", close_done => {
  let donefn = () => { }
  let iff =
    (res) => {
      console.log("%s close client: iff", timeStr())
      resfn(res);
      donefn();
    }
  let ifr = (rej) => {
    console.log("%s close client: ifr", timeStr())
    rejfn(rej);
    donefn();
  }
  console.log("%s close client: testfn invoked", timeStr(), close_done)
  donefn = close_done
  
  pserver.finally(() => {
    pcnxt.finally(() => {
      all_msgs_recd.finally(() => {
        closeP.then(iff, ifr)
      })
    })
  })
}, testTimeout)


test("wss: close server", srv_closed => {
  pserver.finally(() => {
    pcnxt.finally(() => {
      closeP.finally(() => {
        let cb = (err: Error) => {
          expect(err).toBeUndefined()
          setTimeout(() => {
            console.log("%s close server cb", timeStr(), server.wss.clients.size)
            expect(server.wss.clients.size).toBe(0)
            srv_closed()
          }, 300)
        }
        console.log("%s close server", timeStr(), server.wss.clients.size)
        // server.wss.close(cb)
        setTimeout(()=>{server.wss.close(cb)}, 20) // wait a bit, then close:
      })
    })
  })
}, testTimeout) // test timeout
