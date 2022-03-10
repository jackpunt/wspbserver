import { WebSocketBase, CgMessage, CgType, AckPromise } from '@thegraid/wspbclient'
import type { CgClient } from '@thegraid/wspbclient'
import { DataBuf, stime, EzPromise, pbMessage, CLOSE_CODE, AWebSocket, readyState} from '@thegraid/wspbclient'
import { wsWebSocket, ws } from './wsWebSocket'
import { buildURL } from '@thegraid/common-lib'
import { TestCgClient, TestCgClientR, wsCgWebSocketBase, wsWebSocketBase } from './wsWebSocketBase'
import { srvrOpts } from '../src/wssServer'

var testTimeout = 3000;
let showenv = !!process.argv.find((val, ndx, ary) => (val == "Xshowenv"))
let nomsgs = !!process.argv.find((val, ndx, ary) => (val == "Xnomsgs"))
let { host, port, domain } = srvrOpts('game7', '8444', 'X')

const echourl = buildURL('wss', host, domain, 8443)   // "wss://game7.thegraid.com:8443"
const cgservurl = buildURL('wss', host, domain, port) // "wss://game7.thegraid.com:8444"
const testurl: string = cgservurl;
const echoserver: boolean = (testurl == echourl) // if echoserver, expect no Ack.

console.log(stime(), "CgServer.spec ", `args`, { argv: process.argv, host, port, nomsgs });
showenv && console.log(stime(), "CgServer.spec ", `env`, { argv: process.env })

type CloseInfo = { code: number, reason: string }
function normalClose(reason:string): CloseInfo { return {code: CLOSE_CODE.NormalCLosure, reason: reason}}
var close_normal: CloseInfo = {code: CLOSE_CODE.NormalCLosure, reason: "test done" }
var close_fail: CloseInfo = { code: CLOSE_CODE.Empty, reason: "failed"}

const testPromises: EzPromise<any>[] = [];
/** function to track that sent msg recv's expected response. */
function testMessage<W>(name: string, thisP: EzPromise<W>, msgGen: () => AckPromise,
  expectMsg: (ack: CgMessage) => void, 
  expectRej?: (reason: any) => void,
  afterPrep?: () => void,
  timeout: number = testTimeout): EzPromise<AckPromise> {
  let priorP = thisP || testPromises[0]
  let nextP = new EzPromise<AckPromise>()
  test(name, () => {
    return priorP.then((fil: W) => {
      let msgP = msgGen()
      new TestMsgAcked(name, msgP, nextP, expectMsg, expectRej)
      if (!!afterPrep) afterPrep()
    })
  }, timeout)
  testPromises.unshift(nextP)
  return nextP
}

/** helper class for function testMessage() */
class TestMsgAcked {
  name: string;
  message: CgMessage
  pAck: AckPromise
  pAckp: EzPromise<AckPromise>
  /** msgGen creates pAck, run test.expect() when that ack/nak is fulfilled by CgBase.parseEval(ack/nak). */
  constructor(name: string, pAck: AckPromise, pAckp: EzPromise<AckPromise>, 
    expectMsg: (ack: CgMessage) => void, expectRej?: (reason: any) => void) {
    this.name = name;
    this.pAck = pAck
    this.pAckp = pAckp
    this.message = pAck.message

    this.pAck.then((ack) => { expectMsg(ack) }, (reason: any) => { !!expectRej && expectRej(reason) })
    this.pAck.finally(() => { pAckp.fulfill(pAck) }) 
    let handler = (msg: CgMessage) => { console.log(stime(this, `.listenForAck: FOUND FOR '${this.name}'`), msg.cgType) }
    wsbase.listenFor(CgType.ack, handler)
  }
}


const openP0 = new EzPromise<AWebSocket>(); // referee: refwsbase
const closeP0 = new EzPromise<CloseInfo>(); // referee: refwsbase
/** Promise filled({code, reason}) when client wsbase.ws is closed. */
const closeP: EzPromise<CloseInfo> = new EzPromise<CloseInfo>()
closeP.then((reason) => { console.log(stime(), "closeP-wsbase.closed:", reason) })
closeP.catch((reason) => { console.log(stime(), "closeP-wsbase.catch:", reason) })

/** a CgClient as Referee. */
const cgClient0 = new TestCgClientR<never>()
/** create a CgClient, stack it on the WebSocketDriver stream */
const cgclient: CgClient<pbMessage> = new TestCgClient();
/** a wsBaseDriver */
const wsbase: wsWebSocketBase<pbMessage, pbMessage>= new wsWebSocketBase<pbMessage, pbMessage>() // create a WebSocket Driver
const okToClose = new EzPromise<string>() // 

const group_name = "test_group"
const refDone = new EzPromise<boolean>()
let refwsbase: wsCgWebSocketBase = new wsCgWebSocketBase() // using wsWebSocket
const openP = new EzPromise<AWebSocket>()

describe("Opening", () => {
  test("client0 (referee) Open", () => {
    console.log(stime(), "try connect referee to url =", testurl)
    refwsbase.connectWebSocket(testurl, openP0, closeP0)
    closeP0.then((info) => {
      console.log(stime(), `closeP0 fulfilled [presumably client0 closed]`, info)
    })
    return openP0.then((ws) => {
      console.log(stime(), "client0 (referee wsbase) OPEN", (ws === refwsbase.ws))
      cgClient0.connectDnStream(refwsbase) // push TestCgClientR Driver
      cgClient0.send_join(group_name, 0, "referee").then((ack: CgMessage) => {
        console.log(stime(), "client0 (referee) JOINED: ", ack.success)
        expect(ack.success).toBeTruthy()
        expect(cgClient0.client_id).toBe(0)
        refDone.fulfill(true)
        console.log(stime(), "client0 refDone.resolved=", refDone.resolved)
      })
    }, (reason) => {
        console.log(stime(), `client0 (referee) failed to join:`, reason)
        refDone.reject(reason)
        closeP0.fulfill({ code: 0, reason: `failed to open: ${reason}`})
    })
  })

  openP.catch((rej) => { console.log(stime(), "openP.catch", rej) })

  const close_timeout = testTimeout - 500

  test("wsbase.construct & connect", () => {
    // wait for previous test to complete
    return refDone.then((ack) => {
      expect(wsbase).toBeInstanceOf(WebSocketBase)

      cgclient.connectDnStream(wsbase)   // push CgClient Driver
      expect(cgclient.dnstream).toBe(wsbase)
      expect(wsbase.upstream).toBe(cgclient)

      console.log(stime(), "try connect client to url =", testurl)
      wsbase.connectWebSocket(testurl, openP, closeP) // start the connection sequence --> openP
      expect(wsbase.ws).toBeInstanceOf(wsWebSocket)   // wsbase.ws exists
      console.log(stime(), "pwsbase.fulfill(wsbase)", readyState(wsbase.ws))
      //pwsbase.fulfill(wsbase)                         // assert we have the components of wsbase & wsbase.ws
      setTimeout(() => openP.reject("timeout"), 500); // is moot if already connected/fulfilled
    })
  })

  //let pwsbase: EzPromise<wsWebSocketBase<pbMessage, pbMessage>>;// = new EzPromise<wsWebSocketBase<pbMessage, pbMessage>>()
  //let pwsbase: EzPromise<wsWebSocketBase<pbMessage, pbMessage>> = new EzPromise<wsWebSocketBase<pbMessage, pbMessage>>()

  // const pCgClient = new EzPromise<CgClient<pbMessage>>();  // fulfill when stacked
  // test("wsbase.push CgClient", () => {
  //   return pwsbase.then((wsbase) => {
  //     console.log(stime(), "CgClient.connectDnStream try push CgClient Driver")
  //     cgclient.connectDnStream(wsbase)
  //     expect(cgclient.dnstream).toBe(wsbase)
  //     expect(wsbase.upstream).toBe(cgclient)
  //     pCgClient.fulfill(cgclient)
  //   })
  // })

  test("wsbase.ws connected & OPEN", () => {
    return openP.then((ws) => {
      expect(ws).toBeInstanceOf(wsWebSocket)
      expect(ws.readyState).toBe(ws.OPEN);
      console.log(stime(this, ` setTimeout(okToClose.fulfill("timout"), ${close_timeout})`))
      setTimeout(() => {
        okToClose.fulfill("timeout")
      }, close_timeout)
    }, (rej) => {
      console.log("WebSocket connection rejected", rej)
      okToClose.fulfill("no websocket connection")
      fail(rej)
      //expect(rej).toBe("timeout") // never reached !! 
    })
  })
})

if (!nomsgs) {
  describe("Messages", () => {
    testMessage("CgClient.preJoinFail", openP,
      () => cgclient.send_none(group_name, 0, "preJoinFail"), // send preJoin 'none' message: doomd to fail
      (ack) => {
        if (echoserver) {
          console.log(stime(), "echoserver returned", ack)
          expect(ack.success).toBe(true)
          expect(ack.cause).toBe(group_name)
        } else {
          console.log(stime(), "cgserver returned", cgclient.innerMessageString(ack))
          expect(ack.success).toBe(false)
          expect(ack.cause).toBe("not a member")
        }
      }, (rej) => {
        fail(rej)
      }, null, testTimeout - 2000);

    {
      let cause = "ref-approved", expect_id = 1
      testMessage("CgClient.sendJoin & Ack", null,
        () => cgclient.send_join(group_name, expect_id, "passcode1"),
        (ack) => {
          expect(ack.type).toEqual(CgType.ack)
          expect(ack.group).toEqual(group_name)
          expect(ack.cause).toEqual(cause)
          expect(ack.client_id).toEqual(expect_id)
          expect(cgclient.client_id).toEqual(expect_id)
        }, () => {
          echoserver && cgclient.sendAck(cause, { client_id: expect_id, group: group_name })
        })
    }

    {
      let client_id = cgclient.client_id, cause = "send_done"; // 1
      testMessage("CgClient.sendSend & Ack", null,
        () => {
          let ackp = cgclient.sendNak("spurious!") // no response from server: ignored
          expect(ackp.resolved).toBe(true)         // sendAck is immediately resolved(undefined)
          ackp.then((ack) => { expect(ack).toBeUndefined() })

          let message = new CgMessage({ type: CgType.none, cause: "test send", client_id: 0 })
          console.log(stime(), `CgClient.sendSend[${client_id}]:`, cgclient.innerMessageString(message))
          return cgclient.send_send(message, { nocc: true })
        }, (ack) => {
          console.log(stime(), `CgClient.sendSend returned ack:`, cgclient.innerMessageString(ack))
          expect(ack.type).toEqual(CgType.ack)
          expect(ack.cause).toEqual(cause)
          expect(ack.client_id).toBeUndefined()
          expect(ack.msg).toBeUndefined()
        }, null, () => {
          echoserver && cgclient.sendAck(cause, { client_id })
        }
      )
    }
    {
      let client_id = cgclient.client_id, cause = "MsgInAck", inner_sent: CgMessage
      testMessage("CgClient.sendSend MsgInAck", null,
        () => {
          let client_id = 0
          let message = new CgMessage({ type: CgType.none, cause, client_id })
          console.log(stime(), `CgClient.sendSendMsg[${client_id}]:`, cgclient.innerMessageString(message))
          return cgclient.send_send(message, { nocc: false, client_id: undefined })
        }, (ack) => {
          console.log(stime(), "CgClient.sendSendMsg returned ack:", cgclient.innerMessageString(ack))
          expect(ack.success).toBe(true)
          expect(ack.cause).toBe('send_done')  // all 'send' are Ack by server with 'send_done' QQQQ: should we fwd Ack from Referee?
          console.log(stime(this), "CgClient.sendSendMsg returned message", inner_sent.outObject())
          expect(inner_sent.type).toEqual(CgType.none)
          expect(inner_sent.cause).toEqual(cause)
          expect(inner_sent.info).toEqual(cause)
        }, (rej) => {
          fail()
        }, () => {
          echoserver && cgclient.sendAck('send_done', { client_id })
          wsbase.listenFor(CgType.send, (msg) => {
            inner_sent = CgMessage.deserialize(msg.msg)
            console.log(stime(), `RECEIVED SEND: ${inner_sent.outObject()}`)
          })
        }, testTimeout - 2000)
    }
    {
      let cause = "NakMe"
      testMessage("CgClient.sendNone for Nak", null,
        () => {
          let client_id = 0
          let message = new CgMessage({ type: CgType.none, cause, client_id })
          console.log(stime(), `CgClient.sendNoneNak[${client_id}]:`, cgclient.innerMessageString(message))
          return cgclient.send_send(message, { nocc: true })
        }, (ack) => {
          if (echoserver) {
            console.log(stime(), "echoserver returned", ack)
            expect(ack.success).toBe(true)
            expect(ack.cause).toBe(cause)
          } else {
            console.log(stime(), "cgserver returned", cgclient.innerMessageString(ack))
            expect(ack.success).toBe(false)
            expect(ack.cause).toBe(cause)
          }
        }, (rej) => {
          fail()
        }, null, testTimeout - 2000)
    }
    {
      let cause = "test_done", client_id = cgclient.client_id // 1
      testMessage("CgClient.sendLeave & Ack", null,
        () => cgclient.send_leave(group_name, client_id, cause),
        (msg) => {
          expect(msg.type).toEqual(CgType.ack)
          expect(msg.group).toEqual(group_name)
          expect(msg.cause).toEqual(cause)
          expect(msg.client_id).toEqual(cgclient.client_id)
          console.log(stime(), `CgClient.sendLeave Ack'd: okToClose.fulfill('${cause}')`)
          okToClose.fulfill(cause)               // signal end of test
        },
        () => !!echoserver && cgclient.sendAck(cause, { client_id, group: group_name })
      )
    }
  })
} else {
  setTimeout(() => {
    okToClose.fulfill("no_msgs")
  }, 300)
}


describe("Closing", () => {
  test("wsbase.close client", () => {
    return okToClose.finally(() => {
      console.log(stime(), `Because "${okToClose.value}" try wsbase.closeStream(normal, '${close_normal.reason}')`)
      if (!!wsbase) try {
        wsbase.closeStream(close_normal.code, close_normal.reason) // wsbase.ws.close(code, reason)
        console.log(stime(), `wsbase closeState=`, wsbase.closeState)
      } catch (err) {
        console.log(stime(), "wsbase closeStream error:", err)
        closeP.fulfill(close_fail)
      } else {
        closeP.fulfill({code: 0, reason:'no wsbase'})
      }
    })
  })

  test("wsbase.client closed", () => {
    return closeP.then((info: CloseInfo) => {
      let { code, reason } = info
      console.log(stime(), `wsbase closed: closeState=`, wsbase.closeState, info)
      if (code == close_fail.code) {
        expect(reason).toBe(close_fail.reason)
      } else {
        expect(code).toBe(close_normal.code)
        expect(reason || close_normal.reason).toBe(close_normal.reason)
      }
    },
      (rej: any) => {
        expect(rej).toBe(close_fail.reason)
      }).finally(()=>{
        //closeP0.fulfill({ code: 0, reason: 'no clients joined'})
        refwsbase.closeStream(close_normal.code, close_normal.reason); // ==> close() ==> cP0.fulfill()
        console.log(stime(), `client0 closeStream: closeState=`, refwsbase.closeState)
      })
  }, testTimeout)

  test("wsbase.verify closed", () => {
    return closeP.finally(() => {
      console.log(stime(), `verify closed: wsbase.closeState=`, wsbase.closeState)
      setTimeout(() => {
        expect(wsbase.ws && wsbase.ws.readyState).toEqual(wsbase.ws.CLOSED)
      }, 100)
    })
  })

  test("client0.verify Close", () => {
    return closeP0.then((cinfo) => {
      console.log(stime(), `client0 CLOSED: closeState=`, wsbase.closeState, cinfo)
      expect(wsbase.ws && wsbase.ws.readyState).toEqual(wsbase.ws.CLOSED)
    })
  }, testTimeout-100)

  test("All Closed", () => {
    return closeP0.finally(() => {
      let opened = wsWebSocket.socketsOpened, closed = wsWebSocket.socketsClosed
      expect(closed).toEqual(opened)
      console.log(stime(), `test done: socket count=`, { opened, closed, pid: process.pid })
    })
  })
})
test("timetolog", () => {
  return new Promise<void>((fulfill) => {
    setTimeout(() => { fulfill() }, 500)
  })
}) 
