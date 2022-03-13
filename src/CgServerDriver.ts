import { AckPromise, BaseDriver, CgBase, CgMessage, CgMessageOpts, CgType, pbMessage, stime, UpstreamDrivable } from "@thegraid/wspbclient";
import { ServerSocketDriver } from "./ServerSocketDriver";
import type * as ws$WebSocket from "ws";
import type { Remote } from "./wspbserver";
import { execSync } from "child_process";

function listTCPsockets(pid = `${process.pid}`) {
  let lsofTCP = execSync(`(lsof -P -i TCP -a -p ${pid}; cat)`, {stdio: ['ignore', 'pipe', 'ignore']} ).toString()
  let lines = lsofTCP.split('\n')
  let openSockets = lines.slice(1, -1)
  console.log(stime('CgServerDriver', `.listTCPsockets(${pid}): ${openSockets.length} sockets`), openSockets)
  return openSockets
}
//type ClientGroup2 = Record<string, ServerSocketDriver<pbMessage>> ;
type Member = [ client_id: number, remote: Remote ]
class ClientGroup extends Map<number, CgServerDriver> { // TODO: use Map<number,CgServerDriver>
  /** the join_name of this ClientGroup */
  name: string;
  constructor(name: string) {
    super()
    this.name = name
  }
  get length() { return this.size; }
  // ASSERT referee is *always* in slot 0
  get referee() { return this.get(0)}
  set referee(member) { this.set(0, member) }
  override set (id: number, member: CgServerDriver): this {
    super.set(id, member)
    member.client_id = id
    member.group = this
    member.group_name = this.name // in case of debug mostly.
    return this
  }
  /** itemize the group membership. originally just for logging join/leave */
  get members() {
    let rv: Member[] = []
    this.forEach((driver: CgServerDriver, id: number) => { rv.push([id, driver.remote] as Member) })
    return rv;
  }
  forEachMember(fn: (driver: CgServerDriver, id:number) => void) {
    this.forEach(fn);
  }
  getMember(client_id: number) {
    return this.get(client_id)
  }
  memberId(driver: CgServerDriver) {
    for (let value of this.entries()) { if (value[1] === driver) return value[0] }
    return undefined
  }
  /** find lowest client_id not currently in use. */
  addMember(member: CgServerDriver) { 
    for (let id = 1; ; id++) {
      if (!this.getMember(id)) {
        this.set(id, member)
        return id; // lowest unused client_id
      } 
    }
  }
  removeMember(id: number) {
    let member = this.getMember(id)
    this.delete(id)
    member.client_id = undefined  // this client no longer a member of any group
    member.group = undefined
    member.group_name = undefined
  }
}

/** CgServerDriver: Server-side Client-Group protocol handler 
 * for one client of this.group (as found in global/static Record of ClientGroup)
 * 
 * ASSERT: is running on Node, and this.dnstream ISA ServerSocketDriver with ws$WebSocket
 */
export class CgServerDriver extends CgBase<CgMessage> {
  static cGroups: Map<string, ClientGroup> = new Map()
  constructor() { 
    super(); 
    this.log = true 
    this.log && listTCPsockets()
  }

  /** identify port before joined. 
   * @override client-only version in CgBase
   */
  get client_port() { return this.client_id !== undefined ? this.client_id : `${this.remote.addr}:${this.remote.port}`}

  /** the extant ClientGroup matching CgBase.group_name. */
  group: ClientGroup;

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
        let client_id = this.group && this.group.memberId(this) // verify [this, client_id] is [still] in group
        this.log && console.log(stime(this.dnstream, `.wsclose`), `[${this.client_id}]`, { code, reason, wasClean, ndx: client_id})
        if (client_id >= 0) {
          let type = CgType.leave, cause = "closed", nocc = true, group = this.group.name
          let message = this.makeCgMessage({ type, client_id, cause, group, nocc })
          this.removeFromGroup()            // remove this client-cnx from group
          this.sendToMembers(message, true) // tell others this client has gone (ignore acks)
        }
        this.log && listTCPsockets()
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
    return this.makeCgMessage({type: CgType.join, client_id, group, cause })
  }
  // override for debug/logging
  sendAck(cause: string, opts?: CgMessageOpts): AckPromise {
    let mopts = (opts instanceof CgMessage) ? opts.outObject() : opts
    this.log && console.log(stime(this, ".sendAck:"), `${this.client_id} ->`, { cause, ...mopts })
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
    if (message.type !== CgType.join && this.client_id === undefined) {
      this.log && console.log(stime(this, `.parseEval[-] <-`), this.innerMessageString(message), "nak & ignore message from non-member")
      this.sendNak("not a member")
      return
    }
    if (!this.ack_resolved && message.type != CgType.ack) {
      this.log && console.log(stime(this, `.parseEval[${this.client_id}] <-`), this.innerMessageString(message), "nak: waiting for ack of", this.innerMessageString(this.ack_message))
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
    if (this.group !== undefined) {
      // Maybe someday support an array of group names... ? to multiplex the client-server cnx
      // No: demux at a higher level
      this.sendNak("already in group", { group: this.group.name })
      return
    }
    const join_name = message.group
    let group = CgServerDriver.cGroups.get(join_name)
    if (!group) {
      // create/register the group, recruit a Referee:
      group = new ClientGroup(join_name)
      CgServerDriver.cGroups.set(join_name, group)
      new CgAutoAckDriver(this.ref_join_message(join_name)) // TODO: spawn a referee, let it connect
      this.log && console.log(stime(this, '.eval_join:'), `new Group(${group.name})`, group.members)
    }
    let isAutoAck = (group.referee instanceof CgAutoAckDriver)
    if (this.isRefereeJoin(message)) { 
      if ((group.referee instanceof CgServerDriver) && !isAutoAck) {
       this.sendNak('referee exists', {group: join_name})
       return
      } 
      group.referee = this  // replace CgAutAckDriver with real referee
    } else { 
      group.addMember(this)
    }
    let cause = isAutoAck ? "auto-approve" : "ref-approved"
    this.log && console.log(stime(this, ".eval_join group="), group.members, this.remote)
    this.sendAck(cause, { client_id: this.client_id, group: join_name })
    return
  }

  /** when client leaves group: remove CgSrvDrv from the group array. */
  removeFromGroup() {
    let client_id = this.client_id, group = this.group, group_name = group.name
    this.log && console.log(stime(this, `.removeFromGroup:A c_id = ${client_id}`), group.members)
    group.removeMember(client_id)
    this.log && console.log(stime(this, `.removeFromGroup:B c_id = ${client_id}`), group.members)

    if (group.length > 0 && client_id === 0) {
      // ref has disconnected! Replace with auto-ack:
      new CgAutoAckDriver(this.ref_join_message(group.name))
    }

    if (group.length === 1 && !!group.referee) {
      // tell the referee to leave: (unless referee indicates this is a perma-group)
      let ref = group.referee
      this.log && console.log(stime(this, ".removeFromGroup: group.referee ="), ref.remote)
      let message = this.makeCgMessage({ type: CgType.leave, client_id: 0, cause: "all others gone" })
      let pAck = ref.sendToSocket(message); // eval_leave & send Ack
      pAck.then((ackMsg) => {
        if (ackMsg.success) ref.removeFromGroup()
      }).finally(() => {
        this.log && console.log(stime(this, `.removeFromGroup:C c_id = ${client_id}`), group.members)
      })
      return
    }
    if (group.length === 0) {
      // delete group if nobody is left:
      CgServerDriver.cGroups.delete(group_name)
      return
    }
  }
  /** this client leaving; inform others? see also: dnstream.wsclose(reason, code, wasClean) */
  eval_leave(message: CgMessage): void {
    this.log && console.log(stime(this, `.eval_leave[${this.client_id}] <-`), this.innerMessageString(message))
    // in CgBase/Client: cases for: isSelf[go away], other[inform, change avatar?]
    // in CgRefClient/CmReferee: edit roster
    // in CgServer[here]: from client seeking to leave, sendToGroup, removeFromGroup; ack
    // in CgServer: also detect dnstream.wsclose and likewise removeFromGroup()
    let target_id = this.client_id, closeTarget = false, group_name = this.group.name
    message.nocc = true
    let remove_from_group = () => { 
      this.sendAck(message.cause, { group: group_name, client_id: target_id })
      this.removeFromGroup() 
      if (closeTarget) {
        let target = this.group.getMember(target_id);
        console.log(stime(this, `.eval_leave: target.closeStream`), { port: target.client_port })
        target.closeStream(1008, 'closed by referee')
      }
    }
    if (message.client_from == 0 && message.client_id != 0) {
      target_id = message.client_id // referee can 'kick' any other client.
      console.log(stime(this, `.eval_leave: target_id = ${target_id}`), message.outObject() )
      // generally: kick from Group, but not from Server; kick&close to test unexpected/forced close
      closeTarget = (message.cause.endsWith('&close'))
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

    let client_to = message.client_id    // if undefined send to 'all' of Group
    this.log && console.log(stime(this, ".eval_send:"), `${message.client_from} -> ${client_to === undefined? 'group': client_to}`, this.innerMessageString(message), 'nocc:', message.nocc)
    if (client_to !== undefined) {
      // DM to specific client:
      let promise = this.group.getMember(client_to).sendToSocket(message)
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
    this.log && console.log(stime(this, `.refMessage`), msg.outObject())
    return msg
  }

  sendToReferee(msg: CgMessage) {
    // use auto-ref until there is a better connection.
    let ref = this.group.referee
    if (!(ref instanceof CgServerDriver)) {
      this.log && console.log(stime(this, ".sendToReferee: recruit new ref for group"), this.group.name)
      new CgAutoAckDriver(this.ref_join_message(this.group.name)) // failsafe. should not happen
    }
    this.log && console.log(stime(this, ".sendToReferee ->"), 0, this.innerMessageString(msg))
    return ref.sendToSocket(msg)
  }

  /** forward ack'd message to all of group. including the sender (unless nocc: true). */
  sendToMembers(message: CgMessage, andRef: boolean = false): Array<AckPromise> {
    // forward original message to all/other members of group
    let cc_sender = !message.nocc, n0 = (andRef || (this.isReferee && message.nocc === false)) ? 0 : 1
    let promises = Array<AckPromise>();
    this.group && this.group.forEachMember((member, ndx) => {
      if (ndx >= n0 && (cc_sender || (member !== this))) { // ndx==0 is the referee; TODO: other spectators (ndx<0)
        let msgStr = this.innerMessageString(message), client_id = member.client_id
        this.log && console.log(stime(this, `.sendToMembers[${this.client_id}] ->`), { client_id, msgStr })
        promises.push(member.sendToSocket(message))
      }
    })
    //promises[0].fulfill(undefined) // ensure there is  1 Promise filled, is if !message.ackExpected
    return promises
  }

  /** @override for logging */
  sendToSocket(message: CgMessage): AckPromise {
    let client_id = message.client_id, msgStr = this.innerMessageString(message), port = this.remote.port
    this.log && console.log(stime(this, `.sendToSocket[${this.client_id}] ->`), message.cgType, {client_id, msgStr, port})
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
      ack = this.makeCgMessage({ type: CgType.ack, success: true, cause: "auto-approve", client_id })
      this.log && console.log(stime(this, ".sendToSocket ack:"), {cause: ack.cause, remote: this.remote.port})
    }
    rv.fulfill(ack)
    // as if wsmessage(deserialize(serialize(message))) -> parseEval(message)
    // "parseEval" if/when referee is being asked to leave the group.
    if (client_id == this.client_id && message.type === CgType.leave ) {
      // nextTick... pretend it is delivered
      setTimeout(() => {
        //this.parseEval(message)  //this.eval_leave(message)
      }, 2)
    }
    return rv
  }
  /**
   * @override
   */
  eval_leave(msg: CgMessage) {
    let { client_id, cause, group } = msg
    // being told to leave, so group can be reclaimed; or ignore it and stay as Referee
    if (client_id == 0) {
      super.eval_leave(this.makeCgMessage({ type: CgType.leave, client_id: 0 }))
    }
  }
}
