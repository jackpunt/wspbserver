import { AckPromise, CgBase, CgMessage, CgType, pbMessage, stime } from "wspbclient";

class ClientGroup extends Array<CgServerCnx> {
  aname: string;
  /** the client who initiated the group send, and is waiting for ref/group to ack. */
  waiting_client_cnx: CgServerCnx;
}

/** Server-side Client-Group connection handler. */
export class CgServerCnx extends CgBase<CgMessage> {
  static groups: Record<string, ClientGroup> // Map(group-name:string => CgMessageHanlder[])

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
   * @returns void
   * @override
   */
  parseEval(message: CgMessage): void {
    if (message.type != CgType.join && this.group[message.client_id] != this) {
      this.sendNak("not a member", { group: this.group_name })
      console.log("ignore message from non-member")
      return
    }
    if (this.has_message_to_ack && message.type != CgType.ack) {
      console.log("sendNak: outstanding ack, cannot do", message.type)
      this.sendNak("need to ack: " + this.message_to_ack_type)
      return
    }
    return super.parseEval(message)
  }
  /**
   * @override
   */
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
  eval_nak(message: CgMessage, req: CgMessage): void {
    if (this.isFromReferee(message)) {
      let client = this.group.waiting_client_cnx
      client.sendToSocket(message) // forward message to originator. (no client_waiting)
    } else {
      // Some non-ref client sent a NAK... we can't really help them.
      // maybe they were busy or confused? and resending might help?
      if (message.cause === "resend" && this.nak_count < 1) {
        this.sendToSocket(req)
        this.nak_count != 1;
      } else {
        // if resend_count > N {this.promise.reject(new Error("many NAKs"))}
        // if resend_count > N {this.close/leave/robot}
        console.log(stime(), "repeated client Nak:", message)
        // TODO: send 'leave'; wait for re-join... TODO: sync re-join client with game state!
      }
    }
    // hmm, does server care about promise_for_ack? [yes:client sync, heartbeat]
    super.eval_nak(message, req); // resolve and clear promise_for_ack
    return
  }
  /** on server: add to group */
  eval_join(message: CgMessage): void {
    if (this.group_name !== undefined) {
      this.sendNak("already in group", {group: this.group_name })
      return
    }
    let join_name = message.group
    let group: ClientGroup = CgServerCnx.groups[join_name]
    if (!group) {
      group = new ClientGroup();
      group.aname = message.cause; // for ease of debug reference
      console.log("CgServer.eval_join: new Group", group)
      CgServerCnx.groups[join_name] = group
      group[0] = new CgAutoAckCnx() // TODO: spawn a referee, let it connect
    }
    this.group_name = join_name
    let client_id = this.isFromReferee(message) ? 0 : group.length
    group[client_id] = this
    // let ack = new CgMessage({ type: CgType.ack, success: true, client_id: client_id, group: join_name })
    // this.sendToSocket(ack)
    this.sendAck("joined", {client_id, group: join_name})
    return
  }
  remove_on_ack() {
    this.group.splice(this.group.indexOf(this))
    // close group if nobody left:
    if (this.group.length === 1 && this.group[0] instanceof CgServerCnx) {
      let message = new CgMessage({ type: CgType.leave, client_id: 0, cause: "all gone" })
      this.group[0].sendToSocket(message) // CgType.leave
      return
    }
    if (this.group.length === 0) {
      delete CgServerCnx.groups[this.group_name]
      this.closeStream(0, "all gone")
    }
  }
  /** client leaving; inform others? */
  eval_leave(message: CgMessage): void {
    let remove_on_ack = () => { this.group.splice(this.group.indexOf(this)) }
    this.sendToGroup(message, null, null, remove_on_ack)
    // when this.group.find(g => g.waiting_for_ack) == false --> sendAck()
    return
  }
  /** 
   * sendToReferee(), sendToGroup(), sendAck() when done 
   * @param message forward this CgMessage<pbMessage> to Group.
   * @override
   */
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
    // use auto-ref until there is a better connection.
    if (!(this.group[0] instanceof CgServerCnx)) {
      this.group[0] = new CgAutoAckCnx()
    }
    return this.group[0].sendToSocket(msg)
  }

  sendToGroup(message: CgMessage, on_ack?: (pa: CgMessage[]) => void, on_rej?: (pa: CgMessage[]) => void, on_fin?: () => void) {
    // on_ack & on_rej 'default' to: idenity(val) => val
    // first send to referee,
    // if ack-success, then send to rest of group
    // if ack-fail, then sendNak(ack.cause)
    // if fail-to-send or fail-to-ack, then sendNak("app failure")
    this.group.waiting_client_cnx = this
    this.sendToReferee(message).then((ack) => {
      if (ack.success) {
        // forward original message to rest of group
        let promises = this.sendToMembers(message)
        let alldone = Promise.all(promises)
        alldone.then(on_ack, on_rej).finally(on_fin) // ignore any throw()
      } else {
        this.sendNak(ack.cause)  // "illegal move"
      }
    }).catch((reason: string) => {
      this.sendNak(reason) // "network or application failed"
    })
  }
}

/** in-process Referee "connection" that immediately Acks any message that needs it. */
class CgAutoAckCnx extends CgServerCnx {
  /** 
   * No actual Socket; don't 'send' anything.
   * @return a Promise<Ack> that is resolved.
   */
  sendToSocket(message: CgMessage): AckPromise {
    let rv = new AckPromise(message)
    let ack: CgMessage = null;
    if (CgServerCnx.msgsToAck.includes(message.type)) {
      ack = new CgMessage({ type: CgType.ack, success: true, cause: "auto-approve" })
    }
    rv.fulfill(ack)
    return rv
  }
}
