import type { EitherWebSocket, pbMessage, PbParser } from './wspbserver';
import { CgBaseCnx, ParserFactory } from './CgBaseCnx';
import { CgMessage, CgType } from './CgProto';
import type { CnxHandler } from '.';

/** 
 * A web client using CgProto (client-group.proto)
 * 
 * Provide a inner_msg_handler:PbParser<INNER> for the wrapped protocol.
 * 
 */
export class CgClientCnx<INNER extends pbMessage> extends CgBaseCnx<INNER, CgMessage> {

  constructor(ws: EitherWebSocket | string, inner_msg_factory: ParserFactory<INNER, CgMessage>) {
    super(ws, inner_msg_factory)
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