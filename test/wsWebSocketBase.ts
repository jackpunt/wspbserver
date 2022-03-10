import { wsWebSocket, ws } from './wsWebSocket'
import type { EzPromise } from '@thegraid/ezpromise'
import { stime } from '@thegraid/common-lib'
import { pbMessage, CloseInfo, close_fail, normalClose, readyState } from '@thegraid/wspbclient'
import { CgClient, CgType, CgMessage, DataBuf, AWebSocket, WebSocketBase } from '@thegraid/wspbclient'

/**
 * A WebSocketBase Driver that uses a [nodejs] wsWebSocket.
 * 
 * Suitable for node.js/jest when testing without a browser WebSocket.
 */
export class wsWebSocketBase<I extends pbMessage, O extends pbMessage> extends WebSocketBase<I, O> {
  // for jest/node: make a wsWebSocket(url), send messages upstream
  url: string
  /** this.ws socket state: { readyState: string, closed: number, closeEmitted: number } */
  get closeState() {
    if (!this.ws) return {}
    let state = readyState(this.ws), socket = this.ws['wss']['_socket']
    if (!socket) return { readyState: state }
    let rs = socket['_readableState']
    return { readyState: state, closed: rs['closed'], closeEmitted: rs['closeEmitted']}
  }
  /** 
   * extend connectWebSocket to fulfill the given EzPromises when webSocket is OPEN or CLOSE. 
   */
  override connectWebSocket(ws: AWebSocket | string, openP?: EzPromise<AWebSocket>, closeP?: EzPromise<CloseInfo>) {
    if (typeof (ws) === 'string') {
      let url: string = this.url = ws;
      console.log(stime(this, `.connectWebSocket: url=`), url)
      ws = new wsWebSocket(url); // TODO: handle failure of URL or connection
    }
    super.connectWebSocket(ws)

    this.ws.addEventListener('error', (ev: Event) => {
      console.log(stime(this, " ws error:"), ev)
      !!closeP && closeP.fulfill(close_fail)
    })

    this.ws.addEventListener('open', (ev) => {
      console.log(stime(this, " ws open:"), !!openP ? "   openP.fulfill(ws)" : "    no Promise")
      !!openP && openP.fulfill(this.ws)
    })

    this.ws.addEventListener('close', (ev: CloseEvent) => {
      console.log(stime(this, " ws close:"), { readyState: readyState(this.ws), reason: ev.reason, closeP : !!closeP })
      !!closeP && closeP.fulfill(normalClose(ev.reason))
    })
    return this
  }
  /** return this.on('message', handle, {once: true}) */
  listenFor(type: CgType, handle: (msg: CgMessage)=>void = (msg)=>{}): EventListener {
    let listener = (ev: Event) => {
      let data = (ev as MessageEvent).data as DataBuf<CgMessage>
      let cgm = CgMessage.deserialize(data)
      let outObj = cgm.outObject()
      console.log(stime(this, `.listenFor(${CgType[type]})`), outObj)
      if (cgm.type === type) {
        this.removeEventListener('message', listener)
        handle(cgm)
      }
    }
    this.addEventListener('message', listener)
    return listener
  }
}

/** A [mock-] wsWebSocketBase<CgMessage, CgMessage> Driver */
export class wsCgWebSocketBase extends wsWebSocketBase<CgMessage,CgMessage> {}

/** CgClient to Log and Ack msgs recv'd; log .onLeave() */
export class TestCgClient<O extends CgMessage> extends CgClient<O> {
  eval_send(message: CgMessage) {
    let inner_msg = CgMessage.deserialize(message.msg)
    console.log(stime(this, `.eval_send[${this.client_id}]`), inner_msg.outObject())
    this.sendAck(`send-rcvd-${this.client_id}`, {client_id: message.client_from})
  }

  /** when send_leave has been Ack'd, typically: closeStream */
  on_leave(cause: string) {
    //override CgBase so it does not auto-close the stream
    console.log(stime(this, `.onLeave [${this.client_id}]`), cause )
    if (this.client_id !== 0) return
    super.on_leave(cause) // if last client leaving: close refere
  }
}
/** TestCgClient extended for role of Referee: sends Ack/Nak */
export class TestCgClientR<O extends CgMessage> extends TestCgClient<O> {
  eval_send(message: CgMessage) {
    console.log(stime(this, `.eval_send[${message.client_from} -> ${this.client_id}]`), this.innerMessageString(message))
    let inner_msg = CgMessage.deserialize(message.msg) // inner CgMessage, type==CgType.none
    if (inner_msg.type === CgType.none && inner_msg.cause == "NakMe") {
      this.sendNak(inner_msg.cause, { client_id: message.client_from })
      return
    }
    if (inner_msg.type === CgType.none && inner_msg.cause == "MsgInAck") {
      console.log(stime(this, `.eval_send[${this.client_id}]`), "Augment MsgInAck")
      inner_msg.info = inner_msg.cause   // augment inner 'none' message: info: "MsgInAck"
      let aug_msg = inner_msg.serializeBinary()  // prep 'none' message to insert into original 'send'
      message.msg = aug_msg
      message.info = "send(aug_none)"
      let aug_send = message.serializeBinary() // augment & re-serialize original CgMessage({type: CgType.send}, ...)
      let pAck = this.sendAck(inner_msg.cause, { client_id: message.client_from, msg: aug_send })
      console.log(stime(this, `.eval_send returning Ack`), pAck.message.outObject())
      return
    }
    this.sendAck("send-approved", {client_id: message.client_from})
  }
}
