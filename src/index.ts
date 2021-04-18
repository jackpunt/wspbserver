// this file is the Barrel:
export * from "./wspbserver"
export * from "./CnxHandler"
export * from "./CgProto"
export * from "./CgBaseCnx"
export * from "./CgClientCnx"
export * from "./CgServerCnx"
export * from "./EzPromise"
import type * as ws from "ws"
declare module 'ws' {
  export interface WebSocket extends ws { }
}
