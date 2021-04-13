import * as pb_1 from "google-protobuf";
export declare enum CgType {
    none = 0,
    ack = 1,
    send = 2,
    join = 3,
    leave = 4
}
export declare class CgMessage extends pb_1.Message {
    constructor(data?: any[] | {
        type?: CgType;
        client_id?: number;
        success?: boolean;
        msg?: Uint8Array;
        group?: string;
        cause?: string;
    });
    get type(): CgType;
    set type(value: CgType);
    get client_id(): number;
    set client_id(value: number);
    get success(): boolean;
    set success(value: boolean);
    get msg(): Uint8Array;
    set msg(value: Uint8Array);
    get group(): string;
    set group(value: string);
    get cause(): string;
    set cause(value: string);
    toObject(): {
        type: CgType;
        client_id: number;
        success: boolean;
        msg: Uint8Array;
        group: string;
        cause: string;
    };
    serialize(w?: pb_1.BinaryWriter): Uint8Array | undefined;
    serializeBinary(): Uint8Array;
    static deserializeBinary(bytes: Uint8Array): CgMessage;
    static deserialize(bytes: Uint8Array | pb_1.BinaryReader): CgMessage;
}
