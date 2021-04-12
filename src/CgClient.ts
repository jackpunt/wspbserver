import * as jspb from 'google-protobuf';
import { CgMessage, CgType } from './CgProto';
import * as wspb from './wspbserver';
import * as cgp from './CgProto'
import { eitherWebSocket, pbMessage, PbMessageHandler } from './wspbserver';
import { CgBaseCnx } from './CgBase';
import * as ws from 'ws';

/** a web client using client-group.proto */
export class CgClient<IN extends CgMessage> extends CgBaseCnx<CgMessage> {
  constructor(ws: eitherWebSocket, inner_msg_handler: PbMessageHandler<IN>) {
    super(ws)
    this.inner_msg_handler = inner_msg_handler
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

  basecb: wspb.WebSocketEventHandler = {
    onopen:     ((event: Event): void => {
        console.log("CgClient ws opened, event=", event);
    }),
    onclose:    ((event: CloseEvent): void => {
        console.log("CgClient ws closed: event=", event);
        //if (!!callback && callback.onclose) callback.onclose(event);
    }),
    onerror:    ((error: Event): void => {
        console.log("CgClient: reject; error=", error);
    }),
    onmessage:  ((event: MessageEvent<Uint8Array>): void => {
        let data: Uint8Array = event.data;  // ArrayBuffer in general; any
        //console.log("CgClient data="+data);
        //console.log("CgClient data.byteLength=%s", data.byteLength);
        // msg_class: class<? extends jspb.proto>
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/dot-notation
        let message = this.msg_handler.deserialize(data)
        console.log("CgClient message.toObject: ", message.toObject());
        this.msg_handler.parseEval(message)
    }),
  }

  /** send_join client makes a connection to server group */
  send_join(group: string, name: string, id?: number): Promise<CgMessage> {
    return this.sendToSocket(new CgMessage({ type: CgType.join, group: group, client_id: id }))
  }


}