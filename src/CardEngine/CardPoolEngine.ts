import { useBunnyCDN } from "@/MediaTools";
import { CardLike } from "@/types/card.types";
import { IndexConfig, NestedIndexConfig } from "@/types/cardIndex.types";
import { RootFilterQuery, UpdateQuery } from "mongoose";
import { EventEmitter } from "node:events";
import { choice, str, weighted } from "qznt";
import type { MongoSchemaBuilder } from "vimcord";
import { CardIndex, NestedCardIndex } from "./CardIndex";
import { CardPool } from "./CardPool";
import { CardPoolCache } from "./CardPoolCache";

interface DropRateRarity {
    rarity: number;
    oneIn: number;
}

interface DropRateTier {
    type: string | number;
    oneIn: number;
    rarities?: DropRateRarity[];
}

interface DropRateConfig {
    tiers: DropRateTier[];
}

interface CompiledWeightRarity {
    rarity: number;
    oneIn: number;
    compiledWeight: number;
}

interface CompiledWeightTier {
    type: string | number;
    oneIn: number;
    compiledWeight: number;
    rarities?: CompiledWeightRarity[];
}

interface FuzzySearchField<T> {
    name: string;
    getter: (card: T) => string | undefined;
}

interface FuzzySearchConfig<T> {
    fields: FuzzySearchField<T>[];
}

type SortFunction<T> = (a: T, b: T) => number;

export interface CardPoolEngineConfig<T extends CardLike> {
    cardSchema: MongoSchemaBuilder<T>;
    inventoryCardSchema: MongoSchemaBuilder<any>;
    indices: IndexConfig<T, any>[];
    nestedIndices?: NestedIndexConfig<T, any, any>[];
    dropRates: DropRateConfig;
    fuzzySearch: FuzzySearchConfig<T>;
    sortFn: SortFunction<T>;
}

export interface CardPoolEngineEvents<T> {
    initialized: [];
    refreshed: [count: number];
    cardInserted: [card: T];
    cardRemoved: [card: T];
    cardUpdated: [card: T, oldCard: T];
    error: [error: Error];
}

export interface InsertNewCardData<T> {
    namePrefix: string;
    imageUrl: string;
    cdnRoute: string;
    card: Partial<T>;
}

export interface SampleOptions {
    userId?: string;
    excludeCardIds?: string[];
}

export type SampleResult<T> = [cards: T[], failReason?: string];

export interface FuzzySearchResult<T> {
    results: T[];
    formatted: string[];
    nv: Array<{ name: string; value: string }>;
}

export interface FuzzySearchIdentityResult {
    results: Array<{ key: string; cardIds: string[] }>;
    formatted: string[];
    nv: Array<{ name: string; value: string }>;
}

function buildCardFilename(namePrefix: string, imageUrl: string) {
    const imageExt = imageUrl.split("?").shift()?.split(".").pop();
    return `${namePrefix.toUpperCase()}_CARD_${Date.now()}${str(2, "alpha", { casing: "upper" })}.${imageExt}`;
}

function compileWeightPool<T extends CardLike>(dropRates: DropRateConfig): CompiledWeightTier[] {
    const totalRawBaseWeight = dropRates.tiers.reduce((acc, cur) => acc + 1 / cur.oneIn, 0);

    return dropRates.tiers.map(tier => {
        const compiled: CompiledWeightTier = {
            type: tier.type,
            oneIn: tier.oneIn,
            compiledWeight: 1 / tier.oneIn / totalRawBaseWeight
        };

        if (tier.rarities) {
            const totalRawRarityWeight = tier.rarities.reduce((acc, cur) => acc + 1 / cur.oneIn, 0);
            compiled.rarities = tier.rarities.map(r => ({
                rarity: r.rarity,
                oneIn: r.oneIn,
                compiledWeight: 1 / r.oneIn / totalRawRarityWeight
            }));
        }

        return compiled;
    });
}

export class CardPoolEngine<T extends CardLike> extends EventEmitter {
    private cache: CardPoolCache<T>;
    private compiledDropRates: CompiledWeightTier[];
    private initialized = false;

    constructor(private config: CardPoolEngineConfig<T>) {
        super();

        this.cache = new CardPoolCache<T>(config.cardSchema, config.indices, config.nestedIndices);
        this.compiledDropRates = compileWeightPool(config.dropRates);

        this.cache.on("refreshed", count => this.emit("refreshed", count));
        this.cache.on("cardInserted", card => this.emit("cardInserted", card));
        this.cache.on("cardRemoved", card => this.emit("cardRemoved", card));
        this.cache.on("cardUpdated", (card, oldCard) => this.emit("cardUpdated", card, oldCard));
        this.cache.on("error", err => this.emit("error", err));
    }

    get pool(): CardPool<T> {
        return this.cache.cardPool;
    }

    async init(): Promise<this> {
        await this.cache.init();
        this.initialized = true;
        this.emit("initialized");
        return this;
    }

    private async ensureInit(): Promise<void> {
        if (!this.initialized) await this.init();
    }

    /** Fuzzy searches the card pool and returns a list of cards. */
    fuzzySearch(query: string, options?: { limit?: number; released?: boolean }): FuzzySearchResult<T> {
        const pool = this.cache.cardPool;
        const source = options?.released ? pool.allReleased : pool.all;
        const lowerQuery = query.toLowerCase();

        const results: T[] = [];
        for (const card of source.values()) {
            if (results.length >= (options?.limit ?? 25)) break;
            for (const field of this.config.fuzzySearch.fields) {
                const value = field.getter(card)?.toLowerCase();
                if (value?.startsWith(lowerQuery)) {
                    results.push(card);
                    break;
                }
            }
        }

        const sorted = this.sort(results);
        const formatted = sorted.map(card =>
            this.config.fuzzySearch.fields
                .map(f => f.getter(card))
                .filter(Boolean)
                .join(" · ")
        );

        return {
            results: sorted,
            formatted,
            nv: sorted.map((card, idx) => ({ name: formatted[idx]!, value: card.cardId }))
        };
    }

    /** Fuzzy searches the card pool and returns a list of cards by their identity properties. */
    fuzzySearchIdentity(query: string, options?: { limit?: number }): FuzzySearchIdentityResult {
        const pool = this.cache.cardPool;
        const lowerQuery = query.toLowerCase();
        const limit = options?.limit ?? 25;

        const results: Array<{ key: string; cardIds: string[]; nv: { name: string; value: string } }> = [];

        for (const [name, index] of pool.indices) {
            if (results.length >= limit) break;
            for (const [key, cardIds] of index.entries()) {
                if (results.length >= limit) break;
                if (key.toLowerCase().startsWith(lowerQuery)) {
                    results.push({
                        key: String(key),
                        cardIds: Array.from(cardIds),
                        nv: { name: `[${name}] ${key}`, value: `${name}:${key}` }
                    });
                }
            }
        }

        return {
            results: results.map(r => ({ key: r.key, cardIds: r.cardIds })),
            formatted: results.map(r => r.nv.name),
            nv: results.map(r => r.nv)
        };
    }

    /** Gets a card from the card pool. */
    get(cardId: string, released?: boolean): T | undefined {
        const pool = this.cache.cardPool;
        return released ? pool.allReleased.get(cardId) : pool.all.get(cardId);
    }

    getMany(cardIds: string[], released?: boolean): T[] {
        const pool = this.cache.cardPool;
        const results: T[] = [];
        for (const cardId of cardIds) {
            const card = released ? pool.allReleased.get(cardId) : pool.all.get(cardId);
            if (card) results.push(card);
        }
        return this.sort(results);
    }

    /** Samples a number of cards from the card pool. */
    sample(limit: number, options?: SampleOptions): SampleResult<T> {
        const pool = this.cache.cardPool;
        const picked = new Set<string>(options?.excludeCardIds);
        const results: T[] = [];

        for (let i = 0; i < limit; i++) {
            const selectedType = weighted(this.compiledDropRates, t => t.compiledWeight);

            let selectedRarity: number | undefined;
            if (selectedType.rarities) {
                selectedRarity = weighted(selectedType.rarities, r => r.compiledWeight).rarity;
            }

            let candidates: Set<string> | undefined;

            for (const [, nestedIndex] of pool.nestedIndices) {
                if (nestedIndex instanceof NestedCardIndex) {
                    const found = nestedIndex.get(selectedType.type, selectedRarity);
                    if (found.size) {
                        candidates = new Set(found);
                        break;
                    }
                }
            }

            if (!candidates?.size) {
                for (const [, index] of pool.indices) {
                    if (index instanceof CardIndex) {
                        const found = index.get(selectedType.type);
                        if (found.size) {
                            candidates = new Set(found);
                            break;
                        }
                    }
                }
            }

            if (!candidates?.size) candidates = new Set(pool.all.keys());

            const available = Array.from(candidates).filter(id => !picked.has(id));
            if (!available.length) return [[], "Not enough cards were available to drop."];

            const cardId = choice(available);
            picked.add(cardId);
            results.push(pool.all.get(cardId)!);
        }

        return [results];
    }

    /** Samples a number of cards from the card pool and modifies them, then returns the modified cards. */
    async sampleAndModify(limit: number, update: UpdateQuery<T>, options?: SampleOptions): Promise<SampleResult<T>> {
        const [cards, failReason] = this.sample(limit, options);
        if (failReason) return [[], failReason];

        const modifiedCards = await this.modifyMany(
            cards.map(c => c.cardId),
            update
        );
        if (!modifiedCards.length) return [[], "Failed to modify cards."];
        return [modifiedCards];
    }

    /** Sorts a list of cards by an opinionated order. */
    sort(cards: T[]): T[] {
        return [...cards].sort(this.config.sortFn);
    }

    /** Creates a new card in the database and uploads its image to the CDN. */
    async insert(data: InsertNewCardData<T>, stageFns?: [() => any, () => any, () => any]): Promise<T> {
        await this.ensureInit();

        const existing = this.pool.get(data.card.cardId!);
        if (existing) throw new Error(`Card (${data.card.cardId}) already exists`);
        if (!data.imageUrl) throw new Error("Card must have an image URL");

        const bunnyCDN = useBunnyCDN();

        await stageFns?.[0]();
        const imageResult = await bunnyCDN.uploadImageFromUrl(
            data.imageUrl,
            buildCardFilename(data.namePrefix, data.imageUrl),
            data.cdnRoute
        );
        if (!imageResult.success) throw new Error("Failed to upload card image");

        await stageFns?.[1]();
        const [card] = await this.config.cardSchema.create([
            { ...data.card, asset: { imageUrl: imageResult.cdnUrl!, cdn: { filePath: imageResult.path! } } } as any
        ]);
        if (!card) throw new Error("Failed to insert card into database");

        await stageFns?.[2]();
        await this.cache.refreshMany([card.cardId]);

        return card;
    }

    /** Modifies a card in the database. Supports atomic operators e.g. $inc. */
    async modify(cardId: string, update: UpdateQuery<T>): Promise<T | null> {
        await this.ensureInit();

        const oldCard = this.pool.get(cardId);
        if (!oldCard) return null;

        const updated = await this.config.cardSchema.update({ cardId }, update, { returnDocument: "after" });
        if (!updated) return null;

        this.pool.insert(updated);
        this.emit("cardUpdated", updated, oldCard);
        return updated;
    }

    /** Modifies multiple cards in the database. Supports atomic operators e.g. $inc. */
    async modifyMany(cardIds: string[], update: UpdateQuery<T>): Promise<T[]> {
        await this.ensureInit();

        const oldCards = cardIds.map(id => this.pool.get(id));
        if (oldCards.length !== cardIds.length) return [];

        const updateRes = await this.config.cardSchema.updateAll({ cardId: { $in: cardIds } }, update);
        if (updateRes.modifiedCount !== cardIds.length) return [];

        const updated = await this.config.cardSchema.fetchAll({ cardId: { $in: cardIds } });
        if (updated.length !== cardIds.length) return [];

        updated.forEach(card => {
            this.pool.insert(card);
            this.emit(
                "cardUpdated",
                card,
                oldCards.find(c => c?.cardId === card.cardId)
            );
        });

        return updated;
    }

    /** Removes a card from the database and CDN, and clears it from player inventories. */
    async delete(cardId: string): Promise<boolean> {
        await this.ensureInit();

        const existing = this.pool.get(cardId);
        if (!existing) return false;

        try {
            const bunnyCDN = useBunnyCDN();
            await bunnyCDN.delete(existing.asset.cdn.filePath);
            await this.config.cardSchema.delete({ cardId });
            await this.cache.removeMany([cardId]);
            await this.config.inventoryCardSchema.deleteAll({ cardId });
            return true;
        } catch (err) {
            console.error("Failed to delete card", err);
            return false;
        }
    }

    /** Swaps the image of a card in the database. */
    async swapImage(
        cardId: string,
        newImageUrl: string,
        options: { namePrefix: string; cdnRoute: string }
    ): Promise<T | null> {
        await this.ensureInit();

        const oldCard = this.get(cardId);
        if (!oldCard) return null;

        const bunnyCDN = useBunnyCDN();

        const imageResult = await bunnyCDN.uploadImageFromUrl(
            newImageUrl,
            buildCardFilename(options.namePrefix, newImageUrl),
            options.cdnRoute
        );
        if (!imageResult.success) return null;

        await bunnyCDN.delete(oldCard.asset.cdn.filePath);

        const updated = await this.config.cardSchema.update(
            { cardId },
            { "asset.imageUrl": imageResult.cdnUrl!, "asset.cdn.filePath": imageResult.path! },
            { returnDocument: "after" }
        );
        if (!updated) return null;

        this.pool.insert(updated);
        this.emit("cardUpdated", updated, oldCard);
        return updated;
    }

    /** Releases a batch of cards and updates the cache. */
    async release(cardIds: string[]): Promise<T[]> {
        await this.ensureInit();

        const oldCards = this.getMany(cardIds);
        await this.config.cardSchema.updateAll({ cardId: { $in: cardIds } }, { "state.released": true });
        await this.cache.refreshMany(cardIds);

        const updated = this.getMany(cardIds, true);
        for (let i = 0; i < updated.length; i++) {
            this.emit("cardUpdated", updated[i], oldCards[i]);
        }
        return updated;
    }

    async refresh(cardIds?: string[]): Promise<void> {
        if (cardIds) {
            await this.cache.refreshMany(cardIds);
        } else {
            await this.cache.refreshAll();
        }
    }
}

export function createCardPoolEngine<T extends CardLike>(config: CardPoolEngineConfig<T>) {
    const engine = new CardPoolEngine<T>(config);
    let initPromise: Promise<CardPoolEngine<T>> | null = null;

    const useCardEngine = async (): Promise<CardPoolEngine<T>> => {
        if (initPromise) return initPromise;
        initPromise = engine.init();
        return initPromise;
    };

    const useCardPool = async (): Promise<CardPool<T>> => {
        const eng = await useCardEngine();
        return eng.pool;
    };

    return { engine, useCardEngine, useCardPool };
}
