import { CgBaseCnx } from "./CgBase";
import { CgMessage, CgType } from "./CgProto";
import { CnxHandler, pbMessage } from "./wspbserver";

class Group extends Array<CgServerCnx> {
  aname: string;
  /** the client who initiated the group send, and is waiting for ref/group to ack. */
  waiting_client_cnx: CgServerCnx;
}

export class CgServerCnx extends CgBaseCnx<pbMessage> {
  static groups: Record<string, Group> // Map(group-name:string => CgMessageHanlder[])

  group_name: string;  // group to which this connection is join'd
  nak_count: number;   // for dubious case of client nak'ing a request.

  get group() { return CgServerCnx.groups[this.group_name] }

  /** referee never[?] initiates a move; can Nak a move; replies to draw/shuffle/next-Turn-Player; 
   * [in 2-player P-v-P (no ref) each player acts as referee to the other?]
   * may need a way to tell client they are the referee/moderator
   */
  isFromReferee(message: CgMessage): boolean {
    return (message.client_id === 0 && message.cause === "referee")
  }
  /**
   * process an incoming message from client.
   * @param message
   * @returns 
   * @override
   */
  parseEval(message: CgMessage) {
    if (message.type != CgType.join && this.group[message.client_id] != this) {
      this.sendNak("not a member", this.group_name)
      console.log("ignore message from non-member")
      return
    }
    if (!!this.waiting_for_ack && message.type != CgType.ack) {
      console.log("sendNak: outstanding ack")
      this.sendNak("outstanding ack: "+this.waiting_for_ack.type)
      return
    }
    super.parseEval(message)
  }
  eval_ack(message: CgMessage, req: CgMessage): void {
    this.nak_count = 0;
    // handle ack of send by resolving promise (hmm, never promise_reject(cause) ?)
    return super.eval_ack(message, req)
  }
  /**
   * Forward referee Nak to requesting client.
   * @param message the Nak message
   * @param req the request that is Nak'd
   * @override
   */
  eval_nak(message: CgMessage, req: CgMessage) {
    if (this.isFromReferee(message)) {
      let client = this.group.waiting_client_cnx
      client.sendToSocket(message) // forward message to originator. (no client_waiting)
    } else {
      // Some non-ref client sent a NAK... we can't really help them.
      // maybe they were busy or confused? and resending might help?
      if (message.cause === "resend" && this.nak_count < 1){
        this.sendToSocket(req)
        this.nak_count != 1;
      } else {
        // if resend_count > N {this.promise.reject("many NAKs")}
        // if resend_count > N {this.close/leave/robot}

      }
    }
  }
  /** only on server */
  eval_join(message: CgMessage): void {
    if (this.group_name !== undefined) {
      this.sendNak("already in group", this.group_name)
      return
    }
    let join_name = message.group
    let group: Group = CgServerCnx.groups[join_name]
    if (!group) {
      group = new Group();
      group.aname = message.cause; // for ease of debug reference
      console.log("CgServer.eval_join: new Group", group)
      CgServerCnx.groups[join_name] = group
      group[0] = new CgServerCnx(undefined) // TODO: spawn a referee, let it connect
    }
    this.group_name = join_name
    let client_id = this.isFromReferee(message) ? 0 : group.length
    group[client_id] = this
    this.sendToSocket(new CgMessage({ type: CgType.ack, success: true, client_id: client_id, group: join_name }))
    return
  }
  remove_on_ack() {
    this.group.splice(this.group.indexOf(this))
    // close group if nobody left:
    if (this.group.length === 1 && this.group[0] instanceof CgServerCnx) {
      this.group[0].sendToSocket(new CgMessage({type: CgType.leave, client_id: 0, cause: "all gone"}))
      return
    }
    if (this.group.length === 0) {
      delete CgServerCnx.groups[this.group_name]
      this.ws.close(0, "all gone")
    }
  }
  /** client leaving; inform others? */
  eval_leave(message: CgMessage): void {
    let remove_on_ack = () => { this.group.splice(this.group.indexOf(this)) }
    this.sendToGroup(message, null, null, remove_on_ack)
    // when this.group.find(g => g.waiting_for_ack) == false --> sendAck()
    return
  }
  /** sentToReferee, sendToGroup, ack when done */
  eval_send(message: CgMessage): void {
    // send "done" to origin when everyone has replied. unless ref Nak's it...
    let send_ack_done = () => { this.sendAck("done") }
    this.sendToGroup(message, null, null, send_ack_done);
    return
  }
  sendToMembers(message: CgMessage): Array<Promise<CgMessage>> {
    // forward original message to rest of group
    let promises = Array<Promise<CgMessage>>();
    this.group.forEach((member, ndx) => {
      if (member != this && ndx > 0) {
        promises.push(member.sendToSocket(message))
      }
    })
    return promises
  }
  sendToReferee(msg: CgMessage): Promise<CgMessage> {
    if (this.group[0] instanceof CgServerCnx)
      return this.group[0].sendToSocket(msg)
    else 
      return new Promise<CgMessage>((res, rej) => { 
        let ack = new CgMessage({type: CgType.ack, success: true, cause: "auto-approve"})
        res(ack)
      })
  }

  sendToGroup(message: CgMessage, on_ack?: (pa: CgMessage[]) => void, on_rej?: (pa: CgMessage[]) => void, on_fin?: () => void) {
    // first send to referee,
    // if ack-success, then send to rest of group
    // if ack-fail, then sendNak(ack.cause)
    // if fail-to-send or fail-to-ack, then sendNak("app failure")
    this.group.waiting_client_cnx = this
    this.sendToReferee(message).then((ack) => {
      if (ack.success) {
        // forward original message to rest of group
        let promises = this.sendToMembers(message)
        Promise.all(promises).then(on_ack).catch(on_rej).finally(on_fin)
      } else {
        this.sendNak(ack.cause)  // "illegal move"
      }
    }).catch((reason: string) => {
      this.sendNak(reason) // "network or application failed"
    })
  }
}
