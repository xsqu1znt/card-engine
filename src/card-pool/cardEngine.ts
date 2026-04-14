import type { UpdateQuery } from "mongoose";
import type { MongoSchemaBuilder } from "vimcord";
import type { CardLike, InventoryCardLike } from "@/types/card.types.js";
import type { CardIndex, NestedCardIndex } from "./cardIndex.js";
import type { CardPoolEvents } from "./cardPool.js";

import { EventEmitter } from "node:stream";
import { $ } from "qznt";
import { useBunnyCDN } from "@/media/index.js";
import { CardPool } from "./cardPool.js";

interface SearchField<T extends CardLike> {
    name: string;
    getKey(card: T): string | number | undefined;
    /** Transforms the incoming search query before checking for matches. */
    transformer?(query: string): string;
}

// --- Card Sampling ---
interface SampleRateRarity {
    rarity: number;
    oneIn: number;
}

interface SampleRateTier<K extends string | number = string | number> {
    type: K;
    oneIn: number;
    rarities?: SampleRateRarity[];
}

interface CompiledWeightRarity {
    rarity: number;
    oneIn: number;
    compiledWeight: number;
}

interface CompiledWeightTier<K extends string | number = string | number> {
    type: K;
    oneIn: number;
    compiledWeight: number;
    rarities?: CompiledWeightRarity[];
}

// --- Engine ---
export interface CardEngineEvents<T extends CardLike> extends CardPoolEvents<T> {}

export interface CardEngineConfig<
    T1 extends CardLike,
    T2 extends InventoryCardLike,
    K extends string | number = string | number
> {
    schemas: {
        card: MongoSchemaBuilder<T1>;
        inventory: MongoSchemaBuilder<T2>;
    };

    indexes?: CardIndex<T1, K>[];
    nestedIndexes?: NestedCardIndex<T1, K>[];

    cardSampleIndex: CardIndex<T1, K>;
    cardSampleNestedIndex: NestedCardIndex<T1, K>;
    cardSampleRates: SampleRateTier<K>[];

    searchFields?: SearchField<T1>[];
    sortFn(a: T1, b: T1): number;
}

interface SearchOptions<T extends CardLike> {
    /** @default 25 */
    limit?: number;
    /** @default true */
    released?: boolean;
    /** Must match the names given in the `CardEngine.searchFields` config. */
    excludeSearchFields?: string[];
    /** Exclude cards based on a predicate. */
    exclude?(card: T): boolean;
}

interface SearchByIndexOptions<T extends CardLike> {
    /** @default 25 */
    limit?: number;
    /** @default true */
    released?: boolean;
    /** Exclude cards based on a predicate. */
    exclude?(card: T): boolean;
}

interface IndexedSearchResult {
    /** Example: "aespa" or "Jaemin" */
    matchedKey: string;
    /** Example: "byName" */
    indexName: string;
    /** Combined: `${matchedKey}-${indexType}` */
    identity: string;
    /** Resulting card IDs. */
    cardIds: string[];
}

interface SampleOptions {
    /** Card IDs to exclude from sample results. */
    excludeCards?: string[];
}

export interface CardInsertData<T> {
    prefix: string;
    imageUrl: string;
    cdnRoute: string;
    card: Partial<T>;
}

export class CardEngine<
    T1 extends CardLike,
    T2 extends InventoryCardLike,
    K extends string | number = string | number
> extends EventEmitter<CardEngineEvents<T1>> {
    readonly pool: CardPool<T1, K>;
    private readonly compiledSampleRates: CompiledWeightTier<K>[];

    constructor(private readonly config: CardEngineConfig<T1, T2, K>) {
        super();

        this.pool = new CardPool(config.schemas.card, config.indexes, config.nestedIndexes);
        this.compiledSampleRates = compileWeightPool(config.cardSampleRates);

        this.pool.on("initialized", () => this.emit("initialized"));
        this.pool.on("cardInserted", card => this.emit("cardInserted", card));
        this.pool.on("cardRemoved", card => this.emit("cardRemoved", card));
        this.pool.on("cardUpdated", (oldCard, newCard) => this.emit("cardUpdated", oldCard, newCard));
        this.pool.on("cacheRefreshed", (cards, scope) => this.emit("cacheRefreshed", cards, scope));
    }

    // --- Pool Utils ---
    /** Gets a card from the pool. */
    async get(cardId: string, released?: boolean): Promise<T1 | undefined> {
        return await this.pool.get(cardId, released);
    }

    /** Gets many cards from the pool and sorts them. */
    async getMany(cardIds: string[], released?: boolean): Promise<T1[]> {
        const results = await this.pool.getMany(cardIds, released);
        return this.sort(results.filter((c): c is T1 => !!c));
    }

    /** Checks if a card is in the pool. */
    async has(cardId: string, released?: boolean): Promise<boolean> {
        return await this.pool.has(cardId, released);
    }

    /** Checks if all cards are in the pool. */
    async hasAll(cardIds: string[], released?: boolean): Promise<boolean> {
        return await this.pool.hasAll(cardIds, released);
    }

    /** Refreshes the card pool. */
    async refresh(cardIds?: string[]): Promise<void> {
        return await this.pool.refresh(cardIds);
    }

    // --- Card Utils ---
    /** Sorts an array of cards. Non-destructive. */
    sort(cards: T1[]): T1[] {
        return structuredClone(cards).sort(this.config.sortFn);
    }

    // --- CRUD ---
    /** Fuzzy searches the card pool using the configured search fields and sorts the results. Case-insensitive. */
    search(query: string, options: SearchOptions<T1> = {}): T1[] {
        const { limit = 25, released = true, excludeSearchFields = [], exclude } = options;
        query = query.toLowerCase();

        const source = Array.from((released ? this.pool.allReleased : this.pool.all).values()).filter(
            card => !exclude?.(card)
        );
        if (!source.length) {
            // Only log a warning if no cards are excluded, because it could be intentional
            if (!exclude) console.warn(`[CardEngine] Search failed for '${query}'; the card pool is empty`);
            return [];
        }

        const searchFields = Object.entries(this.config.searchFields ?? [])
            .filter(([name]) => !excludeSearchFields.length || !excludeSearchFields.includes(name))
            .map(([, getter]) => getter);
        if (!searchFields.length) {
            console.warn(`[CardEngine] Search failed for '${query}'; no search fields are configured`);
            return [];
        }

        const results: T1[] = [];
        for (const card of source) {
            if (results.length >= limit) break;

            // Iterate through each search field getter and check for matches
            for (const field of searchFields) {
                const matchedKey = field.getKey(card);
                if (matchedKey === undefined) continue;

                // Check if the search query is a substring of the match
                if (typeof matchedKey === "string" && matchedKey.toLowerCase().includes(query)) {
                    results.push(card);
                    break;
                }

                if (field.transformer) {
                    const transformed = field.transformer(query);

                    // Check if the transformed search query is a number match
                    if (typeof matchedKey === "number" && matchedKey.toString() === query) {
                        results.push(card);
                        break;
                    }
                    // Check if the transformed search query is a boolean match
                    else if (typeof matchedKey === "boolean" && matchedKey === transformed) {
                        results.push(card);
                        break;
                    }
                }
            }
        }

        return this.sort(results);
    }

    /** Fuzzy searches the card pool by the configured indexes. Does not query nested indexes. Case-insensitive. */
    searchByIndex(query: string, options: SearchByIndexOptions<T1> = {}): IndexedSearchResult[] {
        const { limit = 25, released = true, exclude } = options;
        query = query.toLowerCase();

        const source = Array.from((released ? this.pool.allReleased : this.pool.all).values()).filter(
            card => !exclude?.(card)
        );
        if (!source.length) {
            // Only log a warning if no cards are excluded, because it could be intentional
            if (!exclude) console.warn(`[CardEngine] Search failed for '${query}'; the card pool is empty`);
            return [];
        }

        const results: IndexedSearchResult[] = [];
        for (const index of this.pool.indexes.values()) {
            if (results.length >= limit) break;

            for (const [indexKey, cardIdSet] of index.entries()) {
                if (typeof indexKey !== "string") continue;

                // Check if the search query is a substring of the index key
                if (indexKey.toLowerCase().startsWith(query)) {
                    results.push({
                        matchedKey: indexKey,
                        indexName: index.name,
                        identity: `${index.name}-${indexKey}`,
                        cardIds: Array.from(cardIdSet)
                    });
                }
            }
        }

        return results;
    }

    /** Samples a number of cards from the card pool. */
    async sample(limit: number, options: SampleOptions = {}): Promise<T1[]> {
        const { excludeCards = [] } = options;
        const picked = new Set(excludeCards);
        const results: T1[] = [];

        for (let i = 0; i < limit; i++) {
            const selectedType = $.rnd.weighted(this.compiledSampleRates, t => t.compiledWeight);

            let selectedRarity: K | undefined;
            if (selectedType.rarities) {
                selectedRarity = $.rnd.weighted(selectedType.rarities, r => r.compiledWeight).rarity as K;
            }

            let candidates: Set<string> | undefined;
            if (selectedRarity !== undefined) {
                candidates = new Set(this.config.cardSampleNestedIndex.get(selectedType.type, selectedRarity));
                if (!candidates?.size) {
                    console.warn(
                        `[CardEngine] Sample failed; no cards found for type '${selectedType.type}' and rarity '${selectedRarity}'`
                    );
                }
            } else {
                candidates = new Set(this.config.cardSampleIndex.get(selectedType.type));
                if (!candidates?.size) {
                    console.warn(`[CardEngine] Sample failed; no cards found for type '${selectedType.type}'`);
                }
            }

            const availableCandidates = Array.from(candidates).filter(id => !picked.has(id));
            if (!availableCandidates.length) {
                console.warn("[CardEngine] Sample failed; not enough cards available");
                return [];
            }

            const cardId = $.rnd.choice(availableCandidates);
            picked.add(cardId);
            results.push((await this.pool.get(cardId))!);
        }

        return results;
    }

    /** Samples a number of cards from the card pool and updates them, returning the modified cards. */
    async sampleAndUpdate(limit: number, update: UpdateQuery<T1>, options?: SampleOptions): Promise<T1[]> {
        const cards = await this.sample(limit, options);
        return await this.update(
            cards.map(c => c.cardId),
            update
        );
    }

    /** Creates a new card in the database and uploads its image to the CDN. */
    async insert(data: CardInsertData<T1>, stageFns?: [() => any, () => any, () => any]): Promise<T1> {
        const existing = await this.pool.get(data.card.cardId!);
        if (existing) throw new Error(`[CardEngine] Card '${data.card.cardId}' already exists`);
        if (!data.imageUrl) throw new Error(`[CardEngine] Card '${data.card.cardId}' must have an image URL`);

        const bunnyCDN = useBunnyCDN();

        await stageFns?.[0]();
        const imageResult = await bunnyCDN.uploadImageFromUrl(
            data.imageUrl,
            buildCardFilename(data.prefix, data.imageUrl),
            data.cdnRoute
        );
        if (!imageResult.success) throw new Error("Failed to upload card image");

        await stageFns?.[1]();
        const [card] = await this.config.schemas.card.create([
            { ...data.card, asset: { imageUrl: imageResult.cdnUrl!, cdn: { filePath: imageResult.path! } } } as any
        ]);
        if (!card) throw new Error("Failed to insert card into database");

        await stageFns?.[2]();
        await this.pool.refresh([card.cardId]);
        return card;
    }

    /** Removes a card from the database and CDN, and clears it from player inventories. */
    async remove(cardIds: string[]): Promise<void> {
        await Promise.all(
            cardIds.map(async cardId => {
                const existing = await this.pool.get(cardId);
                if (!existing) return false;

                try {
                    const bunnyCDN = useBunnyCDN();
                    await bunnyCDN.delete(existing.asset.cdn.filePath);
                    await this.config.schemas.card.delete({ cardId });
                    this.pool.remove([existing]);
                    await this.config.schemas.inventory.deleteAll({ cardId });
                } catch (err) {
                    console.warn(`[CardEngine] Failed to delete card '${cardId}'`, err);
                }
            })
        );
    }

    /** Updates multiple cards in the database. Supports atomic operators e.g. $inc. */
    async update(cardIds: string[], update: UpdateQuery<T1>): Promise<T1[]> {
        const updateRes = await this.config.schemas.card.updateAll({ cardId: { $in: cardIds } }, update);
        if (updateRes.modifiedCount !== cardIds.length) {
            console.warn(
                `[CardEngine] Issue updating: out of '${cardIds.join(", ")}' only ${updateRes.modifiedCount} updated`
            );
        }

        const updated = await this.config.schemas.card.fetchAll({ cardId: { $in: cardIds } });
        if (updated.length !== cardIds.length) {
            console.warn(`[CardEngine] Issue updating: out of '${cardIds.join(", ")}' only ${updated.length} were found`);
        }

        return this.pool.insert(updated);
    }

    /** Swaps the image of a card in the database. */
    async swapImage(cardId: string, newImageUrl: string, options: { prefix: string; cdnRoute: string }): Promise<T1 | null> {
        const oldCard = await this.get(cardId);
        if (!oldCard) return null;

        const bunnyCDN = useBunnyCDN();

        const imageResult = await bunnyCDN.uploadImageFromUrl(
            newImageUrl,
            buildCardFilename(options.prefix, newImageUrl),
            options.cdnRoute
        );
        if (!imageResult.success) return null;

        await bunnyCDN.delete(oldCard.asset.cdn.filePath);

        const updated = await this.config.schemas.card.update(
            { cardId },
            { "asset.imageUrl": imageResult.cdnUrl!, "asset.cdn.filePath": imageResult.path! },
            { returnDocument: "after" }
        );
        if (!updated) return null;

        this.pool.insert([updated]);
        return updated;
    }

    /** Releases a batch of cards and updates the cache. */
    async release(cardIds: string[]): Promise<T1[]> {
        await this.config.schemas.card.updateAll({ cardId: { $in: cardIds } }, { "state.released": true });
        await this.pool.refresh(cardIds);
        return await this.getMany(cardIds, true);
    }
}

function buildCardFilename(prefix: string, imageUrl: string) {
    const fileExt = imageUrl.split("?").shift()?.split(".").pop();
    return `${prefix.toUpperCase()}_CARD_${Date.now()}${$.rnd.str(2, "alpha", { casing: "upper" })}.${fileExt}`;
}

function compileWeightPool<K extends string | number = string | number>(
    sampleRates: SampleRateTier<K>[]
): CompiledWeightTier<K>[] {
    const totalRawBaseWeight = sampleRates.reduce((acc, cur) => acc + 1 / cur.oneIn, 0);

    return sampleRates.map(tier => {
        const compiled: CompiledWeightTier<K> = {
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

export function createSearchField<T extends CardLike>(
    name: string,
    getKey: (card: T) => string | number | undefined,
    /** Transforms the incoming search query before checking for matches. */
    transformer?: (query: string) => string
): SearchField<T> {
    return { name, getKey, transformer };
}
