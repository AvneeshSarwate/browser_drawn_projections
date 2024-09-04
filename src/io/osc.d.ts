// deno-lint-ignore-file no-explicit-any
// Type definitions for osc.js
// Project: Open Sound Control library for JavaScript
// Definitions by: [Your Name]
// Modifications: Adjusted for Deno compatibility and ES module usage

export interface OSCDefaults {
    metadata: boolean;
    unpackSingleArgs: boolean;
}

export interface OffsetState {
    idx: number;
}

export interface TimeTag {
    raw: [number, number];
    native: number;
}

export interface Color {
    r: number;
    g: number;
    b: number;
    a: number;
}

export interface OSCMessage {
    address: string;
    args: any[] | any;
}

export interface OSCBundle {
    timeTag: TimeTag;
    packets: (OSCMessage | OSCBundle)[];
}

export interface DataCollection {
    byteLength: number;
    parts: Uint8Array[];
}

export const SECS_70YRS: number;
export const TWO_32: number;

export const defaults: OSCDefaults;

export const isCommonJS: boolean;
export const isNode: boolean;
export const isElectron: boolean;
export const isBufferEnv: boolean;

export const Long: any;
export const TextDecoder: TextDecoder | undefined;
export const TextEncoder: TextEncoder | undefined;

export function isArray(obj: any): boolean;
export function isTypedArrayView(obj: any): boolean;
export function isBuffer(obj: any): boolean;

export function dataView(obj: ArrayLike<number> | ArrayBuffer, offset?: number, length?: number): DataView;
export function byteArray(obj: ArrayLike<number> | ArrayBuffer): Uint8Array;
export function nativeBuffer(obj: ArrayLike<number> | ArrayBuffer): Uint8Array;
export function copyByteArray(source: ArrayLike<number>, target: ArrayLike<number>, offset?: number): ArrayLike<number>;

export function readString(dv: DataView, offsetState: OffsetState): string;
export function writeString(str: string): Uint8Array;

export function readPrimitive(dv: DataView, readerName: string, numBytes: number, offsetState: OffsetState): number;
export function writePrimitive(val: number, dv: DataView | undefined, writerName: string, numBytes: number, offset?: number): Uint8Array;

export function readInt32(dv: DataView, offsetState: OffsetState): number;
export function writeInt32(val: number, dv?: DataView, offset?: number): Uint8Array;

export function readInt64(dv: DataView, offsetState: OffsetState): any;
export function writeInt64(val: { high: number, low: number }, dv?: DataView, offset?: number): Uint8Array;

export function readFloat32(dv: DataView, offsetState: OffsetState): number;
export function writeFloat32(val: number, dv?: DataView, offset?: number): Uint8Array;

export function readFloat64(dv: DataView, offsetState: OffsetState): number;
export function writeFloat64(val: number, dv?: DataView, offset?: number): Uint8Array;

export function readChar32(dv: DataView, offsetState: OffsetState): string;
export function writeChar32(str: string, dv?: DataView, offset?: number): Uint8Array | undefined;

export function readBlob(dv: DataView, offsetState: OffsetState): Uint8Array;
export function writeBlob(data: ArrayLike<number>): Uint8Array;

export function readMIDIBytes(dv: DataView, offsetState: OffsetState): Uint8Array;
export function writeMIDIBytes(bytes: ArrayLike<number>): Uint8Array;

export function readColor(dv: DataView, offsetState: OffsetState): Color;
export function writeColor(color: Color): Uint8Array;

export function readTrue(): boolean;
export function readFalse(): boolean;
export function readNull(): null;
export function readImpulse(): number;

export function readTimeTag(dv: DataView, offsetState: OffsetState): TimeTag;
export function writeTimeTag(timeTag: TimeTag): Uint8Array;

export function timeTag(secs: number, now?: number): TimeTag;
export function ntpToJSTime(secs1900: number, frac: number): number;
export function jsToNTPTime(jsTime: number): [number, number];

export function readArguments(dv: DataView, options: Partial<OSCDefaults>, offsetState: OffsetState): any[];
export function writeArguments(args: any[], options: Partial<OSCDefaults>): Uint8Array;

export function readMessage(data: ArrayLike<number>, options?: Partial<OSCDefaults>, offsetState?: OffsetState): OSCMessage;
export function writeMessage(msg: OSCMessage, options?: Partial<OSCDefaults>): Uint8Array;

export function isValidMessage(msg: any): boolean;

export function readBundle(dv: DataView, options?: Partial<OSCDefaults>, offsetState?: OffsetState): OSCBundle;
export function writeBundle(bundle: OSCBundle, options?: Partial<OSCDefaults>): Uint8Array;

export function isValidBundle(bundle: any): boolean;

export function readPacket(data: ArrayLike<number>, options?: Partial<OSCDefaults>, offsetState?: OffsetState, len?: number): OSCMessage | OSCBundle;
export function writePacket(packet: OSCMessage | OSCBundle, options?: Partial<OSCDefaults>): Uint8Array;

export const argumentTypes: { [key: string]: { reader: string, writer?: string } };

export function inferTypeForArgument(arg: any): string;
export function annotateArguments(args: any[]): any[];