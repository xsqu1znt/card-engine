import type { CardLike } from "@/types/card.types.js";

import sharp from "sharp";
import { ImageManager } from "../utils/ImageUtils.js";

type GrayscaleCardTarget = string | number | CardLike;

export type GrayscaleCardSelector =
    | boolean
    | GrayscaleCardTarget[]
    | Set<GrayscaleCardTarget>
    | Record<string, boolean>
    | ((card: CardLike, index: number) => boolean);

export interface RenderOptions {
    rowLength?: number;
    gap?: number;
    scaleFactor?: number;
    pngOptions?: sharp.PngOptions;
    /** Pads the canvas to always fit a full row, leaving empty transparent slots for missing cards. */
    padToFullRow?: boolean;
    /**
     * Selects which cards should render in grayscale. Accepts a global boolean,
     * card IDs, card indexes, CardLike objects, a cardId lookup object, or a predicate.
     */
    grayscaleCards?: GrayscaleCardSelector;
}

interface SlotDimensions {
    width: number;
    height: number;
}

export class CardGalleryRenderer {
    private readonly cards = new Map<string, CardLike>();
    private readonly cardBuffers = new Map<string, Buffer>();
    private readonly cardMetadata = new Map<string, sharp.Metadata>();

    constructor(options?: { cards: CardLike[] }) {
        if (options?.cards.length) this.addCards(...options.cards);
    }

    addCards(...cards: (CardLike | { card: CardLike; buffer: Buffer; metadata?: sharp.Metadata })[]): this {
        for (const entry of cards) {
            if ("buffer" in entry) {
                this.cards.set(entry.card.cardId, entry.card);
                this.cardBuffers.set(entry.card.cardId, entry.buffer);
                if (entry.metadata) this.cardMetadata.set(entry.card.cardId, entry.metadata);
            } else {
                this.cards.set(entry.cardId, entry);
            }
        }
        return this;
    }

    private async fetchCardImages(): Promise<{ buffers: Buffer[]; metadata: sharp.Metadata[] }> {
        await Promise.all(
            Array.from(this.cards.values()).map(async card => {
                if (this.cardBuffers.has(card.cardId)) {
                    if (!this.cardMetadata.has(card.cardId)) {
                        const metadata = await sharp(this.cardBuffers.get(card.cardId)!).metadata();
                        this.cardMetadata.set(card.cardId, metadata);
                    }
                    return;
                }

                const { buffer, metadata } = await ImageManager.fetch(card.asset.imageUrl, true);
                this.cardBuffers.set(card.cardId, buffer);
                this.cardMetadata.set(card.cardId, metadata);
            })
        );

        const cardEntries = Array.from(this.cards.values());
        return {
            buffers: cardEntries.map(c => this.cardBuffers.get(c.cardId)!),
            metadata: cardEntries.map(c => this.cardMetadata.get(c.cardId)!)
        };
    }

    private chunkRows(metadata: SlotDimensions[], rowLength: number): SlotDimensions[][] {
        const rows: SlotDimensions[][] = [];
        for (let i = 0; i < metadata.length; i += rowLength) {
            rows.push(metadata.slice(i, i + rowLength));
        }
        return rows;
    }

    private shouldGrayscaleCard(selector: GrayscaleCardSelector | undefined, card: CardLike, index: number): boolean {
        if (selector === undefined) return false;
        if (typeof selector === "boolean") return selector;
        if (typeof selector === "function") return selector(card, index);
        if (Array.isArray(selector)) {
            return selector.includes(card.cardId) || selector.includes(index) || selector.includes(card);
        }
        if (selector instanceof Set) {
            return selector.has(card.cardId) || selector.has(index) || selector.has(card);
        }

        return selector[card.cardId] === true;
    }

    private async applyGrayscale(
        buffers: Buffer[],
        cards: CardLike[],
        selector: GrayscaleCardSelector | undefined
    ): Promise<Buffer[]> {
        if (selector === undefined || selector === false) return buffers;

        return Promise.all(
            buffers.map((buffer, index) => {
                const card = cards[index]!;
                if (!this.shouldGrayscaleCard(selector, card, index)) return buffer;

                return sharp(buffer).grayscale().toBuffer();
            })
        );
    }

    private calculateCanvasSize(
        slots: SlotDimensions[],
        rowLength: number,
        gap: number
    ): { canvasWidth: number; canvasHeight: number } {
        if (!slots.length) return { canvasWidth: 0, canvasHeight: 0 };

        const rows = this.chunkRows(slots, rowLength);

        const canvasWidth = Math.max(
            ...rows.map(row => {
                const widthSum = row.reduce((sum, slot) => sum + (slot.width ?? 0), 0);
                return widthSum + gap * (row.length - 1);
            })
        );

        const rowHeights = rows.map(row => Math.max(...row.map(slot => slot.height ?? 0)));
        const canvasHeight = rowHeights.reduce((sum, h) => sum + h, 0) + gap * (rows.length - 1);

        return { canvasWidth, canvasHeight };
    }

    private getCompositeOperations(
        buffers: Buffer[],
        metadata: sharp.Metadata[],
        rowLength: number,
        gap: number
    ): sharp.OverlayOptions[] {
        if (!metadata.length) return [];

        const rows = this.chunkRows(metadata, rowLength);
        const rowMaxHeights = rows.map(row => Math.max(...row.map(slot => slot.height ?? 0)));

        const compositeOps: sharp.OverlayOptions[] = [];
        let currentY = 0;

        for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
            let currentX = 0;
            const row = rows[rowIdx]!;

            for (let colIdx = 0; colIdx < row.length; colIdx++) {
                const globalIdx = rowIdx * rowLength + colIdx;
                compositeOps.push({
                    input: buffers[globalIdx]!,
                    left: currentX,
                    top: currentY,
                    blend: "over"
                });
                currentX += (row[colIdx]!.width ?? 0) + gap;
            }

            currentY += rowMaxHeights[rowIdx]! + gap;
        }

        return compositeOps;
    }

    async render(options: RenderOptions = {}) {
        const { rowLength = 4, gap = 7, scaleFactor = 0.4, pngOptions, padToFullRow = false, grayscaleCards } = options;
        const { buffers, metadata } = await this.fetchCardImages();

        if (!buffers.length) throw new Error("No cards to render for gallery");

        const cardEntries = Array.from(this.cards.values());
        const compositeBuffers = await this.applyGrayscale(buffers, cardEntries, grayscaleCards);

        const slotDimensions: SlotDimensions[] = metadata.map(m => ({
            width: m.width ?? 0,
            height: m.height ?? 0
        }));

        if (padToFullRow && slotDimensions.length < rowLength) {
            const fillSlot = slotDimensions[0] ?? { width: 0, height: 0 };
            while (slotDimensions.length < rowLength) {
                slotDimensions.push({ ...fillSlot });
            }
        }

        const { canvasWidth, canvasHeight } = this.calculateCanvasSize(slotDimensions, rowLength, gap);

        const canvas = sharp({
            create: {
                width: canvasWidth,
                height: canvasHeight,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            }
        });

        const outputBuffer = await canvas
            .composite(this.getCompositeOperations(compositeBuffers, metadata, rowLength, gap))
            .png({ compressionLevel: 9, quality: 30, ...pngOptions })
            .toBuffer();

        const scaledBuffer = await ImageManager.scaleBuffer(outputBuffer, scaleFactor);

        return ImageManager.createRenderedMediaData(
            sharp(scaledBuffer),
            scaledBuffer,
            { width: canvasWidth, height: canvasHeight },
            "CardGallery.png"
        );
    }
}
