import { CgMessage, CGmsg } from "./client-group";
import { CnxHandler } from "./wspbserver";

export class CgMessageHandler extends CnxHandler {
  static groups: CgMessageHandler[][] // Map(group-name:string => CgMessageHanlder[])
  group_name: string;  // group to which this connection is join'd
  get group(): CgMessageHandler[] { return CgMessageHandler.groups[this.group_name]}

  // this may be tricky... need to block non-ack from any client with outstanding ack
  // (send them an immediate nak)
  waiting_for_ack: CgMessage; // the message that was sent
  waiting_for_client: number; // the sender who is waiting

  /** referee never[?] initiates a move; can Nak a move; replies to draw/shuffle/next-Turn-Player; 
   * [in 2-player P-v-P (no ref) each player acts as referee to the other?]
   * may need a way to tell client they are the referee/moderator
   */
  isReferee(message: CgMessage): boolean {
    return (message.client_id === 0 && message.cause === "referee")
  }
  wsmessage(buf: Buffer): void {
    let message = CgMessage.deserializeBinary(buf) as CgMessage
    if (message.type != CGmsg.join && this.group[message.client_id] != this) {
      console.log("ignore message from non-member")
      return
    }
    if (!!this.waiting_for_ack && message.type != CGmsg.ack) {
      console.log("sendNak: outstanding ack")
      this.sendNak(this, "outstanding ack")
      return
    }

    switch (message.type) {
      case CGmsg.ack: {
        if (!message.success && !this.isReferee(message)) {
          // if (message.cuase =="resend") ? if resend_count > N {this.close/leave/robot}
          this.send(this, this.waiting_for_ack)
          break;
        }
        if (!message.success && this.isReferee(message)) {
          let from = this.group[this.waiting_for_client]
          this.send(from, message) // forward message to originator: from.ws.send(message)
        }
        this.waiting_for_ack = undefined // check group waiting... send event, or resolve Promise
        break
      }
      case CGmsg.join: {
        if (this.group_name !== undefined) {
          this.sendNak(this, "already in group")
          break
        }
        let join_name = message.group
        let group: CgMessageHandler[] = CgMessageHandler.groups[join_name]
        if (!group) {
          group = CgMessageHandler.groups[join_name] = new Array<CgMessageHandler>();
          group[0] = new CgMessageHandler(undefined) // TODO: spawn a referee, let it connect
        }
        this.group_name = join_name
        let client_id = this.isReferee(message) ? 0 : group.length
        group[client_id] = this
        this.send(this, new CgMessage({ type: CGmsg.ack, success: true, client_id: client_id, group: join_name }))
        break
      }
      case CGmsg.leave: {
        let remove_on_ack = () => { this.group.splice(this.group.indexOf(this)) }
        this.sendToGroup(message, remove_on_ack)
        // when this.group.find(g => g.waiting_for_ack) == false --> sendAck()
      }
      case CGmsg.send: {
        this.sendToGroup(message, () => { this.sendAck(this, "done") })
      }
      case CGmsg.none: {
        console.log("none: should not happen")
      }
    }
  }
  sendAck(to: CgMessageHandler, cause: string) {
    this.send(to, new CgMessage({type: CGmsg.ack, success: true, cause: cause, group: this.group_name}))
  }
  sendNak(to: CgMessageHandler, cause: string) {
    this.send(to, new CgMessage({type: CGmsg.ack, success: false, cause: cause, group: this.group_name}))
  }
  send(to: CgMessageHandler, message: CgMessage) {
    to.waiting_for_ack = message
    to.waiting_for_client = this.group.indexOf(this)
    // Do whatever to send message to "to"
  }
  sendToGroup(msg: CgMessage, on_ack?, on_nak?) {
    // first send to referee, 
    // if ack-success, then send to rest of group
    // if ack-fail, then sendNak()
    this.group.forEach(group => {if (group != this) this.send(group, msg)})
  }

}
