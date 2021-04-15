import type { EitherWebSocket, pbMessage, PbParser } from './wspbserver';
import { CgBaseCnx, ParserFactory } from './CgBaseCnx';
import type { CgMessage, CgType } from './CgProto';
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
  /**
   * 
   * @returns true if this CgClientCnx has role of Referee
   */
  isClient0(): boolean { return this.client_id === 0 }

}