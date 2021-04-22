import * as pb_1 from "google-protobuf";
export enum CgType {
    none = 0,
    ack = 1,
    send = 2,
    join = 3,
    leave = 4
}
export class CgMessage extends pb_1.Message {
    constructor(data?: any[] | {
        type?: CgType;
        client_id?: number;
        success?: boolean;
        msg?: Uint8Array;
        group?: string;
        cause?: string;
    }) {
        super();
        pb_1.Message.initialize(this, Array.isArray(data) && data, 0, -1, [], null);
        if (!Array.isArray(data) && typeof data == "object") {
            this.type = data.type;
            this.client_id = data.client_id;
            this.success = data.success;
            this.msg = data.msg;
            this.group = data.group;
            this.cause = data.cause;
        }
    }
    get type(): CgType {
        return pb_1.Message.getFieldWithDefault(this, 1, undefined) as CgType;
    }
    set type(value: CgType) {
        pb_1.Message.setField(this, 1, value);
    }
    get client_id(): number {
        return pb_1.Message.getFieldWithDefault(this, 2, undefined) as number;
    }
    set client_id(value: number) {
        pb_1.Message.setField(this, 2, value);
    }
    get success(): boolean {
        return pb_1.Message.getFieldWithDefault(this, 3, undefined) as boolean;
    }
    set success(value: boolean) {
        pb_1.Message.setField(this, 3, value);
    }
    get msg(): Uint8Array {
        return pb_1.Message.getFieldWithDefault(this, 4, undefined) as Uint8Array;
    }
    set msg(value: Uint8Array) {
        pb_1.Message.setField(this, 4, value);
    }
    get group(): string {
        return pb_1.Message.getFieldWithDefault(this, 5, undefined) as string;
    }
    set group(value: string) {
        pb_1.Message.setField(this, 5, value);
    }
    get cause(): string {
        return pb_1.Message.getFieldWithDefault(this, 6, undefined) as string;
    }
    set cause(value: string) {
        pb_1.Message.setField(this, 6, value);
    }
    toObject() {
        return {
            type: this.type,
            client_id: this.client_id,
            success: this.success,
            msg: this.msg,
            group: this.group,
            cause: this.cause
        };
    }
    serialize(w?: pb_1.BinaryWriter): Uint8Array | undefined {
        const writer = w || new pb_1.BinaryWriter();
        if (this.type !== undefined)
            writer.writeEnum(1, this.type);
        if (this.client_id !== undefined)
            writer.writeInt32(2, this.client_id);
        if (this.success !== undefined)
            writer.writeBool(3, this.success);
        if (this.msg !== undefined)
            writer.writeBytes(4, this.msg);
        if (typeof this.group === "string" && this.group.length)
            writer.writeString(5, this.group);
        if (typeof this.cause === "string" && this.cause.length)
            writer.writeString(6, this.cause);
        if (!w)
            return writer.getResultBuffer();
        return undefined;
    }
    serializeBinary(): Uint8Array { return this.serialize(); }
    static deserialize(bytes: Uint8Array | pb_1.BinaryReader): CgMessage {
        const reader = bytes instanceof pb_1.BinaryReader ? bytes : new pb_1.BinaryReader(bytes), message = new CgMessage();
        while (reader.nextField()) {
            if (reader.isEndGroup())
                break;
            switch (reader.getFieldNumber()) {
                case 1:
                    message.type = reader.readEnum();
                    break;
                case 2:
                    message.client_id = reader.readInt32();
                    break;
                case 3:
                    message.success = reader.readBool();
                    break;
                case 4:
                    message.msg = reader.readBytes();
                    break;
                case 5:
                    message.group = reader.readString();
                    break;
                case 6:
                    message.cause = reader.readString();
                    break;
                default: reader.skipField();
            }
        }
        return message;
    }
}
