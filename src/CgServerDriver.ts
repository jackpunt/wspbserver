import { json } from "@thegraid/common-lib";
import { AckPromise, BaseDriver, CgBase, CgMessage, CgMessageOpts, CgType, CLOSE_CODE, DataBuf, pbMessage, stime, UpstreamDrivable } from "@thegraid/wspbclient";
import { execSync } from "child_process";
import { ServerSocketDriver } from "./ServerSocketDriver.js";
import type { Remote } from "./wspbserver.js";

function listTCPsockets(pid = `${process.pid}`) {
  let lsofTCP = execSync(`(lsof -P -i TCP -a -p ${pid}; cat)`, {stdio: ['ignore', 'pipe', 'ignore']} ).toString()
  let lines = lsofTCP.split('\n')
  let openSockets = lines.slice(1, -1)
  console.log(stime('CgServerDriver', `.listTCPsockets(${pid}): ${openSockets.length} sockets`), openSockets)
  return openSockets
}
/** Map(name, length, referee) from member_id -> CgServerDriver */
class ClientGroup extends Map<number, CgServerDriver> {
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
  /** member.{client_id, group, group_name} = {id, this, this.name} */
  override set (id: number, member: CgServerDriver): this {
    super.set(id, member)
    member.client_id = id
    member.group = this
    member.group_name = this.name // in case of debug mostly.
    return this
  }
  /** itemize the group membership. For logging join/leave */
  get members() {
    let rv = []  // TODO: get Map.entries().map() to work
    for (let [id, driver] of this) rv.push([id, driver.remote_addr_port])
    return rv;
  }
  forEachMember(fn: (driver: CgServerDriver, client_id: number) => void) {
    this.forEach(fn);
  }
  getMember(client_id: number) {
    return this.get(client_id)
  }
  memberId(driver: CgServerDriver) {
    for (let value of this.entries()) { if (value[1] === driver) return value[0] }
    return undefined
  }
  /** find lowest client_id not currently in use. Set .group, .group_name */
  addMember(member: CgServerDriver) { 
    for (let id = 1; ; id++) {
      if (!this.has(id)) {
        this.set(id, member) // member.{client_id, group, group_name} = {id, this:ClientGroup, this.name}
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
export class CgServerDriver extends CgBase<pbMessage> {
  static cGroups: Map<string, ClientGroup> = new Map()
  static logLevel = 1
  constructor() { 
    super(); 
    this.log = CgServerDriver.logLevel 
    this.ll(1) && listTCPsockets()
  }

  /** the extant ClientGroup matching CgBase.group_name. */
  group: ClientGroup;

  /** identify port before joined. 
   * @override client-only version in CgBase
   */
  override get client_port() { return this.client_id !== undefined ? this.client_id : this.remote_addr_port }

  /** pluck Remote info from ServerSocketBase of this stream. */
  get remote(): Remote { 
    return (this.wsbase as ServerSocketDriver<any>).remote
  }
  get remote_addr_port() {
    return `${this.remote.addr}:${this.remote.port}`
  }

  override logData(data: DataBuf<CgMessage>) {
    // for server logs: return single-line string when able:
    let logData = super.logData(data) as { msgObj: {} | string, str?: string, imsg?: string | pbMessage }
    if (Object.keys(logData).length > 1) return logData  // <-- with embedded str&imsg
    let msgObj = logData.msgObj                   // extract msgObj and stringify it
    if (typeof msgObj === 'string') return msgObj // <-- the usual case [already stringified]
    return json(msgObj)                           // <-- if super uses msg.msgObject
  }
  override connectDnStream(dnstream: UpstreamDrivable<CgMessage>): this {
    super.connectDnStream(dnstream)
    if (dnstream instanceof ServerSocketDriver) {
      //dnstream.wss.addEventListener('close', (ev: ws.CloseEvent) => this.implicitLeave(ev))
      dnstream.addEventListener('close', (ev) => this.implicitLeave(ev))
    }
    return this
  }
  implicitLeave(ev: { type?: string, code?: CLOSE_CODE, reason?: string, wasClean?: boolean }) {
    let { wasClean, reason, code } = ev
    let client_id = this.group?.memberId(this) // verify [this, client_id] is [still] in group
    this.ll(1) && console.log(stime(this, `.implicitLeave[${this.client_id}]`), json({ code, reason, wasClean, port: this.client_port}))
    if (client_id >= 0) {
      let group = this.group_name, cause = "closed", nocc = true
      let message = this.makeCgMessage({ type: CgType.leave, group, client_id, cause, nocc })
      // fwd the leave msg to all members (as if client had done send_leave)
      this.eval_leave(message)
    }
    this.ll(1) && listTCPsockets()
  
  }

  get isReferee(): boolean { return this.client_id === 0 }
  /** referee never[?] initiates a move; can Nak a move; replies to draw/shuffle/next-Turn-Player; 
   * [in 2-player P-v-P (no ref) each player acts as referee to the other?]
   * may need a way to tell client they are the referee/moderator
   */
  isRefereeJoin(message: CgMessage): boolean {
    return (message.client_id === 0 && message.cause === "referee") // TODO: test client_id === -1
  }
  /** recruit CgAutoAck as referee */
  ref_join_message(group: string, client_id = 0, cause = "referee") {
    return this.makeCgMessage({ type: CgType.join, client_id, group, cause })
  }
  // override for debug/logging
  override sendAck(cause: string, opts?: CgMessageOpts): AckPromise {
    let mopts = (opts instanceof CgMessage) ? opts.msgObject : opts
    this.ll(1) && console.log(stime(this, ".sendAck:"), `${this.client_id} ->`, json({ cause, ...mopts }))
    return super.sendAck(cause, opts)
  }
  /**
   * process an incoming message from client.
   * @param message
   * @returns void
   * @override
   */
   override parseEval(message: CgMessage): void {
    message.client_from = this.client_id      // ensure every message thru CgServer is augmented with client_from
    if (message.type !== CgType.join && this.client_id === undefined) {
      this.ll(1) && console.log(stime(this, `.parseEval[-] <-`), this.innerMessageString(message), "nak & ignore message from non-member")
      this.sendNak("not a member")
      return
    }
    if (!this.ack_resolved && message.type != CgType.ack) {
      this.ll(1) && console.log(stime(this, `.parseEval[${this.client_id}] <-`), this.innerMessageString(message), "nak: waiting for ack of", this.innerMessageString(this.ack_message))
      this.sendNak("need to ack: " + this.ack_message_type)
      return
    }
    return super.parseEval(message) // detect "ignore spurious Ack:"
  }
  /**
   * @override
   */
  override eval_ack(message: CgMessage, req: CgMessage): void {
    return // super.parseEval will fulfill this.ack_promise
  }
  /**
   * @override
   */
  override eval_nak(message: CgMessage, req: CgMessage): void {
    return // super.parseEval will fulfill this.ack_promise
    // TODO: sendToOthers to relay any 'Nak' (in the promise[]) back to caller.
    // The application can then decide to rescind or resend the action
  }
  /** on server: add to group: anybody can join, no filters at this point.  
   * self-joining, and we don't even tell the rest of the Group!
   * just walk right in, sit right down...
   * 
   * If (client_id == 0 && cause == 'referee') then make special assignment to client_id 0.
   * (see this.isFromReferee()); otherwise client_id = next_client_id and push onto end of group.
   * 
   * QQQQ: should 'join' requests be moderated by client_0 ? (to verify passcode or whatever)
   */
  override eval_join(message: CgMessage): void {
    let join_name = this.group?.name
    let reject = (msg) => { this.sendNak(msg, { group: join_name }) }

    if (this.group !== undefined) return reject("already in group")
    join_name = message.group
    if (join_name.length < 2) return reject("invalid group name")

    let group = CgServerDriver.cGroups.get(join_name);
    let fnew = (message.cause == 'new'), sep = '_'
    this.ll(1) && console.log(stime(this, `.eval_join:`), { fnew, join_name, group: !!group, message: message.msgString })
    if (fnew && group) {
      if (join_name.includes(sep)) return reject("invalid base name")
      let base_name = join_name, suf = Math.floor(Math.random()*35), mod = 100, nc = 1, gmax = 4
      do {
        if (++nc >= mod) mod *= 10
        if (nc > gmax) return reject('server max')
        let suffix = mod % (suf + 17)
        join_name = `${base_name}${sep}${suffix}`
        group = CgServerDriver.cGroups.get(join_name);
        this.ll(2) && console.log(stime(this, `.eval_join: fnew`), { fnew, join_name, group })
      } while (group)
    }
    if (!group) {
      // create/register the group, recruit a Referee:
      group = new ClientGroup(join_name)
      CgServerDriver.cGroups.set(join_name, group)
      new CgAutoAckDriver(this.ref_join_message(join_name)) // reentrant call to eval_join!
      this.ll(1) && console.log(stime(this, '.eval_join:'), `new Group(${group.name})`, group.members)
    }
    let isAutoAck = !group.referee || (group.referee instanceof CgAutoAckDriver)
    let cause = isAutoAck ? "auto-approve" : "ref-approved"
    if (this.isRefereeJoin(message)) {
      if (!isAutoAck && (group.referee instanceof CgServerDriver)) {
        return reject('referee exists')
      } 
      cause = (this instanceof CgAutoAckDriver) ? 'auto-referee' : 'real-referee' 
      // Note: we don't 'kick' the auto-ref, we just over-write it in the Group:
      group.referee = this  // replace CgAutoAckDriver with [CgServerDriver connected to] real referee
      // in theory, we could make a CgRefServerDriver, and connectDnStream() [replacing 'this']
    } else { 
      group.addMember(this) // this.group=group
    }
    this.ll(1) && console.log(stime(this, ".eval_join"), { members: group.members, remote: this.remote_addr_port })
    this.sendAck(cause, { client_id: this.client_id, group: join_name })
    return
  }

  /** when client leaves group: remove CgSrvDrv from the group array. */
  removeFromGroup() {
    let client_id = this.client_id, group = this.group, group_name = group.name
    this.ll(1) && console.log(stime(this, `.removeFromGroup:A c_id = ${client_id}`), group.members)
    group.removeMember(client_id) // this.group = undefined
    this.ll(1) && console.log(stime(this, `.removeFromGroup:B c_id = ${client_id}`), group.members)

    if (group.length > 0 && client_id === 0) {
      // ref has disconnected! [this.wasReferee] Replace with auto-ack:
      new CgAutoAckDriver(this.ref_join_message(group.name)) // ++group.length
      return // because group.length > 1
    }

    if (group.length === 1 && !!group.referee) {
      // tell refClient it can leave (perma-group Ref may stay to keep Group alive)
      let ref = group.referee
      this.ll(1) && console.log(stime(this, ` [${this.client_port}].removeFromGroup:0 c_id = ${ref.client_id} ref =`), ref.remote_addr_port)
      let message = this.makeCgMessage({ type: CgType.leave, client_id: 0, cause: "all others gone", group: group_name })
      ref.sendToSocket(message); // refClient will: eval_leave() { send_leave(); leaveClose(); }
    } else if (group.length === 0) {
      // delete group if nobody is left:
      CgServerDriver.cGroups.delete(group_name)
      this.ll(1) && console.log(stime(this, `.removeFromGroup: delete(${group_name})---------`))
    }
    return
  }
  /** remote client voluntary 'leave'; [incl "closed" socket] 
   * notify others [ref emits 'leave' to upstream] & removeFromGroup
   * see also: dnstream.wsclose(reason, code, wasClean) 
   */
  override eval_leave(message: CgMessage): void {
    this.ll(1) && console.log(stime(this, `.eval_leave[${this.client_id}] <-`), json(message.toObject()))
    // in CgBase/Client: cases for: isSelf[go away], other[inform, change avatar?]
    // in CgRefClient/CmReferee: edit roster
    // in CgServer[here]: from client seeking to leave, sendToGroup, removeFromGroup
    // in CgServer[here]: from implicitLeave - detect dnstream.wsclose and removeFromGroup()

    let target_id = message.client_id, client_id = this.client_id
    let remove_from_group = () => { 
      this.removeFromGroup() // this.group = undefined
      console.log(stime(this, `.eval_leave: return from removeFromGroup`), {target_id, client_id, cause: message.cause})
      if (this.isReferee && target_id !== 0) {
        let target = this.group.getMember(target_id), reason = 'closed by referee';
        console.log(stime(this, `.eval_leave: [${target_id}].closeStream('${reason}')`))
        target.closeStream(CLOSE_CODE.PolicyViolation, reason) // # 1008
      } else if (target_id == client_id && message.cause.endsWith('&close')) {
        let target = this, reason = message.cause
        console.log(stime(this, `.eval_leave: [${target_id}].closeStream('${reason}')`))
        target.closeStream(CLOSE_CODE.NormalClosure, reason)
      }
    }
    //message.nocc = (this.client_id === message.client_id) // tell everyone *else*... not me.
    this.sendToGroup(message, null, null, remove_from_group)
    return
  }
  /** 
   * sendToReferee(), sendToGroup(), sendAck() when done 
   * @param message forward this CgMessage\<pbMessage> to Group.
   * @override
   */
  override eval_send(message: CgMessage): void {
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

    let client_to = message.client_id    // if GROUP_ID send to 'all' of Group
    this.ll(1) && console.log(stime(this, ".eval_send:"), `${message.client_from} -> ${client_to === CgMessage.GROUP_ID ? 'GROUP_ID': client_to}`, this.innerMessageString(message), 'nocc:', message.nocc)
    if (client_to !== CgMessage.GROUP_ID) {
      // DM to specific client:
      let promise = this.group.getMember(client_to).sendToSocket(message)
      promise.then(send_ack_done, send_failed)
    } else {
      this.sendToGroup(message, send_all_done, send_failed, () => { 
        this.ll(0) && console.log(stime(this, "...eval_send finally")) 
      });
    }
    return
  }

  /** 
   * sendToMembers() -> Promise.all(on_ack,on_ref).finally(on_fin)
   * 
   * if !thisisReferee { sendToReferee() ? sendToOthers() : sendNak }
   * 
   * if (msg.expectsAck && !isReferee) -> sendToReferee() ? sendToOthers() : sendNak
   * else sendToOthers()
   */
  sendToGroup(message: CgMessage, on_ack?: (pa: CgMessage[]) => void, on_rej?: (pa: CgMessage[]) => void, on_fin?: () => void) {
    // on_ack & on_rej 'default' to: idenity(val) => val
    // first send to referee,
    // if ack-success, then send to rest of group
    // if ack-fail, then sendNak(ack.cause)
    // if fail-to-send or fail-to-ack, then sendNak("app failure")
    let sendToOthers = (message: CgMessage, andRef = false) => {
        // forward original message to all/rest of group
        let promises = this.sendToMembers(message, andRef)
        let alldone = Promise.all(promises) // if !expectsAck -> promises(fulfill(undefined))->on_ack,on_fin
        alldone.then(on_ack, on_rej)
        alldone.finally(on_fin) // ignore any throw()
        // this.handlePromiseAll(alldone, on_ack, on_rej, null, on_fin)
    }
    if (this.isReferee || !message.expectsAck) {
      sendToOthers(message, !this.isReferee) // broadcast to everyone
    } else if (message.expectsAck) {
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
  /** For CgType.send, the Ack from Referee can include a [CgType.send] message to be sent. */
  refMessage(orig: CgMessage, ack: CgMessage): CgMessage {
    let msgToSend = (ack.has_msg) ? CgMessage.deserialize(ack.msg) : orig
    this.ll(1) && console.log(stime(this, `.refMessage`), msgToSend.msgString)
    return msgToSend
  }

  sendToReferee(msg: CgMessage) {
    // use auto-ref until there is a better connection.
    let ref = this.group.referee
    if (!(ref instanceof CgServerDriver)) {
      this.ll(1) && console.log(stime(this, ".sendToReferee: recruit new ref for group"), this.group.name)
      new CgAutoAckDriver(this.ref_join_message(this.group.name)) // failsafe. should not happen
    }
    this.ll(1) && console.log(stime(this, ".sendToReferee ->"), 0, this.innerMessageString(msg))
    return ref.sendToSocket(msg)
  }

  /** forward ack'd message to all of group. including the sender (unless nocc: true). */
  sendToMembers(message: CgMessage, andRef: boolean = false): Array<AckPromise> {
    // forward original message to all/other members of group
    let cc_sender = !message.nocc, n0 = (andRef || (this.isReferee && message.nocc === false)) ? 0 : 1
    let promises = Array<AckPromise>();
    this.group?.forEachMember((member, ndx) => {
      if (ndx >= n0 && (cc_sender || (member !== this))) { // ndx==0 is the referee; TODO: other spectators (ndx>maxPlayers)
        let msgStr = this.innerMessageString(message), member_id = member.client_id
        this.ll(1) && console.log(stime(this, `.sendToMembers[${this.client_id}] ->`), { member_id, msgStr })
        promises.push(member.sendToSocket(message))
      }
    })
    //promises[0].fulfill(undefined) // ensure there is  1 Promise filled, is if !message.ackExpected
    return promises
  }

  /** @override for logging */
  override sendToSocket(message: CgMessage): AckPromise {
    let client_id = message.client_id, msgStr = this.innerMessageString(message), port = this.remote.port
    this.ll(1) && console.log(stime(this, `.sendToSocket[${this.client_id}] ->`), message.msgType, {client_id, msgStr, port})
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
  static port_no = 0
  /** serial number */
  port = ++CgAutoAckDriver.port_no
  constructor(ref_join_message: CgMessage) {
    super()
    // ASSERT: this.isFromReferee(join_message)
    this.eval_join(ref_join_message)
  }
  /** 
   * @override there is no downstream websocket, no remote connnection
   */
  override get remote(): Remote { return { addr: "CgAutoAckDriver", port: this.port, family: "" } }
  /**
   * @override There is no dnstream Socket; don't 'send' anything.
   * @return a Promise\<Ack> that is resolved (without send/recv/eval)
   */
  override sendToSocket(message: CgMessage): AckPromise {
    let rv = new AckPromise(message)
    let ack: CgMessage = null;
    let client_id = message.client_from   // CgAutoAckDriver doing what Referee would do?
    // msgsToAck: [none, join, leave, send]
    if (message.expectsAck) {
      ack = this.makeCgMessage({ type: CgType.ack, success: true, cause: "auto-approve", client_id })
      this.ll(1) && console.log(stime(this, ".sendToSocket ack:"), { cause: ack.cause, port: this.remote.port })
    }
    // nextTick... pretend it is delivered
    // this.parseEval(message)  //this.eval_leave(message)
    setTimeout(() => { rv.fulfill(ack) }, 2)
    return rv
  }
  /**
   * @override
   */
  override eval_leave(msg: CgMessage) {
    let { client_id, cause, group } = msg
    // being told to leave, so group can be reclaimed; or ignore it and stay as Referee
      console.log(stime(this, `.eval_leave:`), msg.msgString)
    if (client_id == 0) {
      super.eval_leave(this.makeCgMessage({ type: CgType.leave, client_id: 0, info: 'autoRef leaves' }))
    }
  }
}
