import sharp from "sharp";
import ImageManager from "../utils/ImageUtils";
import { CardLike } from "@/types/card.types";

export class CardGalleryRenderer {
    cards = new Map<string, CardLike>();
    cardBuffers = new Map<string, Buffer>();
    cardMetadata = new Map<string, sharp.Metadata>();

    private async fetchCardImages() {
        await Promise.all(
            Array.from(this.cards.values()).map(async card => {
                if (this.cardBuffers.has(card.cardId)) {
                    // Check if it has metadata
                    if (!this.cardMetadata.has(card.cardId)) {
                        const metadata = await sharp(this.cardBuffers.get(card.cardId)).metadata();
                        if (metadata) this.cardMetadata.set(card.cardId, metadata);
                    }
                    return;
                }

                let { buffer, metadata } = await ImageManager.fetch(card.asset.imageUrl, true);
                if (!buffer || !metadata) throw new Error(`Failed to fetch card image: '${card.asset.imageUrl}'`);

                this.cardBuffers.set(card.cardId, buffer);
                this.cardMetadata.set(card.cardId, metadata);
            })
        );

        /* Return the buffers in the same order as the cards */
        const cardEntries = Array.from(this.cards.values());
        return {
            buffers: cardEntries.map(c => this.cardBuffers.get(c.cardId)!),
            metadata: cardEntries.map(c => this.cardMetadata.get(c.cardId)!)
        };
    }

    private calculateCanvasSize(
        metadata: sharp.Metadata[],
        rowLength: number,
        gap: number
    ): { canvasWidth: number; canvasHeight: number } {
        if (metadata.length === 0) {
            return { canvasWidth: 0, canvasHeight: 0 };
        }

        /* Calculate canvas width */
        let maxRowWidth = 0;

        // Iterate through the metadata in chunks of rowLength to define each row
        for (let i = 0; i < metadata.length; i += rowLength) {
            const row = metadata.slice(i, i + rowLength);

            // Sum the widths of cards in the current row
            const cardWidthsSum = row.reduce((sum, card) => sum + card.width, 0);

            // Number of cards in the current row
            const currentCardCount = row.length;

            // Calculate the total gap space for this row
            const rowGapSpace = currentCardCount > 0 ? gap * (currentCardCount - 1) : 0;

            const currentRowWidth = cardWidthsSum + rowGapSpace;

            // Keep track of the maximum row width found so far
            maxRowWidth = Math.max(maxRowWidth, currentRowWidth);
        }

        /* Calculate canvas height */
        const rowHeights: number[] = [];

        // Iterate through the metadata again, chunking into rows
        for (let i = 0; i < metadata.length; i += rowLength) {
            const row = metadata.slice(i, i + rowLength);

            // The height of a row is determined by the TALLest card in that row.
            const rowMaxHeight = row.reduce((maxH, card) => Math.max(maxH, card.height), 0);
            rowHeights.push(rowMaxHeight);
        }

        // Sum the maximum heights of all rows
        const totalRowHeight = rowHeights.reduce((sum, height) => sum + height, 0);

        // Number of gaps is one less than the number of rows.
        const numberOfRows = rowHeights.length;
        const totalGapHeight = numberOfRows > 0 ? gap * (numberOfRows - 1) : 0;

        return { canvasWidth: maxRowWidth, canvasHeight: totalRowHeight + totalGapHeight };
    }

    private getCompositeOperations(
        buffers: Buffer[],
        metadata: sharp.Metadata[],
        rowLength: number,
        gap: number
    ): sharp.OverlayOptions[] {
        if (metadata.length === 0) {
            return [];
        }

        const compositeOps: sharp.OverlayOptions[] = [];

        let currentX = 0;
        let currentY = 0;

        // --- 1. Pre-calculate the max height for each row ---
        // This is required to determine the Y-advance correctly for the next row.
        const rowMaxHeights: number[] = [];
        for (let i = 0; i < metadata.length; i += rowLength) {
            const row = metadata.slice(i, i + rowLength);

            // Find the tallest card in the row (using ?? 0 for safety)
            const rowMaxHeight = row.reduce((maxH, card) => Math.max(maxH, card.height ?? 0), 0);
            rowMaxHeights.push(rowMaxHeight);
        }

        let rowIndex = 0;

        // --- 2. Iterate and Position Cards ---
        for (let i = 0; i < metadata.length; i++) {
            const columnIndex = i % rowLength;

            // 2a. Check for New Row Start (Column 0)
            if (columnIndex === 0 && i !== 0) {
                rowIndex++; // Move to the next row index

                // New row: Advance currentY by the max height of the PREVIOUS row + gap
                const previousRowMaxHeight = rowMaxHeights[rowIndex - 1]!;
                currentY += previousRowMaxHeight + gap;

                // Reset horizontal position for the new row
                currentX = 0;
            }

            // 2b. Calculate Horizontal Position (currentX)
            // If it's not the first card in the row, we need to advance X
            if (columnIndex !== 0) {
                // Advance currentX by the width of the PREVIOUS card + gap
                const previousMetadata = metadata[i - 1];
                currentX += (previousMetadata?.width ?? 0) + gap; // Use ?? 0 for safety
            }

            // 2c. Add to Composite Operations
            // Top Alignment: The card's top edge is set directly to currentY (the row boundary).
            compositeOps.push({ input: buffers[i], left: currentX, top: currentY, blend: "over" });
        }

        return compositeOps;
    }

    constructor(options?: { cards: CardLike[] }) {
        if (options?.cards.length) this.addCards(...options.cards);
    }

    addCards(...cards: CardLike[] | { card: CardLike; buffer: Buffer; metadata?: sharp.Metadata }[]): this {
        for (const card of cards) {
            if ("buffer" in card) {
                this.cardBuffers.set(card.card.cardId, card.buffer);
                if (card.metadata) this.cardMetadata.set(card.card.cardId, card.metadata);
            } else {
                this.cards.set(card.cardId, card);
            }
        }

        return this;
    }

    async render(options: { rowLength?: number; gap?: number; scaleFactor?: number; pngOptions?: sharp.PngOptions } = {}) {
        const { rowLength = 4, gap = 7, scaleFactor = 0.4, pngOptions } = options;
        const { buffers, metadata } = await this.fetchCardImages();

        if (!buffers.length) throw new Error("No cards to render for gallery");

        /* Create a blank canvas */
        const { canvasWidth, canvasHeight } = this.calculateCanvasSize(metadata, rowLength, gap);

        const canvas = sharp({
            create: {
                width: canvasWidth,
                height: canvasHeight,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            }
        });

        canvas
            // Composite the cards
            .composite(this.getCompositeOperations(buffers, metadata, rowLength, gap));

        return ImageManager.createRenderedMediaData(
            canvas,
            await ImageManager.scaleBuffer(
                await canvas.png({ compressionLevel: 9, quality: 30, ...pngOptions }).toBuffer(),
                scaleFactor
            ),
            { width: canvasWidth, height: canvasHeight },
            "CardGallery.png"
        );
    }

    async renderWithGaps(
        options: {
            rowLength?: number;
            gap?: number;
            scaleFactor?: number;
            pngOptions?: sharp.PngOptions;
        } = {}
    ) {
        const { rowLength = 4, gap = 7, scaleFactor = 0.4, pngOptions } = options;

        const { buffers, metadata } = await this.fetchCardImages();

        if (!buffers.length) throw new Error("No cards to render for gallery");

        // Force at least one full row
        const slotCount = Math.max(buffers.length, rowLength);

        // Pad metadata so layout calculations include empty slots
        const paddedMetadata = [...metadata];

        while (paddedMetadata.length < slotCount) {
            paddedMetadata.push({
                width: metadata[0]?.width,
                height: metadata[0]?.height,
                __empty: true // marker flag
            } as any);
        }

        // Calculate canvas size using padded layout
        const { canvasWidth, canvasHeight } = this.calculateCanvasSize(paddedMetadata, rowLength, gap);

        const canvas = sharp({
            create: {
                width: canvasWidth,
                height: canvasHeight,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            }
        });

        // Only composite real cards
        const compositeOps = this.getCompositeOperations(buffers, metadata, rowLength, gap);

        canvas.composite(compositeOps);

        return ImageManager.createRenderedMediaData(
            canvas,
            await ImageManager.scaleBuffer(
                await canvas.png({ compressionLevel: 9, quality: 30, ...pngOptions }).toBuffer(),
                scaleFactor
            ),
            { width: canvasWidth, height: canvasHeight },
            "CardGallery.png"
        );
    }
}
