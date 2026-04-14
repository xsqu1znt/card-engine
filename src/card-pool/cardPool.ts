import type { MongoSchemaBuilder } from "vimcord";
import type { CardLike } from "@/types/card.types.js";
import type { CardIndex, NestedCardIndex } from "./cardIndex.js";

import { EventEmitter } from "node:stream";

export interface CardPoolEvents<T extends CardLike> {
    initialized: [];
    cardInserted: [card: T];
    cardRemoved: [card: T];
    cardUpdated: [oldCard: T, newCard: T];
    cacheRefreshed: [cards: T[], scope: "partial" | "full"];
}

export class CardPool<T extends CardLike, K extends string | number = string | number> extends EventEmitter<
    CardPoolEvents<T>
> {
    // --- Indexes ---
    readonly all = new Map<string, T>();
    readonly allReleased = new Map<string, T>();
    readonly indexes = new Map<string, CardIndex<T, K>>();
    readonly nestedIndexes = new Map<string, NestedCardIndex<T, K>>();
    private indexRef: (CardIndex<T, K> | NestedCardIndex<T, K>)[] = [];

    // --- Cache ---
    private initPromise: Promise<this> | null = null;
    private queuePromise = Promise.resolve();

    constructor(
        readonly cardSchema: MongoSchemaBuilder<T>,
        indexes?: CardIndex<T, K>[],
        nestedIndexes?: NestedCardIndex<T, K>[]
    ) {
        super();

        this.indexes = new Map((indexes ?? []).map(index => [index.name, index]));
        this.nestedIndexes = new Map((nestedIndexes ?? []).map(index => [index.name, index]));
        this.indexRef = [...(indexes ?? []), ...(nestedIndexes ?? [])];
    }

    // --- Indexes ---
    insert(cards: (T | null | undefined)[]): T[] {
        const inserted: T[] = [];

        for (const card of cards) {
            if (!card) continue;

            const oldCard = this.all.get(card.cardId);
            if (oldCard) {
                this.all.delete(oldCard.cardId);
                this.allReleased.delete(oldCard.cardId);

                // Remove the card from the rest of the indexes
                for (const index of this.indexRef) index.remove(oldCard);
            }

            this.all.set(card.cardId, card);
            if (card.state.released) this.allReleased.set(card.cardId, card);

            // Add the card to the rest of the indexes
            for (const index of this.indexRef) index.insert(card);

            if (oldCard) {
                this.emit("cardUpdated", oldCard, card);
            } else {
                this.emit("cardInserted", card);
            }

            inserted.push(card);
        }

        return inserted;
    }

    remove(cards: (T | null | undefined)[]): void {
        for (const card of cards) {
            if (!card) continue;

            this.all.delete(card.cardId);
            this.allReleased.delete(card.cardId);

            // Remove the card from the rest of the indexes
            for (const index of this.indexRef) index.remove(card);
            this.emit("cardRemoved", card);
        }
    }

    async get(cardId: string, released?: boolean): Promise<T | undefined> {
        await this.initCache();
        return released ? this.allReleased.get(cardId) : this.all.get(cardId);
    }

    async getMany(cardIds: string[], released?: boolean): Promise<(T | undefined)[]> {
        await this.initCache();
        return cardIds.map(id => (released ? this.allReleased.get(id) : this.all.get(id)));
    }

    async has(cardId: string, released?: boolean): Promise<boolean> {
        await this.initCache();
        return released ? this.allReleased.has(cardId) : this.all.has(cardId);
    }

    async hasAll(cardIds: string[], released?: boolean): Promise<boolean> {
        await this.initCache();
        return cardIds.every(id => (released ? this.allReleased.has(id) : this.all.has(id)));
    }

    clear(): void {
        this.all.clear();
        this.allReleased.clear();

        // Clear the rest of the indexes
        for (const index of this.indexRef) {
            index.clear();
        }
    }

    async getIndex(name: string): Promise<CardIndex<T, K> | undefined> {
        await this.initCache();
        return this.indexes.get(name);
    }

    async getNestedIndex(name: string): Promise<NestedCardIndex<T, K> | undefined> {
        await this.initCache();
        return this.nestedIndexes.get(name);
    }

    // --- Cache ---
    private async initCache(): Promise<this> {
        if (this.initPromise) return this.initPromise;

        const fn = async () => {
            try {
                this.clear();
                this.indexRef = [];
                const cards = await this.cardSchema.fetchAll();
                this.insert(cards);
                this.emit("cacheRefreshed", cards, "full");
                this.emit("initialized");
                return this;
            } catch (err) {
                this.initPromise = null;
                console.error("[CardPool] Error initializing cache", err instanceof Error ? err.message : err);
                return this;
            }
        };

        this.initPromise = fn();
        return await this.initPromise;
    }

    private enqueue(fn: () => Promise<void>): Promise<void> {
        this.queuePromise = this.queuePromise
            .then(() => fn())
            .catch(err => console.error("[CardPool] Error refreshing cache", err instanceof Error ? err.message : err));

        return this.queuePromise;
    }

    async refresh(cardIds?: string[]): Promise<void> {
        await this.initCache();

        await this.enqueue(async () => {
            if (!cardIds?.length) this.clear();

            const cards = cardIds?.length
                ? await this.cardSchema.fetchAll({ cardId: { $in: cardIds } })
                : await this.cardSchema.fetchAll();

            this.insert(cards);
            this.emit("cacheRefreshed", cards, cardIds?.length ? "partial" : "full");
        });
    }
}
