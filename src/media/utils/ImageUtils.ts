import axios from "axios";
import { AttachmentBuilder } from "discord.js";
import { memory } from "qznt";
import sharp from "sharp";
import { FetchedImageWithSharp, MediaDimensions, RenderedMediaWithSharp } from "../../types/image.types";

export interface CreateImageGalleryOptions {
    /** Leave blank to use the size of the largest image. */
    baseDimensions?: MediaDimensions;
    /** Max number of items per row. @defaultValue 4 */
    maxRowLength?: number;
    /** Gap size in pixels. @defaultValue 7 */
    spacing?: number;
    /** Whether to automatically scale the images to fit the gallery canvas. */
    autoScale?: boolean;
    /** Quality level from 0-100. @defaultValue 75 */
    quality?: number;
    /** Compression level from 0-9. @defaultValue 7 */
    compressionLevel?: number;
    /** @defaultValue 1 */
    outputScaleFactor?: number;
    /** @defaultValue 'gallery.png' */
    fileName?: string;
    /** Whether to fail if an image couldn't be fetched. @defaultValue false */
    failOnFetchFail?: boolean;
}

export class ImageManager {
    private static readonly MAX_QUEUE_SIZE = 100;
    private static readonly queue = new Map<string, Promise<Buffer<ArrayBuffer> | FetchedImageWithSharp>>();

    static createRenderedMediaData(
        image: sharp.Sharp,
        buffer: Buffer,
        dimensions: MediaDimensions,
        fileName: string
    ): RenderedMediaWithSharp {
        return {
            image,
            buffer,
            dimensions,
            fileName,
            url: `attachment://${fileName}`,
            getFileSize() {
                return {
                    kb: Number((buffer.byteLength / 1024).toFixed(2)),
                    string: memory(buffer.byteLength, 2)
                };
            },
            files() {
                return { files: [new AttachmentBuilder(buffer, { name: this.fileName })] };
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

        if (this.queue.size >= ImageManager.MAX_QUEUE_SIZE) {
            throw new Error("[ImageManager] Fetch queue is full");
        }

        const fetchImage = async () => {
            console.debug(`⏳ Fetching '${url}'`);
            const res = await axios.get(url, { responseType: "arraybuffer" });
            console.debug(`✓ Fetched '${url}'`);

            const buffer = Buffer.from(res.data, "binary");

            if (useSharp) {
                const canvas = sharp(buffer);
                const metadata = await canvas.metadata();
                return { canvas, buffer, metadata };
            }

            return buffer;
        };

        const promise = fetchImage().catch(err => {
            throw new Error(`[ImageManager] Failed to fetch '${url}'`, { cause: err });
        });

        this.queue.set(url, promise);

        try {
            return await promise;
        } finally {
            this.queue.delete(url);
        }
    }

    static async scaleBuffer(buffer: Buffer, factor: number): Promise<Buffer> {
        const image = sharp(buffer);
        const { width, height } = await image.metadata();
        if (!width || !height) throw new Error("[ImageManager] Could not read image dimensions");
        return image.resize(Math.round(width * factor), Math.round(height * factor)).toBuffer();
    }
}
