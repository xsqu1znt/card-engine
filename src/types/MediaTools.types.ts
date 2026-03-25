import { AttachmentBuilder } from "discord.js";
import sharp from "sharp";

export interface MediaDimensions {
    width: number;
    height: number;
}

export interface FetchedImageWithSharp {
    canvas: sharp.Sharp;
    buffer: Buffer;
    metadata: sharp.Metadata;
}

export interface RenderedMediaWithSharp {
    canvas: sharp.Sharp;
    buffer: Buffer;
    dimensions: MediaDimensions;
    fileName: string;
    url: string;
    getFileSize: () => { kb: number; string: string };
    files: (this: RenderedMediaWithSharp) => { files: AttachmentBuilder[] };
}
