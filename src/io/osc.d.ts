// deno-lint-ignore-file no-explicit-any
// Type definitions for osc.js
// Project: Open Sound Control library for JavaScript
// Definitions by: [Your Name]

declare namespace osc {
    interface OSCDefaults {
        metadata: boolean;
        unpackSingleArgs: boolean;
    }

    interface OffsetState {
        idx: number;
    }

    interface TimeTag {
        raw: [number, number];
        native: number;
    }

    interface Color {
        r: number;
        g: number;
        b: number;
        a: number;
    }

    interface OSCMessage {
        address: string;
        args: any[] | any;
    }

    interface OSCBundle {
        timeTag: TimeTag;
        packets: (OSCMessage | OSCBundle)[];
    }

    interface DataCollection {
        byteLength: number;
        parts: Uint8Array[];
    }

    const SECS_70YRS: number;
    const TWO_32: number;

    const defaults: OSCDefaults;

    const isCommonJS: boolean;
    const isNode: boolean;
    const isElectron: boolean;
    const isBufferEnv: boolean;

    const Long: any;
    const TextDecoder: TextDecoder | undefined;
    const TextEncoder: TextEncoder | undefined;

    function isArray(obj: any): boolean;
    function isTypedArrayView(obj: any): boolean;
    function isBuffer(obj: any): boolean;

    function dataView(obj: ArrayLike<number> | ArrayBuffer, offset?: number, length?: number): DataView;
    function byteArray(obj: ArrayLike<number> | ArrayBuffer): Uint8Array;
    function nativeBuffer(obj: ArrayLike<number> | ArrayBuffer): Buffer | Uint8Array;
    function copyByteArray(source: ArrayLike<number>, target: ArrayLike<number>, offset?: number): ArrayLike<number>;

    function readString(dv: DataView, offsetState: OffsetState): string;
    function writeString(str: string): Uint8Array;

    function readPrimitive(dv: DataView, readerName: string, numBytes: number, offsetState: OffsetState): number;
    function writePrimitive(val: number, dv: DataView | undefined, writerName: string, numBytes: number, offset?: number): Uint8Array;

    function readInt32(dv: DataView, offsetState: OffsetState): number;
    function writeInt32(val: number, dv?: DataView, offset?: number): Uint8Array;

    function readInt64(dv: DataView, offsetState: OffsetState): any;
    function writeInt64(val: { high: number, low: number }, dv?: DataView, offset?: number): Uint8Array;

    function readFloat32(dv: DataView, offsetState: OffsetState): number;
    function writeFloat32(val: number, dv?: DataView, offset?: number): Uint8Array;

    function readFloat64(dv: DataView, offsetState: OffsetState): number;
    function writeFloat64(val: number, dv?: DataView, offset?: number): Uint8Array;

    function readChar32(dv: DataView, offsetState: OffsetState): string;
    function writeChar32(str: string, dv?: DataView, offset?: number): Uint8Array | undefined;

    function readBlob(dv: DataView, offsetState: OffsetState): Uint8Array;
    function writeBlob(data: ArrayLike<number>): Uint8Array;

    function readMIDIBytes(dv: DataView, offsetState: OffsetState): Uint8Array;
    function writeMIDIBytes(bytes: ArrayLike<number>): Uint8Array;

    function readColor(dv: DataView, offsetState: OffsetState): Color;
    function writeColor(color: Color): Uint8Array;

    function readTrue(): boolean;
    function readFalse(): boolean;
    function readNull(): null;
    function readImpulse(): number;

    function readTimeTag(dv: DataView, offsetState: OffsetState): TimeTag;
    function writeTimeTag(timeTag: TimeTag): Uint8Array;

    function timeTag(secs: number, now?: number): TimeTag;
    function ntpToJSTime(secs1900: number, frac: number): number;
    function jsToNTPTime(jsTime: number): [number, number];

    function readArguments(dv: DataView, options: Partial<OSCDefaults>, offsetState: OffsetState): any[];
    function writeArguments(args: any[], options: Partial<OSCDefaults>): Uint8Array;

    function readMessage(data: ArrayLike<number>, options?: Partial<OSCDefaults>, offsetState?: OffsetState): OSCMessage;
    function writeMessage(msg: OSCMessage, options?: Partial<OSCDefaults>): Uint8Array;

    function isValidMessage(msg: any): boolean;

    function readBundle(dv: DataView, options?: Partial<OSCDefaults>, offsetState?: OffsetState): OSCBundle;
    function writeBundle(bundle: OSCBundle, options?: Partial<OSCDefaults>): Uint8Array;

    function isValidBundle(bundle: any): boolean;

    function readPacket(data: ArrayLike<number>, options?: Partial<OSCDefaults>, offsetState?: OffsetState, len?: number): OSCMessage | OSCBundle;
    function writePacket(packet: OSCMessage | OSCBundle, options?: Partial<OSCDefaults>): Uint8Array;

    const argumentTypes: { [key: string]: { reader: string, writer?: string } };

    function inferTypeForArgument(arg: any): string;
    function annotateArguments(args: any[]): any[];
}

export = osc;
export as namespace osc;