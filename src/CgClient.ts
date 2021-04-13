import { CgBaseCnx } from './CgBase';
import { CgMessage, CgType } from './CgProto';
import { EitherWebSocket, pbMessage, PbParser } from './wspbserver';

/** a web client using client-group.proto */
export class CgClient<IN extends pbMessage> extends CgBaseCnx<pbMessage> {

  constructor(ws: EitherWebSocket, inner_msg_handler: PbParser<IN>) {
    super(ws, inner_msg_handler)
  }

  /**
   * Connect to given URL, handling messages with 'callback' in constructor.
   * url: host:port for wss connection to GameServer (gamma-web)
   */
  connectToUrl(url: string = "wss://game4.thegraid.com:8445"): WebSocket {
    console.log("CgClient.connectToUrl: url=" + url);
    let ws = new WebSocket(url);
    let cb = this // *is* the CnxHandler
    if (cb.onopen) ws.onopen = cb.onopen;
    if (cb.onerror) ws.onerror = cb.onerror;
    if (cb.onclose) ws.onclose = cb.onclose;
    if (cb.onmessage) ws.onmessage = cb.onmessage;
    return ws;
  }

  /** send_join client makes a connection to server group */
  send_join(group: string, name: string, id?: number): Promise<CgMessage> {
    return this.sendToSocket(new CgMessage({ type: CgType.join, group: group, client_id: id }))
  }

  // todo: send_leave(cause: string)

}