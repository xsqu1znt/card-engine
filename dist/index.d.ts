import { EventEmitter } from 'node:events';
import { MongoSchemaBuilder } from 'vimcord';
import { UpdateQuery } from 'mongoose';
import { AttachmentBuilder } from 'discord.js';
import sharp from 'sharp';

interface CardLike {
    cardId: string;
    asset: {
        imageUrl: string;
        cdn: {
            filePath: string;
        };
    };
    state: {
        released: boolean;
        droppable: boolean;
    };
}
interface InventoryCardLike {
    userId: string;
    cardId: string;
}
interface MappedInventoryCard<Card extends CardLike = CardLike, InvCard extends InventoryCardLike = InventoryCardLike> {
    card: Card;
    invCard: InvCard;
}

type Validator<T> = (card: T) => boolean;
type KeyExtractor<T, K> = (card: T) => K | undefined;
interface IndexConfig<T, K = string> {
    name: string;
    getKey: KeyExtractor<T, K>;
    validator?: Validator<T>;
}
interface NestedIndexConfig<T, K1 = string, K2 = number> {
    name: string;
    getKey1: KeyExtractor<T, K1>;
    getKey2: KeyExtractor<T, K2>;
    validator?: Validator<T>;
}
interface ICardIndex<T> {
    insert(card: T): void;
    remove(card: T): void;
    clear(): void;
}

declare class CardIndex<T extends CardLike, K> implements ICardIndex<T> {
    private readonly getKey;
    private readonly validator?;
    private readonly map;
    constructor(getKey: KeyExtractor<T, K>, validator?: Validator<T> | undefined);
    insert(card: T): void;
    remove(card: T): void;
    get(key: K): ReadonlySet<string>;
    has(key: K): boolean;
    entries(): [K, ReadonlySet<string>][];
    keys(): K[];
    values(): ReadonlySet<string>[];
    clear(): void;
}
declare class NestedCardIndex<T extends CardLike, K1, K2> implements ICardIndex<T> {
    private readonly getKey1;
    private readonly getKey2;
    private readonly validator?;
    private readonly map;
    constructor(getKey1: KeyExtractor<T, K1>, getKey2: KeyExtractor<T, K2>, validator?: Validator<T> | undefined);
    insert(card: T): void;
    remove(card: T): void;
    get(key1: K1, key2: K2 | undefined): ReadonlySet<string>;
    getOuter(key1: K1): ReadonlyMap<K2, Set<string>>;
    clear(): void;
}

declare class CardPool<T extends CardLike> {
    readonly all: Map<string, T>;
    readonly allReleased: Map<string, T>;
    readonly indices: Map<string, CardIndex<T, any>>;
    readonly nestedIndices: Map<string, NestedCardIndex<T, any, any>>;
    private readonly indexList;
    constructor(indexConfigs: IndexConfig<T, any>[], nestedIndexConfigs?: NestedIndexConfig<T, any, any>[]);
    insert(card: T): void;
    remove(card: T): void;
    get(cardId: string): T | undefined;
    has(cardId: string): boolean;
    clear(): void;
    getIndex<K>(name: string): CardIndex<T, K> | undefined;
    getNestedIndex<K1, K2>(name: string): NestedCardIndex<T, K1, K2> | undefined;
}

declare class CardPoolCache<T extends CardLike> extends EventEmitter {
    private readonly cardSchema;
    private readonly indexConfigs;
    private readonly nestedIndexConfigs?;
    private pool;
    private initPromise;
    private refreshQueue;
    private version;
    constructor(cardSchema: MongoSchemaBuilder<T>, indexConfigs: IndexConfig<T, any>[], nestedIndexConfigs?: NestedIndexConfig<T, any, any>[] | undefined);
    get cardPool(): CardPool<T>;
    init(): Promise<this>;
    private enqueue;
    private fetchAndReplacePool;
    refreshAll(): Promise<void>;
    refreshMany(cardIds: string[]): Promise<void>;
    removeMany(cardIds: string[]): Promise<void>;
}

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
interface FuzzySearchField<T> {
    name: string;
    getter: (card: T) => string | undefined;
}
interface FuzzySearchConfig<T> {
    fields: FuzzySearchField<T>[];
}
type SortFunction<T> = (a: T, b: T) => number;
interface CardPoolEngineConfig<T extends CardLike> {
    cardSchema: MongoSchemaBuilder<T>;
    inventoryCardSchema: MongoSchemaBuilder<any>;
    indices: IndexConfig<T, any>[];
    nestedIndices?: NestedIndexConfig<T, any, any>[];
    dropRates: DropRateConfig;
    fuzzySearch: FuzzySearchConfig<T>;
    sortFn: SortFunction<T>;
}
interface CardPoolEngineEvents<T> {
    initialized: [];
    refreshed: [count: number];
    cardInserted: [card: T];
    cardRemoved: [card: T];
    cardUpdated: [card: T, oldCard: T];
    error: [error: Error];
}
interface InsertNewCardData<T> {
    namePrefix: string;
    imageUrl: string;
    cdnRoute: string;
    card: Partial<T>;
}
interface SampleOptions {
    userId?: string;
    excludeCardIds?: string[];
}
type SampleResult<T> = [cards: T[], failReason?: string];
interface FuzzySearchResult<T> {
    results: T[];
    formatted: string[];
    nv: Array<{
        name: string;
        value: string;
    }>;
}
interface FuzzySearchIdentityResult {
    results: Array<{
        key: string;
        cardIds: string[];
    }>;
    formatted: string[];
    nv: Array<{
        name: string;
        value: string;
    }>;
}
declare class CardPoolEngine<T extends CardLike> extends EventEmitter {
    private config;
    private cache;
    private compiledDropRates;
    private initialized;
    constructor(config: CardPoolEngineConfig<T>);
    get pool(): CardPool<T>;
    init(): Promise<this>;
    private ensureInit;
    /** Fuzzy searches the card pool and returns a list of cards. */
    fuzzySearch(query: string, options?: {
        limit?: number;
        released?: boolean;
    }): FuzzySearchResult<T>;
    /** Fuzzy searches the card pool and returns a list of cards by their identity properties. */
    fuzzySearchIdentity(query: string, options?: {
        limit?: number;
    }): FuzzySearchIdentityResult;
    /** Gets a card from the card pool. */
    get(cardId: string, released?: boolean): T | undefined;
    getMany(cardIds: string[], released?: boolean): T[];
    /** Samples a number of cards from the card pool. */
    sample(limit: number, options?: SampleOptions): SampleResult<T>;
    /** Samples a number of cards from the card pool and modifies them, then returns the modified cards. */
    sampleAndModify(limit: number, update: UpdateQuery<T>, options?: SampleOptions): Promise<SampleResult<T>>;
    /** Sorts a list of cards by an opinionated order. */
    sort(cards: T[]): T[];
    /** Creates a new card in the database and uploads its image to the CDN. */
    insert(data: InsertNewCardData<T>, stageFns?: [() => any, () => any, () => any]): Promise<T>;
    /** Modifies a card in the database. Supports atomic operators e.g. $inc. */
    modify(cardId: string, update: UpdateQuery<T>): Promise<T | null>;
    /** Modifies multiple cards in the database. Supports atomic operators e.g. $inc. */
    modifyMany(cardIds: string[], update: UpdateQuery<T>): Promise<T[]>;
    /** Removes a card from the database and CDN, and clears it from player inventories. */
    delete(cardId: string): Promise<boolean>;
    /** Swaps the image of a card in the database. */
    swapImage(cardId: string, newImageUrl: string, options: {
        namePrefix: string;
        cdnRoute: string;
    }): Promise<T | null>;
    /** Releases a batch of cards and updates the cache. */
    release(cardIds: string[]): Promise<T[]>;
    refresh(cardIds?: string[]): Promise<void>;
}
declare function createCardPoolEngine<T extends CardLike>(config: CardPoolEngineConfig<T>): {
    engine: CardPoolEngine<T>;
    useCardEngine: () => Promise<CardPoolEngine<T>>;
    useCardPool: () => Promise<CardPool<T>>;
};

interface MediaDimensions {
    width: number;
    height: number;
}
interface FetchedImageWithSharp {
    canvas: sharp.Sharp;
    buffer: Buffer;
    metadata: sharp.Metadata;
}
interface RenderedMediaWithSharp {
    image: sharp.Sharp;
    buffer: Buffer;
    dimensions: MediaDimensions;
    fileName: string;
    url: string;
    getFileSize: () => {
        kb: number;
        string: string;
    };
    files: (this: RenderedMediaWithSharp) => {
        files: AttachmentBuilder[];
    };
}

interface RenderOptions {
    rowLength?: number;
    gap?: number;
    scaleFactor?: number;
    pngOptions?: sharp.PngOptions;
    /** Pads the canvas to always fit a full row, leaving empty transparent slots for missing cards. */
    padToFullRow?: boolean;
}
declare class CardGalleryRenderer {
    private readonly cards;
    private readonly cardBuffers;
    private readonly cardMetadata;
    constructor(options?: {
        cards: CardLike[];
    });
    addCards(...cards: (CardLike | {
        card: CardLike;
        buffer: Buffer;
        metadata?: sharp.Metadata;
    })[]): this;
    private fetchCardImages;
    private chunkRows;
    private calculateCanvasSize;
    private getCompositeOperations;
    render(options?: RenderOptions): Promise<RenderedMediaWithSharp>;
}

type BunnyCDNRegion = "uk" | "ny" | "la" | "sg" | "se" | "br" | "jh" | "syd";
interface BunnyCDNOptions {
    accessKey?: string;
    storageZone?: string;
    pullZone?: string;
    region?: BunnyCDNRegion;
}
interface BunnyCDNUploadOptions {
    folder?: string;
    fileName?: string;
}
interface BunnyCDN_Upload {
    success: boolean;
    name?: string;
    path?: string;
    size?: {
        bytes: number;
        str: string;
    };
    cdnUrl?: string;
}
declare class BunnyCDN {
    private static instance;
    private options;
    private constructor();
    static use(): BunnyCDN;
    private buildHeaders;
    private buildBaseUrl;
    private buildFileUrl;
    uploadImageFromUrl(url: string, filename: string, folder?: string): Promise<BunnyCDN_Upload>;
    uploadFromBuffer(buffer: Buffer, filename: string, folder?: string): Promise<BunnyCDN_Upload>;
    delete(path: string): Promise<boolean>;
}
declare const useBunnyCDN: () => BunnyCDN;

declare class CanvasUtils {
    static createTextBuffer(text: string, canvasWidth: number, canvasHeight: number, xPos: number, yPos: number, options?: {
        font?: string;
        fontSize?: number;
        fontStyle?: string;
        fontWeight?: string;
        align?: "left" | "center" | "right";
        color?: string;
    }): Buffer<ArrayBufferLike>;
}

interface CreateImageGalleryOptions {
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
declare class ImageManager {
    private static readonly MAX_QUEUE_SIZE;
    private static readonly queue;
    static createRenderedMediaData(image: sharp.Sharp, buffer: Buffer, dimensions: MediaDimensions, fileName: string): RenderedMediaWithSharp;
    static fetch(url: string, useSharp?: boolean): Promise<Buffer<ArrayBuffer>>;
    static fetch(url: string, useSharp: true): Promise<FetchedImageWithSharp>;
    static scaleBuffer(buffer: Buffer, factor: number): Promise<Buffer>;
}

export { BunnyCDN, type BunnyCDNOptions, type BunnyCDNRegion, type BunnyCDNUploadOptions, type BunnyCDN_Upload, CanvasUtils, CardGalleryRenderer, CardIndex, type CardLike, CardPool, CardPoolCache, CardPoolEngine, type CardPoolEngineConfig, type CardPoolEngineEvents, type CreateImageGalleryOptions, type FetchedImageWithSharp, type FuzzySearchIdentityResult, type FuzzySearchResult, type ICardIndex, ImageManager, type IndexConfig, type InsertNewCardData, type InventoryCardLike, type KeyExtractor, type MappedInventoryCard, type MediaDimensions, NestedCardIndex, type NestedIndexConfig, type RenderedMediaWithSharp, type SampleOptions, type SampleResult, type Validator, createCardPoolEngine, useBunnyCDN };
