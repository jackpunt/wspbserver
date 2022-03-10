import { AckPromise, BaseDriver, CgBase, CgMessage, CgMessageOpts, CgType, pbMessage, stime, UpstreamDrivable } from "@thegraid/wspbclient";
import { ServerSocketDriver } from "./ServerSocketDriver";
import type * as ws$WebSocket from "ws";
import type { Remote } from "./wspbserver";

//type ClientGroup2 = Record<string, ServerSocketDriver<pbMessage>> ;
class ClientGroup extends Array<CgServerDriver> {
  /** the join_name of this ClientGroup */
  aname: string;
  /** itemize the group membership. */
  get members() {
    return this.map((c, ndx) => [ndx, c.client_id, c.remote])
  }
}

/** CgServerDriver: Server-side Client-Group protocol handler 
 * for one client of this.group (as found in global/static Record of ClientGroup)
 * 
 * ASSERT: is running on Node, and this.dnstream ISA ServerSocketDriver with ws$WebSocket
 */
export class CgServerDriver extends CgBase<CgMessage> {
  static groups: Record<string, ClientGroup> = {} // Map(group-name:string => CgMessageHanlder[])

  group_name: string;  // group to which this connection is join'd

  /** identify port before joined. 
   * @override client-only version in CgBase
   */
  get client_port() { return this.client_id !== undefined ? this.client_id : `${this.remote.addr}:${this.remote.port}`}

  /** the extant ClientGroup matching this.group_name. */
  get group() { return CgServerDriver.groups[this.group_name] }
  /** find lowest client_id not currently in use. */
  get next_id() { 
    let group = this.group
    for (let id = 1; ; id++) {
      if (group.find(c => c.client_id === id) === undefined) return id
    }
    //return [1,2,3,4,5].find(id => group.find(c => c.client_id === id) === undefined)
  }
  /** pluck Remote info from ServerSocketBase of this stream. */
  get remote(): Remote { 
    let dnstream = this.dnstream
    while ((dnstream instanceof BaseDriver) && !(dnstream instanceof ServerSocketDriver)) { dnstream = dnstream.dnstream }
    return (dnstream as ServerSocketDriver<any>).remote
  }

  connectDnStream(dnstream: UpstreamDrivable<CgMessage>): this {
    super.connectDnStream(dnstream)
    if (dnstream instanceof ServerSocketDriver) {
      // get signaling from server-side/Node.js socket:
			// dnstream.wsopen = (ev: ws$WebSocket.OpenEvent) => {}    // super() -> log
			// dnstream.wserror = (ev: ws$WebSocket.ErrorEvent) => {}  // super() -> log
      // dnstream.wsmessage = (ev: ws$WebSocket.MessageEvent) => { this.wsmessage(ev.data as Buffer)}
      dnstream.wsclose = (ev: ws$WebSocket.CloseEvent) => {
        let { target, wasClean, reason, code } = ev
        let ndx = this.group && this.group.findIndex(client => client === this);
        console.log(stime(this.dnstream, `.wsclose`), `[${this.client_id}]`, { code, reason, wasClean, ndx})
        if (ndx >= 0) {
          let type = CgType.leave, client_id = this.client_id, cause = "closed", nocc = true, group = this.group.aname
          let message = new CgMessage({ type, client_id, cause, group, nocc })
          this.sendToMembers(message, true) // tell others this client has gone (ignore acks)
          this.removeFromGroup()  // remove this client-cnx from group
        }
      }
    }
    return this
  }

  get isReferee(): boolean { return this.client_id === 0 }
  /** referee never[?] initiates a move; can Nak a move; replies to draw/shuffle/next-Turn-Player; 
   * [in 2-player P-v-P (no ref) each player acts as referee to the other?]
   * may need a way to tell client they are the referee/moderator
   */
  isRefereeJoin(message: CgMessage): boolean {
    return (message.client_id === 0 && message.cause === "referee")
  }
  /** recruit CgAutoAck as referee */
  ref_join_message(group: string, client_id: number = 0, cause:string = "referee") {
    return new CgMessage({type: CgType.join, client_id, group, cause })
  }
  // override for debug/logging
  sendAck(cause: string, opts?: CgMessageOpts): AckPromise {
    let mopts = (opts instanceof CgMessage) ? opts.outObject() : opts
    console.log(stime(this, ".sendAck:"), `${this.client_id} ->`, { cause, ...mopts })
    return super.sendAck(cause, opts)
  }
  /**
   * process an incoming message from client.
   * @param message
   * @returns void
   * @override
   */
  parseEval(message: CgMessage): void {
    message.client_from = this.client_id      // ensure every message thru CgServer is augmented with client_from
    if (message.type != CgType.join && this.client_id === undefined) {
      console.log(stime(this, `.parseEval[${this.client_id}] <-`), this.innerMessageString(message), "nak & ignore message from non-member")
      this.sendNak("not a member", { group: this.group_name })
      return
    }
    if (!this.ack_resolved && message.type != CgType.ack) {
      console.log(stime(this, `.parseEval[${this.client_id}] <-`), this.innerMessageString(message), "nak: waiting for ack of", this.innerMessageString(this.ack_message))
      this.sendNak("need to ack: " + this.ack_message_type)
      return
    }
    return super.parseEval(message) // detect "ignore spurious Ack:"
  }
  /**
   * @override
   */
  eval_ack(message: CgMessage, req: CgMessage): void {
    return // super.parseEval will fulfill this.ack_promise
  }
  /**
   * @override
   */
  eval_nak(message: CgMessage, req: CgMessage): void {
    return // super.parseEval will fulfill this.ack_promise
    // TODO: sendToOthers to relay any 'Nak' (in the promise[]) back to caller.
    // The application can then decide to rescind or resend the action
  }
  /** on server: add to group: anybody can join, no filters at this point.  
   * 
   * If (client_id == 0 && cause == 'referee') then make special assignment to client_id 0.
   * (see this.isFromReferee()); otherwise client_id = next_client_id and push onto end of group.
   * 
   * QQQQ: should 'join' requests be moderated by client_0 ? (to verify passcode or whatever)
   */
  eval_join(message: CgMessage): void {
    if (this.group_name !== undefined) {
      // Maybe someday support an array of group names... ? to multiplex the client-server cnx
      // but then each message will need an associated group_name/group_id (default to last used?)
      this.sendNak("already in group", {group: this.group_name })
      return
    }
    let join_name = message.group
    this.group_name = join_name     // this.group = group
    let group = this.group
    if (!group) {
      // create/register the group, recruit a Referee:
      group = new ClientGroup();
      group.aname = join_name;      // for ease of debug reference
      console.log(stime(), "CgServerDriver.eval_join: new Group", group)
      CgServerDriver.groups[join_name] = group // add new group by name
      new CgAutoAckDriver(this.ref_join_message(join_name)) // TODO: spawn a referee, let it connect
    }
    let isAutoAck = (group[0] instanceof CgAutoAckDriver)
    if (this.isRefereeJoin(message)) { 
      if ((group[0] instanceof CgServerDriver) && !isAutoAck) {
       this.sendNak('referee exists', {group: join_name})
       return
      } 
      this.client_id = 0
      group[0] = this  // replace CgAutAckDriver with real referee
    } else { 
      this.client_id = this.next_id
      group.push(this) // push is ok: we splice out any defections (array is compact)
    }
    let cause = isAutoAck ? "auto-approve" : "ref-approved"
    console.log(stime(this, ".eval_join group="), this.group.members, this.remote)
    this.sendAck(cause, { client_id: this.client_id, group: join_name })
    return
  }

  /** when client leaves group: what happens at group[client_id] ??  mark it 'left'? */
  removeFromGroup(promises?: CgMessage[]) {
    console.log(stime(this, ".removeFromGroup: cid="), this.client_id, this.group.members)
    let this_group = this.group.filter(csd => csd.client_id !== this.client_id) as ClientGroup;
    CgServerDriver.groups[this.group_name] = this_group
    console.log(stime(this, ".removeFromGroup: cid="), this.client_id, this.group.members)

    if (this.group.length > 0 && this.client_id === 0) {
      // ref has disconnected! Replace with auto-ack:
      new CgAutoAckDriver(this.ref_join_message(this.group.aname))
    }

    if (this.group.length === 1 && this.group[0] instanceof CgServerDriver) {
      // tell the referee to leave:
      let ref = this.group[0]
      console.log(stime(this, ".removeFromGroup: group[0] ref ="), ref.remote)
      let message = new CgMessage({ type: CgType.leave, client_id: 0, cause: "all others gone" })
      let pack = ref.sendToSocket(message); // eval_leave & send Ack
      pack.finally(() => {
        console.log(stime(this, ".removeFromGroup: cid="), this.client_id, this.group.members)
      })
      return
    }
    if (this.group.length === 0) {
      // delete group if nobody left:
      delete CgServerDriver.groups[this.group_name]
      return
    }
  }
  /** this client leaving; inform others? see also: dnstream.wsclose(reason, code, wasClean) */
  eval_leave(message: CgMessage): void {
    console.log(stime(this, `.eval_leave[${this.client_id}] <-`), this.innerMessageString(message))
    // in CgBase/Client: cases for: isSelf[go away], other[inform, change avatar?]
    // in CgRefClient/CmReferee: edit roster
    // in CgServer[here]: from client seeking to leave, sendToGroup, removeFromGroup; ack
    // in CgServer: also detect dnstream.wsclose and likewise removeFromGroup()
    message.nocc = true
    let remove_from_group = (promises?: CgMessage[]) => { 
      this.sendAck(message.cause, {group: this.group_name, client_id: this.client_id})
      this.removeFromGroup(promises) 
    }
    this.sendToGroup(message, null, null, remove_from_group)
    // when this.group.find(g => g.waiting_for_ack) == false --> sendAck()
    return
  }
  /** 
   * sendToReferee(), sendToGroup(), sendAck() when done 
   * @param message forward this CgMessage\<pbMessage> to Group.
   * @override
   */
  eval_send(message: CgMessage): void {
    // send "done" to origin when everyone has replied. unless ref Nak's it...
    let send_ack_done = (ack: CgMessage) => {
      //console.log(stime(this, ".eval_send: one/specific ack"), this.client_id, ack.success)
      this.sendAck(ack.cause, ack) // Ack OR Nak
    } // the Ack from addressed client_id (referee)
    let send_all_done = (all_done: CgMessage[]) => {
      //console.log(stime(this, ".eval_send: sendAck for all_done"), this.client_id)
      this.sendAck("send_done")
    }
    let send_failed = (reason: any) => {
      //console.log(stime(this), "send failed: ", reason); 
      this.sendNak(`send failed: ${reason}`)
    }

    let client_to = message.client_id    // could be null send to 'all'
    console.log(stime(this, ".eval_send:"), `${message.client_from} -> ${client_to === undefined? 'group': client_to}`, this.innerMessageString(message), 'nocc:', message.nocc)
    if (client_to !== undefined) {
      // DM to specific client:
      let promise = this.group[client_to].sendToSocket(message)
      promise.then(send_ack_done, send_failed)
    } else {
      this.sendToGroup(message, send_all_done, send_failed, () => { console.log("... sendToGroup finally") });
    }
    return
  }

  sendToGroup(message: CgMessage, on_ack?: (pa: CgMessage[]) => void, on_rej?: (pa: CgMessage[]) => void, on_fin?: () => void) {
    // on_ack & on_rej 'default' to: idenity(val) => val
    // first send to referee,
    // if ack-success, then send to rest of group
    // if ack-fail, then sendNak(ack.cause)
    // if fail-to-send or fail-to-ack, then sendNak("app failure")
    let sendToOthers = (message: CgMessage) => {
        // forward original message to all/rest of group
        let promises = this.sendToMembers(message)
        let alldone = Promise.all(promises)
        alldone.then(on_ack, on_rej)
        alldone.finally(on_fin) // ignore any throw()
        // this.handlePromiseAll(alldone, on_ack, on_rej, null, on_fin)
    }
    if (this.isReferee) {
      sendToOthers(message) // referee sending a broadcast
    } else {
      this.sendToReferee(message).then((ack) => {
        if (ack.success) {
          sendToOthers(this.refMessage(message, ack))
        } else {
          this.sendNak(ack.cause, ack)  // "illegal move"
        }
      }, (reason) => {
        this.sendNak(reason) // "network or application failed"
      })
    }
  }
  /** For CgType.send, Referee can supply a [CgType.send] message to be sent by including in Ack. */
  refMessage(orig: CgMessage, ack: CgMessage): CgMessage {
    let msg = (ack.msg !== undefined) ? CgMessage.deserialize(ack.msg) : orig
    console.log(stime(this, `.refMessage`), msg.outObject())
    return msg
  }

  sendToReferee(msg: CgMessage) {
    // use auto-ref until there is a better connection.
    let ref = this.group[0]
    if (!(ref instanceof CgServerDriver)) {
      console.log(stime(this, ".sendToReferee: recruit new ref for group"), this.group_name)
      new CgAutoAckDriver(this.ref_join_message(this.group_name)) // failsafe. should not happen
    }
    console.log(stime(this, ".sendToReferee ->"), 0, this.innerMessageString(msg))
    return ref.sendToSocket(msg)
  }

  /** forward ack'd message to all of group. including the sender (unless nocc: true). */
  sendToMembers(message: CgMessage, andRef: boolean = false): Array<AckPromise> {
    // forward original message to all/other members of group
    let cc_sender = !message.nocc, n0 = (andRef || (this.isReferee && message.nocc === false)) ? -1 : 0
    let promises = Array<AckPromise>();
    this.group.forEach((member, ndx) => {
      if (ndx > n0 && (cc_sender || (member != this))) { // ndx==0 is the referee; TODO: other spectators (ndx<0)
        console.log(stime(this, `.sendToMembers[${this.client_id}] ->`), member.client_id, message.msgStr)
        promises.push(member.sendToSocket(message))
      }
    })
    //promises[0].fulfill(undefined) // ensure there is  1 Promise filled, is if !message.ackExpected
    return promises
  }

  /** @override for logging */
  sendToSocket(message: CgMessage): AckPromise {
    let client_id = message.client_id, msgStr = this.innerMessageString(message), port = this.remote.port
    console.log(stime(this, `.sendToSocket[${this.client_id}] ->`), message.cgType, {client_id, msgStr, port})
    return super.sendToSocket(message) // sets this.promise_to_ack 
  }

  handlePromiseAll(promise: Promise<CgMessage[]>,
    on_ack?: (pa: CgMessage[]) => void, 
    on_rej?: (pa: any[]) => void, 
    on_catch?: (pa: any[]) => void, 
    on_fin?: () => void ) {
      promise.then(on_ack, on_rej)
      if (!!on_catch) promise.catch(on_catch)
      if (!!on_fin) promise.finally(on_fin)
  }
}

/** in-process Referee "connection" that immediately Acks any message that needs it. */
class CgAutoAckDriver extends CgServerDriver {
  constructor(ref_join_message: CgMessage) {
    super()
    // ASSERT: this.isFromReferee(join_message)
    this.eval_join(ref_join_message)
  }
  /** 
   * @override there is no downstream websocket, no remote connnection
   */
  get remote(): Remote { return { addr: "CgAutoAckDriver", port: 0, family: "" } }
  /**
   * @override There is no dnstream Socket; don't 'send' anything.
   * @return a Promise\<Ack> that is resolved (without send/recv/eval)
   */
  sendToSocket(message: CgMessage): AckPromise {
    let rv = new AckPromise(message)
    let ack: CgMessage = null;
    let client_id = message.client_from   // CgAutoAckDriver doing what Referee would do?
    // msgsToAck: [none, join, leave, send]
    if (message.expectsAck()) {
      ack = new CgMessage({ type: CgType.ack, success: true, cause: "auto-approve", client_id })
      console.log(stime(this, ".sendToSocket ack:"), {cause: ack.cause, remote: this.remote.port})
    }
    rv.fulfill(ack)
    return rv
  }
}
