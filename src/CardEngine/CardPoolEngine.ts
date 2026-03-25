import { useBunnyCDN } from "@/MediaTools";
import { CardLike } from "@/types/card.types";
import type {
    CardPoolEngineConfig,
    CompiledWeightRarity,
    CompiledWeightTier,
    FuzzySearchIdentityResult,
    FuzzySearchResult,
    SampleOptions,
    SampleResult
} from "@/types/CardEngine.types";
import { EventEmitter } from "node:events";
import { choice, merge, str, weighted } from "qznt";
import { CardIndex, NestedCardIndex } from "./CardIndex";
import { CardPool } from "./CardPool";
import { CardPoolCache } from "./CardPoolCache";

function buildCardFilename(namePrefix: string, imageUrl: string) {
    const imageExt = imageUrl.split("?").shift()?.split(".").pop();
    return `${namePrefix.toUpperCase()}_CARD_${Date.now()}${str(2, "alpha", { casing: "upper" })}.${imageExt}`;
}

function compileWeightPool<T extends CardLike>(dropRates: CardPoolEngineConfig<T>["dropRates"]): CompiledWeightTier[] {
    const result: CompiledWeightTier[] = [];
    const totalRawBaseWeight = dropRates.tiers.reduce((acc, cur) => acc + 1 / cur.oneIn, 0);

    for (const tier of dropRates.tiers) {
        const compiled: CompiledWeightTier = {
            type: tier.type,
            oneIn: tier.oneIn,
            compiledWeight: 1 / tier.oneIn / totalRawBaseWeight
        };

        if (tier.rarities) {
            compiled.rarities = [];
            const totalRawRarityWeight = tier.rarities.reduce((acc, cur) => acc + 1 / cur.oneIn, 0);

            for (const rarity of tier.rarities) {
                const compiledRarity: CompiledWeightRarity = {
                    rarity: rarity.rarity,
                    oneIn: rarity.oneIn,
                    compiledWeight: 1 / rarity.oneIn / totalRawRarityWeight
                };
                compiled.rarities.push(compiledRarity);
            }
        }

        result.push(compiled);
    }

    return result;
}

export class CardPoolEngine<T extends CardLike> extends EventEmitter {
    private cache: CardPoolCache<T>;
    private compiledDropRates: CompiledWeightTier[];

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
        this.emit("initialized");
        return this;
    }

    fuzzySearch(query: string, options?: { limit?: number; released?: boolean }): FuzzySearchResult<T> {
        const pool = this.cache.cardPool;
        const source = options?.released ? pool.allReleased : pool.all;
        const lowerQuery = query.toLowerCase();

        const results: T[] = [];
        for (const card of source.values()) {
            if (results.length >= (options?.limit ?? 25)) break;

            for (const field of this.config.fuzzySearch.fields) {
                const value = field.getter(card)?.toLowerCase();
                if (value && value.startsWith(lowerQuery)) {
                    results.push(card);
                    break;
                }
            }
        }

        const sorted = this.sort(results);

        const formatted = sorted.map(card => {
            const parts = this.config.fuzzySearch.fields.map(f => f.getter(card)).filter(Boolean);
            return parts.join(" · ");
        });

        return {
            results: sorted,
            formatted,
            nv: sorted.map((card, idx) => ({
                name: formatted[idx]!,
                value: card.cardId
            }))
        };
    }

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
                        nv: {
                            name: `[${name}] ${key}`,
                            value: `${name}:${key}`
                        }
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

    sample(limit: number, options?: SampleOptions): SampleResult<T> {
        const pool = this.cache.cardPool;
        const picked = new Set<string>(options?.excludeCardIds);
        const results: T[] = [];

        for (let i = 0; i < limit; i++) {
            const selectedType = weighted(this.compiledDropRates, t => t.compiledWeight);

            let selectedRarity: number | undefined;
            if (selectedType.rarities) {
                const rarityObj = weighted(selectedType.rarities, r => r.compiledWeight);
                selectedRarity = rarityObj.rarity;
            }

            let candidates: Set<string> | undefined;

            for (const [name, nestedIndex] of pool.nestedIndices) {
                if (nestedIndex instanceof NestedCardIndex) {
                    const nestedCandidates = nestedIndex.get(selectedType.type, selectedRarity);
                    if (nestedCandidates?.size) {
                        candidates = new Set(nestedCandidates);
                        break;
                    }
                }
            }

            if (!candidates?.size) {
                for (const [name, index] of pool.indices) {
                    if (index instanceof CardIndex) {
                        const typeCandidates = index.get(selectedType.type);
                        if (typeCandidates?.size) {
                            candidates = new Set(typeCandidates);
                            break;
                        }
                    }
                }
            }

            if (!candidates?.size) {
                candidates = new Set(pool.all.keys());
            }

            const available = Array.from(candidates).filter(id => !picked.has(id));

            if (!available.length) {
                return { cards: [], failReason: "Not enough cards were available to drop." };
            }

            const cardId = choice(available);
            picked.add(cardId);
            results.push(pool.all.get(cardId)!);
        }

        return { cards: results };
    }

    sort(cards: T[]): T[] {
        return [...cards].sort(this.config.sortFn);
    }

    async insert(
        data: { namePrefix: string; imageUrl: string; cdnRoute: string; card: Partial<T> },
        stageFns?: [() => any, () => any, () => any]
    ): Promise<T> {
        const existing = this.pool?.get(data.card.cardId!);
        if (existing) throw new Error(`Card (${data.card.cardId}) already exists`);
        if (!data.imageUrl) throw new Error("Card must have an image URL");

        const bunnyCDN = useBunnyCDN();

        // --- Upload New Image ---
        await stageFns?.[0]();
        const imageResult = await bunnyCDN.uploadImageFromUrl(
            data.imageUrl,
            buildCardFilename(data.namePrefix, data.imageUrl),
            data.cdnRoute
        );
        if (!imageResult.success) throw new Error("Failed to upload card image");

        // --- Create Card ---
        await stageFns?.[1]();
        const [card] = await this.config.cardSchema.create([data]);
        if (!card) throw new Error("Failed to insert card into database");

        // --- Refresh Cache ---
        await stageFns?.[2]();
        await this.cache.refreshMany([card.cardId]);

        return card;
    }

    async update(cardId: string, update: Partial<T>): Promise<T | null> {
        if (!this.pool) await this.init();

        const oldCard = this.pool!.get(cardId);
        if (!oldCard) throw new Error(`${cardId} is not an existing card ID`);

        const merged = merge({}, oldCard, update);
        const updated = await this.config.cardSchema.update({ cardId }, merged, { returnDocument: "after" });
        if (!updated) throw new Error(`Failed to update card (${cardId}) in the database`);

        await this.cache.refreshMany([cardId]);
        return updated;
    }

    async delete(cardId: string): Promise<boolean> {
        const existing = this.pool?.get(cardId);
        if (!existing) return false;

        try {
            const bunnyCDN = useBunnyCDN();
            await bunnyCDN.delete(existing.asset.cdn.filePath);
            await this.config.cardSchema.delete({ cardId });
            await this.cache.removeMany([cardId]);
            await this.config.inventorySchema.deleteAll({ cardId });
            return true;
        } catch (err) {
            console.error("Failed to delete card", err);
            return false;
        }
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
