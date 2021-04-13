import { CLOSE_CODE, CnxFactory, CnxHandler, CnxListener, EchoCnx, EitherWebSocket, pbMessage, PbParser, WSSOpts } from "../src/wspbserver";
const moment = require('moment');

const theGraid: WSSOpts = {
	domain: ".thegraid.com",
	port: 8443,
	keydir: "/Users/jpeck/keys/"
}
class PromiseTriad<T> {
  constructor() {
    this.promise = new Promise<T>((res, rej) => {
      this.res = res;
      this.rej = rej;
    })
  }
  promise: Promise<T>;
  res: (result: T) => void;
  rej: (reason: any) => void
}
type CloseInfo = {code: number, reason: string}

/** TestEcho has no deserialize, parseEval nor msg_handler */
class TestEchoCnx extends EchoCnx {
  msgCount: number = 3;

  onerror(reason: Event) {
    super.onerror(reason)
    this.countP.rej(reason)
  }
  /** Interpose to count messages. */
  wsmessage(buf: Buffer) {
    super.wsmessage(buf)  // echo the message to sender
    this.msgCount -= 1
    if (this.msgCount <= 0)
      this.countP.res(this.msgCount)
  }
  closeP: PromiseTriad<CloseInfo> = new PromiseTriad<CloseInfo>()
  onopen(ev: Event) {
    console.log("TestEcho. onopen:", ev)
  }
  onclose(ev: any) {
    super.onclose(ev)
    this.countP.rej("closed")
    this.closeP.res({code: ev, reason: undefined})
  }
  countP: PromiseTriad<number> = new PromiseTriad<number>()
  getMsgs(count: number): PromiseTriad<number> {
    let countP = new PromiseTriad<number>()
    setTimeout(() => { countP.rej("timeout") }, 500 + count*50) // No-op if promise already fulfilled
    return this.countP = countP
  }
}

const fmt = "YYYY-MM-DD kk:mm:ss.SS"
console.log("Start Test", moment().format(fmt))
test("WSSOpts", () => {
  expect(Object.entries(theGraid).length).toEqual(3);
})

var pserver = new PromiseTriad<CnxListener>()
var server: CnxListener;
/** set when CnxHandler is created. */
var pcnxt = new PromiseTriad<CnxHandler<pbMessage>>()

var cnxFactory: CnxFactory = (ws: EitherWebSocket) => {
  let cnxHandler = new TestEchoCnx(ws, null) // creates cnxHander.closeP, .countP
  pcnxt.res(cnxHandler)
  return cnxHandler
}
test("make server", () => {
    server = new CnxListener("game7", theGraid, cnxFactory)
    expect(server).toBeInstanceOf(CnxListener)
    server.startListening()
    pserver.res(server)
})

var cnx: TestEchoCnx
test("connection", cnx_done => {
  pserver.promise.then((server) => {
    pcnxt.promise.then((cnxHandler) => {
      expect(cnxHandler).toBeInstanceOf(TestEchoCnx)
      cnx = cnxHandler as TestEchoCnx;
      cnx_done()
    })
  })
}, 30000)

var msg_test_p = new PromiseTriad<string>()
test("message received", msg_done => {
  let count = 3
  pserver.promise.then(() => {
    pcnxt.promise.then(() => {
      cnx.getMsgs(count).promise.then((data) => {
        expect(data).toBe(0)
      }).catch((reason) => {
        expect(reason).toBe("closed")
      }).finally(() => {
        console.log("received %s messages!", count)
        msg_test_p.res("message recieved")
        msg_done()
      })
    })
  })
}, 30000)

test("close client", close_done => {
  let close_msg = "Message done", close_code = CLOSE_CODE.EndpointUnavailable
  pserver.promise.finally(() => {
    pcnxt.promise.finally(() => {
      msg_test_p.promise.finally(() => {
        cnx.closeP.promise.then((result) => {
          let { code, reason } = result
          expect(code).toBe(close_code)
          expect(reason).toBe(undefined)
          close_done()
        })
      cnx.ws.close(close_code, close_msg)
      })
    })
  })
}, 30000)
//cnx.ws.close(0, "test done")


test("close server", srv_closed => {
  // "await" appends: .then((data) => {expect(data)...})
  pserver.promise.finally(() => {
    pcnxt.promise.finally().then(() => {
      cnx.closeP.promise.finally(() => {
        let cb = (err: Error) => {
          expect(err).toBeUndefined()
          setTimeout(() => {
            expect(server.wss.clients.size).toBe(0)
            srv_closed()
          }, 300)
        }
        server.wss.close(cb)
      })
    })
  })
}, 30000) // test timeout
