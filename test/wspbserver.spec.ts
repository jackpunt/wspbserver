import { CLOSE_CODE, CnxFactory, CnxListener, EitherWebSocket, pbMessage, WSSOpts } from "../src/wspbserver";
import type { CnxHandler } from '../src/CnxHandler'
import { EchoCnx } from '../src/EchoCnx'
import { EzPromise } from "../src/EzPromise";
const moment = require('moment');

const theGraid: WSSOpts = {
	domain: ".thegraid.com",
	port: 8443,
	keydir: "/Users/jpeck/keys/"
}
type CloseInfo = {code: number, reason: string}

/** TestEcho has no deserialize, parseEval nor msg_handler */
class TestEchoCnx extends EchoCnx {
  msgCount: number = 3;

  onerror(reason: Event) {
    super.onerror(reason)
    this.countP.reject(reason)
  }
  /** Interpose to count messages. */
  wsmessage(buf: Buffer) {
    super.wsmessage(buf)  // echo the message to sender
    this.msgCount -= 1
    if (this.msgCount <= 0)
      this.countP.resolve(this.msgCount)
  }
  closeP: EzPromise<CloseInfo> = new EzPromise<CloseInfo>()
  onopen(ev: Event) {
    console.log("TestEcho. onopen:", ev)
  }
  onclose(ev: any) {
    super.onclose(ev)
    this.countP.reject("closed")
    this.closeP.resolve({code: ev, reason: undefined})
  }
  countP: EzPromise<number> = new EzPromise<number>()
  getMsgs(count: number): EzPromise<number> {
    let countP = new EzPromise<number>()
    setTimeout(() => { countP.reject("timeout") }, 500 + count*50) // No-op if promise already fulfilled
    return this.countP = countP
  }
}

const fmt = "YYYY-MM-DD kk:mm:ss.SS"
// console.log("Start Test", moment().format(fmt))
test("WSSOpts", () => {
  expect(Object.entries(theGraid).length).toEqual(3);
})

var pserver = new EzPromise<CnxListener>()
// console.log("pserver", pserver)
var server: CnxListener;
/** set when CnxHandler is created. */
var pcnxt = new EzPromise<CnxHandler<pbMessage>>()

var cnxFactory: CnxFactory = (ws: EitherWebSocket) => {
  let cnxHandler = new TestEchoCnx(ws, null) // creates cnxHander.closeP, .countP
  pcnxt.resolve(cnxHandler)
  return cnxHandler
}
test("make server", () => {
    server = new CnxListener("game7", theGraid, cnxFactory)
    expect(server).toBeInstanceOf(CnxListener)
    server.startListening()
    pserver.resolve(server)
})

var cnx: TestEchoCnx
test("connection", cnx_done => {
  pserver.then((server) => {
    pcnxt.then((cnxHandler) => {
      expect(cnxHandler).toBeInstanceOf(TestEchoCnx)
      cnx = cnxHandler as TestEchoCnx;
      cnx_done()
    })
  })
}, 30000)

var msg_test_p = new EzPromise<string>()
test("message received", msg_done => {
  let count = 3
  pserver.then(() => {
    pcnxt.then(() => {
      cnx.getMsgs(count).then((data) => {
        expect(data).toBe(0)
      }).catch((reason) => {
        expect(reason).toBe("closed")
      }).finally(() => {
        // console.log("received %s messages!", count)
        msg_test_p.resolve("message recieved")
        msg_done()
      })
    })
  })
}, 30000)

test("close client", close_done => {
  let close_msg = "Message done", close_code = CLOSE_CODE.EndpointUnavailable
  pserver.finally(() => {
    pcnxt.finally(() => {
      msg_test_p.finally(() => {
        cnx.closeP.then((result) => {
          let { code, reason } = result
          expect(code).toBe(close_code)
          expect(reason).toBe(undefined)
          close_done()
        })
        // console.log("close client", close_msg)
        cnx.ws.close(close_code, close_msg)
      })
    })
  })
}, 30000)
//cnx.ws.close(0, "test done")


test("close server", srv_closed => {
  // "await" appends: .then((data) => {expect(data)...})
  pserver.finally(() => {
    pcnxt.finally().then(() => {
      cnx.closeP.finally(() => {
        let cb = (err: Error) => {
          expect(err).toBeUndefined()
          setTimeout(() => {
            expect(server.wss.clients.size).toBe(0)
            srv_closed()
          }, 300)
        }
        // console.log("close server", server)
        server.wss.close(cb)
      })
    })
  })
}, 30000) // test timeout
