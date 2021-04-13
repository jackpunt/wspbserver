import { CgMessage, CgType } from "./CgProto";
import { CnxHandler, DataBuf, EitherWebSocket, pbMessage, PbParser } from "./wspbserver";




/**
 * Extends CnxHandler<pbMessage> to handle Client-Group proto messages.
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
export class CgBaseCnx<INNER extends pbMessage> extends CnxHandler<CgMessage> implements PbParser<CgMessage> {
  static msgsToAck = [CgType.send, CgType.join, CgType.leave]

  /**
   * This instance is its own "msg_handler", handling CgProto.
   * 
   * eval_send(inner_message: InnerProto) invokes inner_msg_handler.parseEval(inner_message)
   * 
   * Supply a PbParser<INNER> to deserialize and parseEval the INNER messages.
   * 
   * @param ws 
   * @param inner_msg_handler 
   */
  constructor(ws: EitherWebSocket, inner_msg_handler: PbParser<INNER>) {
    super(ws)
    this.inner_msg_handler = inner_msg_handler;
  }

  inner_msg_handler: PbParser<INNER>

  group_name: string;  // group to which this connection is join'd
  client_id: number;   // my client_id for this group.

  // this may be tricky... need to block non-ack from any client with outstanding ack
  // (send them an immediate nak)
  waiting_for_ack: CgMessage; // the message that was sent
  promise_of_ack: Promise<CgMessage>;
  promise_resolve: (msg: CgMessage) => void
  promise_reject: (reason: any) => void

  deserialize(bytes: DataBuf): CgMessage {
    return CgMessage.deserialize(bytes)
  }
  /**
   * @param ev
   * @override
   */
  onerror(ev: Event) {
    super.onerror(ev)    // maybe invoke sentError(ev)
    if (this.waiting_for_ack) {
      this.promise_reject(ev)
    }
  }
  /**
   * 
   * @param ev 
   * @override
   */
  onclose(ev: Event) {
    if (this.waiting_for_ack) {
      this.promise_reject(ev)
    }
  }
  sendAck(cause: string, group?: string) {
    this.sendToSocket(new CgMessage({ type: CgType.ack, success: true, cause: cause, group: group }))
  }
  sendNak(cause: string, group?: string) {
    this.sendToSocket(new CgMessage({ type: CgType.ack, success: false, cause: cause, group: group }))
  }

  /** 
   * send a [sub-protocol] message, wrapped in a CgMessage.
   * @return Promise that resolves to the Ack/Nak message
   */
  sendWrapped(message: INNER): Promise<CgMessage> {
    let bytes = message.serializeBinary();
    let cgmsg: CgMessage = new CgMessage({ type: CgType.send, msg: bytes });
    return this.sendToSocket(cgmsg)
  }
  /** 
   * Send message to websocket. 
   * save functions to resolve/reject this.promise_of_ack
   * @return a Promise of Ack for CgType: join, leave, send. (else undefined)
   */
  sendToSocket(message: CgMessage): Promise<CgMessage> {
    let bytes = message.serializeBinary()
    this.sendBuffer(bytes) // send message to socket (no cb... wait for Ack)
    this.waiting_for_ack = this.promise_of_ack = this.promise_resolve = this.promise_reject = undefined
    if (CgBaseCnx.msgsToAck.includes(message.type)) {
      this.waiting_for_ack = message
      this.promise_of_ack = new Promise<CgMessage>((res, rej) => {
        this.promise_resolve = res; // when ack recieved (success or failure)
        this.promise_reject = rej;  // onerror? onclose?
      })
    }
    return this.promise_of_ack
  }
  /** 
   * Nak from referee indicates that message was semantically illegal.
   * Referee never[?] initiates a request message; can Nak a request; 
   * (not clear if CgClient needs this...)
   */
  isFromReferee(message: CgMessage): boolean {
    return (message.client_id === 0 && message.cause === "referee")
  }
  /** parse CgType, eval each of join, leave, ack, send, none. */
  parseEval(message: CgMessage) {
    let req = this.waiting_for_ack // join, leave, send, none?
    switch (message.type) {
      case CgType.ack: {
        if (!(req instanceof CgMessage)) {
          console.log("CgBase: spurious Ack:", message)
        } else if (message.success)
          this.eval_ack(message, req)
        else
          this.eval_nak(message, req)
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
  on_leave(cause: string) {
    this.ws.close(0, cause) // presumably ref will have an onclose to kill itself
  }

  /**
   * process positive Ack for join, leave, send.
   * Resolve the outstanding send Promise<CgMessage> 
   */
  eval_ack(message: CgMessage, req: CgMessage): void {
    let type = req.type;
    if (type === CgType.join) {
      this.client_id = message.client_id
    } else if (type === CgType.leave) {
      this.on_leave(message.cause)
    } else if (type === CgType.send) {
      this.waiting_for_ack = undefined
      this.promise_resolve(message);  // waiting_for_ack validates promise_of_ack, promise_resolve, promise_reject
    }
    return
  }
  /**
   * process Nak for send.
   * if override to process join/leave: include super.eval_nak() 
   */
  eval_nak(message: CgMessage, req: CgMessage) {
    let type = req.type;
    if (type === CgType.send) {
      // assert: (promise_of_ack instanceof Promise)
      this.waiting_for_ack = undefined
      this.promise_resolve(message);
    }
    return
  }
  /** informed that another client has joined */
  eval_join(message: CgMessage): void {
    console.log("CgBase.join: ", message)
    return
  }

  /** informed that other client has departed */
  eval_leave(message: CgMessage): void {
    console.log("CgBase.leave:", message)
    if (message.client_id === this.client_id) {
      // booted from group! (or i'm the ref[0] and everyone else has gone)
      this.sendAck("leaving", this.group_name)
      this.on_leave("asked to leave")
    }
    return
  }

  /**
   * delegate to inner protocol handler.
   * 
   * Could be acting as a CgServer, with Inner Protocol Handler as our client.
   * But in general, just send the message, and let specializations understand the underlying protocol<IN>
   * 
   * @param message containing message<IN>
   * @returns 
   */
  eval_send(message: CgMessage): void {
    console.log("CgBase.send:", message)
    //this.msg_handler.wsmessage(message.msg)
    let msg = this.inner_msg_handler.deserialize(message.msg)
    this.inner_msg_handler.parseEval(msg)
    return
  }

  /** not used */
  eval_none(message: CgMessage) {
    console.log("CgBase.none:", message)
    return
  }

}
