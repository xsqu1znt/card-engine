import { CardPool } from "@/CardEngine";
import { CardLike, InventoryCardLike } from "@/types/card.types";
import type { EventEmitter } from "node:events";
import type { MongoSchemaBuilder } from "vimcord";

export type Validator<T> = (card: T) => boolean;

export type KeyExtractor<T, K> = (card: T) => K | undefined;

export interface IndexConfig<T, K = string> {
    name: string;
    getKey: KeyExtractor<T, K>;
    validator?: Validator<T>;
}

export interface NestedIndexConfig<T, K1 = string, K2 = number> {
    name: string;
    getKey1: KeyExtractor<T, K1>;
    getKey2: KeyExtractor<T, K2>;
    validator?: Validator<T>;
}

export interface DropRateRarity {
    rarity: number;
    oneIn: number;
}

export interface DropRateTier {
    type: string | number;
    oneIn: number;
    rarities?: DropRateRarity[];
}

export interface DropRateConfig {
    tiers: DropRateTier[];
}

export interface CompiledWeightRarity {
    rarity: number;
    oneIn: number;
    compiledWeight: number;
}

export interface CompiledWeightTier {
    type: string | number;
    oneIn: number;
    compiledWeight: number;
    rarities?: CompiledWeightRarity[];
}

export interface FuzzySearchField<T> {
    name: string;
    getter: (card: T) => string | undefined;
}

export interface FuzzySearchConfig<T> {
    fields: FuzzySearchField<T>[];
}

export type SortFunction<T> = (a: T, b: T) => number;

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

export interface ICardIndex<T> {
    insert(card: T): void;
    remove(card: T): void;
    clear(): void;
}

export declare class CardPoolEngineBase<T extends CardLike> extends EventEmitter {
    readonly pool: CardPool<T>;
    fuzzySearch(query: string, options?: { limit?: number; released?: boolean }): FuzzySearchResult<T>;
    fuzzySearchIdentity(query: string, options?: { limit?: number }): FuzzySearchIdentityResult;
    get(cardId: string, released?: boolean): T | undefined;
    getMany(cardIds: string[], released?: boolean): T[];
    sample(limit: number, options?: SampleOptions): SampleResult<T>;
    sort(cards: T[]): T[];
    insert(card: Partial<T>): Promise<T>;
    update(cardId: string, update: Partial<T>): Promise<T | null>;
    delete(cardId: string): Promise<boolean>;
    refresh(cardIds?: string[]): Promise<void>;

    on<K extends keyof CardPoolEngineEvents<T>>(event: K, listener: (...args: CardPoolEngineEvents<T>[K]) => void): this;
    once<K extends keyof CardPoolEngineEvents<T>>(event: K, listener: (...args: CardPoolEngineEvents<T>[K]) => void): this;
    off<K extends keyof CardPoolEngineEvents<T>>(event: K, listener: (...args: CardPoolEngineEvents<T>[K]) => void): this;
    emit<K extends keyof CardPoolEngineEvents<T>>(event: K, ...args: CardPoolEngineEvents<T>[K]): boolean;
}
