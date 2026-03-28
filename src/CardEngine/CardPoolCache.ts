import { CardLike } from "@/types/card.types";
import { IndexConfig, NestedIndexConfig } from "@/types/cardIndex.types";
import { EventEmitter } from "node:events";
import type { MongoSchemaBuilder } from "vimcord";
import { CardPool } from "./CardPool";

export class CardPoolCache<T extends CardLike> extends EventEmitter {
    private pool: CardPool<T> | null = null;
    private initPromise: Promise<void> | null = null;
    private refreshQueue = Promise.resolve();
    private version = 0;

    constructor(
        private readonly cardSchema: MongoSchemaBuilder<T>,
        private readonly indexConfigs: IndexConfig<T, any>[],
        private readonly nestedIndexConfigs?: NestedIndexConfig<T, any, any>[]
    ) {
        super();
    }

    get cardPool(): CardPool<T> {
        if (!this.pool) throw new Error("Card pool not initialized");
        return this.pool;
    }

    async init(): Promise<this> {
        if (this.pool) return this;

        if (!this.initPromise) {
            this.initPromise = this.refreshAll().catch(err => {
                this.initPromise = null;
                throw err;
            });
        }

        await this.initPromise;
        return this;
    }

    private enqueue(fn: () => Promise<void>): Promise<void> {
        this.refreshQueue = this.refreshQueue
            .then(() => {
                this.initPromise ?? Promise.resolve();
            })
            .then(() => fn())
            .catch(err => {
                this.emit("error", err instanceof Error ? err : new Error(String(err)));
                throw err;
            });
        return this.refreshQueue;
    }

    private async fetchAndReplacePool(): Promise<void> {
        const myVersion = ++this.version;
        const cards = await this.cardSchema.fetchAll();

        if (myVersion !== this.version) return;

        const pool = new CardPool<T>(this.indexConfigs, this.nestedIndexConfigs);
        for (const card of cards) pool.insert(card);

        this.pool = pool;
        this.emit("refreshed", cards.length);
    }

    async refreshAll(): Promise<void> {
        await this.enqueue(() => this.fetchAndReplacePool());
    }

    async refreshMany(cardIds: string[]): Promise<void> {
        await this.enqueue(async () => {
            if (!this.pool) return this.fetchAndReplacePool();

            const cards = await this.cardSchema.fetchAll({ cardId: { $in: cardIds } });
            for (const card of cards) {
                const oldCard = this.pool.get(card.cardId);
                this.pool.insert(card);
                if (oldCard) {
                    this.emit("cardUpdated", card, oldCard);
                } else {
                    this.emit("cardInserted", card);
                }
            }
        });
    }

    async removeMany(cardIds: string[]): Promise<void> {
        await this.enqueue(async () => {
            if (!this.pool) return this.fetchAndReplacePool();

            for (const cardId of cardIds) {
                const existing = this.pool.get(cardId);
                if (existing) {
                    this.pool.remove(existing);
                    this.emit("cardRemoved", existing);
                }
            }
        });
    }
}
