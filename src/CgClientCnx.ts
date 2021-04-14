import type { EitherWebSocket, pbMessage, PbParser } from './wspbserver';
import { CgMessage, CgType } from './CgProto';
import { CgBaseCnx } from './CgBaseCnx';

/** 
 * A web client using CgProto (client-group.proto)
 * 
 * Provide a inner_msg_handler:PbParser<INNER> for the wrapped protocol.
 * 
 */
export class CgClientCnx<INNER extends pbMessage> extends CgBaseCnx<pbMessage> {

  constructor(ws: EitherWebSocket | string, inner_msg_handler: PbParser<INNER>) {
    super(ws, inner_msg_handler)
  }

  /** send_join client makes a connection to server group */
  send_join(group: string, name: string, id?: number): Promise<CgMessage> {
    return this.sendToSocket(new CgMessage({ type: CgType.join, group: group, client_id: id }))
  }
  /** send_join client makes a connection to server group */
  send_leave(group: string, name: string, id?: number): Promise<CgMessage> {
    return this.sendToSocket(new CgMessage({ type: CgType.leave, group: group, client_id: id }))
  }

  // todo: send_leave(cause: string)

}