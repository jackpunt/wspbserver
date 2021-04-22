import type { DataBuf, EitherWebSocket, pbMessage, PbParser } from "./wspbserver";
import { stime } from "./wspbserver";
import { CgMessage, CgType } from "./CgProto";
import { CnxHandler } from "./CnxHandler";
import { EzPromise } from "@thegraid/EzPromise";


export type ParserFactory<INNER extends pbMessage, OUTER extends CgMessage> 
   = (cnx: CgBaseCnx<INNER, OUTER>) => PbParser<INNER>;

export type CgMessageFields = {type?: CgType, success?: boolean, group?: string, client_id?: number, cause?: string}

class AckPromise extends EzPromise<CgMessage> {
  constructor(public message: CgMessage, def = (res, rej) => { }) {
    super(def)
  }
}

/**
 * Extends CnxHandler<pbMessage> to handle Client-Group Messages.
 * Implements basic/common Client-Group messaging.
 * 
 * Specialize for CgClient and CgServer; 
 * by overriding Cg methods: eval_join, eval_leave, eval_send, eval_ack
 * which are invoked when RECIEVING the named CgMessage.
 * 
 * Default msg_handler:PbParser invokes: eval_join, eval_leave, eval_send, eval_ack on *this*
 * 
 * Implement/override: join, leave, send, ack
 * Send a CgMessage with: sendToSocket(msg: CgMessage) or sendWrapped(msg: IN)
 */
export class CgBaseCnx<INNER extends pbMessage, OUTER extends CgMessage> extends CnxHandler<OUTER> implements PbParser<OUTER> {
  static msgsToAck = [CgType.send, CgType.join, CgType.leave]

  /**
   * if i_m_f supplied: create inner_msg_handler: PbParser<INNER>
   * -- which may be a CnxHandler<INNER> but will have ws = null
   * 
   * if ws = URL:string, Make outbound client this<OUTER>
   * if ws = ws.WebSocket, Handle inbound client this<OUTER> from CnxListener server
   * 
   * This instance is its own "msg_handler", handling CgMessage [CgProto.proto]
   * 
   * Create inner_msg_handler: PbParser<INNER> to deserialize and parseEval the INNER messages.
   * 
   * eval_send(inner_message: InnerProto) invokes inner_msg_handler.parseEval(inner_message)
   * 
   * Can chain when: (inner_msg_handler: PbParser<INNER> instanceof CgBaseCnx<INNER>)
   * 
   * @param ws 
   * @param inner_msg_factory produces a PbParser based on this CnxHandler
   */
  constructor(ws: EitherWebSocket | string, inner_msg_factory: ParserFactory<INNER, CgMessage>) {
    super(ws) // this.ws = ws; this.msg_handler<CgMessag> = this;
    this.inner_msg_handler = inner_msg_factory && inner_msg_factory(this)
  }

  // Chain: CnxHandler<CgMessage>(ws) -> msg_handler: CgClientCnx=CgBaseCnx<CmMessage>(ws, CmClient(this, CmProtoCnx)) ->
  inner_msg_handler: PbParser<INNER> // which typically ISA CnxHandler<INNER>

  /** group from Ack of join() */
  group_name: string;  // group to which this connection is join'd
  /** client_id from Ack of join() */
  client_id: number;   // my client_id for this group.

  // this may be tricky... need to block non-ack from any client with outstanding ack
  // (send them an immediate nak)
  /** private, but message.type is accessible */
  private promise_of_ack: AckPromise; // also holds the message that was sent
  get has_message_to_ack(): boolean { return !!this.promise_of_ack && !!this.promise_of_ack.message }
  get message_to_ack_type(): CgType { return this.has_message_to_ack && this.promise_of_ack.message.type }

  deserialize(bytes: DataBuf): OUTER {
    return CgMessage.deserialize(bytes) as OUTER
  }
  /**
   * @param ev
   * @override
   */
  onerror(ev: Event) {
    super.onerror(ev)    // maybe invoke sentError(ev)
    if (this.promise_of_ack) {
      this.promise_of_ack.reject(ev)
    }
  }
  /**
   * 
   * @param ev 
   * @override
   */
  onclose(ev: Event) {
    if (this.promise_of_ack) {
      this.promise_of_ack.reject(ev)
    }
  }
  sendAck(cause: string, opts?: CgMessageFields) {
    this.sendToSocket(new CgMessage({ success: true, ...opts, cause, type: CgType.ack }))
  }
  sendNak(cause: string, opts?: CgMessageFields) {
    this.sendToSocket(new CgMessage({ success: false, ...opts, cause, type: CgType.ack }))
  }


  /** 
   * Send message to websocket. 
   * save functions to resolve/reject this.promise_of_ack
   * @return a Promise of Ack for CgType: join, leave, send. (else undefined)
   */
  sendToSocket(message: CgMessage): Promise<CgMessage> {
    let bytes = message.serializeBinary()
    this.sendBuffer(bytes) // send message to socket (no cb... wait for Ack)
    this.promise_of_ack = undefined
    if (CgBaseCnx.msgsToAck.includes(message.type)) {
      this.promise_of_ack = new AckPromise(message)
    }
    return this.promise_of_ack
  }
  /** 
   * send a [sub-protocol] message, wrapped in a CgMessage(CgType.send)
   * @return Promise that resolves to the Ack/Nak message
   */
  sendWrapped(message: INNER, client_id?: number): Promise<CgMessage> {
    let msg = message.serializeBinary()
    let cgmsg: CgMessage = new CgMessage({ type: CgType.send, msg, client_id });
    return this.sendToSocket(cgmsg)
  }
  /**
   * send wrapped message to socket
   * @param message Object containing pbMessage<INNER>
   * @param client_id send to: 0 is ref; null is Group
   */
  send_send(message: INNER, client_id?: number): Promise<CgMessage> {
    let promise = this.sendWrapped(message, client_id)
    promise.then((ack) => {}, (nak) => {})
    return promise
  }
  /**
   * send_join client makes a connection to server group
   * @param group group name
   * @param id client_id
   * @param cause identifying string
   * @returns a Promise that completes when an Ack/Nak is recieved
   */
  send_join(group: string, id?: number, cause?: string): Promise<CgMessage> {
    let message = new CgMessage({ type: CgType.join, group: group, client_id: id, cause: cause })
    let promise = this.sendToSocket(message)
    promise.then((ack) => {
      this.group_name = ack.group
      this.client_id = ack.client_id
    }, (nak: any) => {

    })
    return 
  }
  /**
   * client makes a connection to server group.
   * 
   * @param group group_name
   * @param id the client_id
   * @param cause identifying string
   * @returns a Promise that completes when an Ack/Nak is recieved
   */
  send_leave(group: string, id?: number, cause?: string): Promise<CgMessage> {
    let message = new CgMessage({ type: CgType.leave, group: group, client_id: id })
    let promise = this.sendToSocket(message)
    promise.then((ack) => {this.on_leave(ack.cause)}, (nak) => {})
    return promise
  }

  /** 
   * Nak from referee indicates that message was semantically illegal.
   * Referee never[?] initiates a request message; can Nak a request; 
   * (not clear if CgClient needs this...)
   */
  isFromReferee(message: CgMessage): boolean {
    return (message.client_id === 0 && message.cause === "referee")
  }

  /**
   * parse CgType: eval_ each of ack, nak, join, leave, send, none.
   * @param message 
   */
  parseEval(message: CgMessage): void {
    // msgs_to_ack: join, leave, send, none?
    switch (message.type) {
      case CgType.ack: {
        let req = !!this.promise_of_ack && this.promise_of_ack.message;
        if (!(req instanceof CgMessage)) {
          console.log(stime(), "CgBase: ignore spurious Ack:", message)
        } else if (message.success) {
          this.eval_ack(message, req)
        } else {
          this.eval_nak(message, req)
        }
        break
      }
      case CgType.join: {
        this.eval_join(message)
        break
      }
      case CgType.leave: {
        this.eval_leave(message)
        break
      }
      case CgType.send: {
        this.eval_send(message)
        break
      }
      case CgType.none: {
        this.eval_none(message)
      }
    }
  }
  /**
   * Action to take after leaving group.
   * Base: close socket
   * @param cause 
   */
  on_leave(cause: string) {
    this.ws.close(0, cause) // presumably ref will have an onclose to kill itself
  }
  /**
   * process positive Ack from join, leave, send.
   * Resolve the outstanding send Promise<CgMessage> 
   */
  eval_ack(message: CgMessage, req: CgMessage): void {
    if (!!this.promise_of_ack) {
      this.promise_of_ack.fulfill(message);
      this.promise_of_ack = undefined  // invalidate this.promise_of_ack
    }
    return
  }
  /**
   * process Nak from send. (join & leave do not fail?)
   * if override to process join/leave: include super.eval_nak() 
   */
  eval_nak(message: CgMessage, req: CgMessage) {
    if (!!this.promise_of_ack) {
      this.promise_of_ack.fulfill(message);
      this.promise_of_ack = undefined  // invalidate this.promise_of_ack
    }
    return
  }
  /** informed that another client has joined */
  eval_join(message: CgMessage): void {
    console.log(stime(), "CgBase.join: ", message)
    return
  }

  /** informed that [other] client has departed */
  eval_leave(message: CgMessage): void {
    console.log(stime(), "CgBase.leave:", message)
    if (message.client_id === this.client_id) {
      // booted from group! (or i'm the ref[0] and everyone else has gone)
      this.sendAck("leaving", { group: this.group_name })
      this.on_leave("asked to leave")
    }
    return
  }

  /**
   * Process message delivered to Client-Group.
   * 
   * For CgServerCnx: override to sendToGroup()
   * else server would parseEval on behalf of the client...? [if it has inner_msg_handler]
   * 
   * For CgClientCnx: delegate to inner protocol handler
   * inner.parseEval(inner.deserialize(message.msg))
   * 
   * @param message containing message<IN>
   * @returns 
   */
  eval_send(message: CgMessage): void {
    console.log(stime(), "CgBase.send:", message)
    let msg = this.inner_msg_handler.deserialize(message.msg)
    this.inner_msg_handler.parseEval(msg)
    return
  }

  /** not used */
  eval_none(message: CgMessage) {
    console.log(stime(), "CgBase.none:", message)
    return
  }

}
