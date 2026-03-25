import axios from "axios";
import { AttachmentBuilder } from "discord.js";
import { memory } from "qznt";
import sharp from "sharp";
import { FetchedImageWithSharp, MediaDimensions, RenderedMediaWithSharp } from "../../types/MediaTools.types";

export interface CreateImageGalleryOptions {
    /** Leave blank to use the size of the largest image */
    baseDimensions?: MediaDimensions;
    /** Max number of items per row @defaultValue 4 */
    maxRowLength?: number;
    /** Gap size in pixels @defaultValue 7 */
    spacing?: number;

    /** Whether to automatically scale the images to fit the gallery canvas */
    autoScale?: boolean;
    /** Quality level from 0-100 @defaultValue 75 */
    quality?: number;
    /** Compression level from 0-9 @defaultValue 7 */
    compressionLevel?: number;
    /** @defaultValue 1 */
    outputScaleFactor?: number;

    /** @defaultValue 'gallery.png' */
    fileName?: string;

    /** Whether to fail if an image couldn't be fetched @defaultValue false */
    failOnFetchFail?: boolean;
}

// TODO: Add max queue size system
export class ImageManager {
    private static readonly queue = new Map<string, Promise<Buffer<ArrayBuffer> | FetchedImageWithSharp | null>>();

    static createRenderedMediaData(
        canvas: sharp.Sharp,
        canvasBuffer: Buffer,
        dimensions: MediaDimensions,
        fileName: string
    ): RenderedMediaWithSharp {
        return {
            canvas: canvas,
            buffer: canvasBuffer,
            dimensions,
            fileName: fileName,
            url: `attachment://${fileName}`,
            getFileSize() {
                const kb = Number((canvasBuffer.byteLength / 1024).toFixed(2));
                const string = memory(canvasBuffer.byteLength, 2);
                return { kb, string };
            },
            files() {
                return { files: [new AttachmentBuilder(canvasBuffer, { name: this.fileName })] };
            }
        };
    }

    static async fetch(url: string, useSharp?: boolean): Promise<Buffer<ArrayBuffer>>;
    static async fetch(url: string, useSharp: true): Promise<FetchedImageWithSharp>;
    static async fetch(url: string, useSharp?: boolean) {
        const existing = this.queue.get(url);
        if (existing) {
            console.debug("Using buffer from queue");
            return existing;
        }

        try {
            const fetchImage = async () => {
                console.debug(`⏳ Fetching '${url}'`);
                const res = await axios.get(url, { responseType: "arraybuffer" });
                console.debug(`✓ Fetched '${url}'`);

                const buffer = Buffer.from(res.data, "binary");

                if (useSharp) {
                    const canvas = sharp(buffer);
                    const metadata = await canvas.metadata();
                    return { canvas, buffer, metadata };
                } else {
                    return buffer;
                }
            };

            const promise = fetchImage();
            this.queue.set(url, promise);

            const result = await promise;
            return result;
        } catch (err) {
            throw new Error(`[ImageManager] Failed to fetch '${url}'`, err as Error);
        } finally {
            this.queue.delete(url);
        }
    }

    public static async scaleBuffer(buffer: Buffer, factor: number) {
        const metadata = await sharp(buffer).metadata();
        return await sharp(buffer)
            .resize(Math.round(metadata.width * factor), Math.round(metadata.height * factor))
            .toBuffer();
    }
}

export default ImageManager;
