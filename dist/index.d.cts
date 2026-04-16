import { UpdateQuery, ProjectionType } from 'mongoose';
import { MongoSchemaBuilder } from 'vimcord';
import { EventEmitter } from 'node:stream';
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
interface MappedInventoryCard<T1 extends CardLike, T2 extends InventoryCardLike> {
    card: T1;
    invCard: T2;
}

type KeyGetter<T, K> = (card: T) => K | undefined;
type Validator<T> = (card: T) => boolean;
declare class CardIndex<T extends CardLike, K extends string | number = string | number> {
    /** Example: "byName" */
    readonly name: string;
    private readonly getKey;
    private readonly validator;
    private readonly items;
    constructor(
    /** Example: "byName" */
    name: string, getKey: KeyGetter<T, K>, validator: Validator<T>);
    insert(card: T): void;
    remove(card: T): void;
    get(key: K): ReadonlySet<string>;
    has(key: K): boolean;
    clear(): void;
    entries(): [K, ReadonlySet<string>][];
    keys(): K[];
    values(): ReadonlySet<string>[];
}
declare class NestedCardIndex<T extends CardLike, K1 extends string | number = string | number, K2 extends string | number = string | number> {
    readonly name: string;
    private readonly getKey1;
    private readonly getKey2;
    private readonly validator;
    private readonly items;
    constructor(name: string, getKey1: KeyGetter<T, K1>, getKey2: KeyGetter<T, K2>, validator: Validator<T>);
    insert(card: T): void;
    remove(card: T): void;
    get(k1: K1, k2: K2 | undefined): ReadonlySet<string>;
    clear(): void;
}
declare function createCardIndex<T extends CardLike, K extends string | number>(name: string, getKey: KeyGetter<T, K>, 
/** @defaultBehavior Only allows `state.released` and `state.droppable` cards to be indexed. */
validator?: Validator<T>): CardIndex<T, K>;
declare function createNestedCardIndex<T extends CardLike, K1 extends string | number = string | number, K2 extends string | number = string | number>(name: string, getKey1: KeyGetter<T, K1>, getKey2: KeyGetter<T, K2>, 
/** @defaultBehavior Only allows `state.released` and `state.droppable` cards to be indexed. */
validator?: Validator<T>): NestedCardIndex<T, K1, K2>;

interface CardPoolEvents<T extends CardLike> {
    initialized: [];
    cardInserted: [card: T];
    cardRemoved: [card: T];
    cardUpdated: [oldCard: T, newCard: T];
    cacheRefreshed: [cards: T[], scope: "partial" | "full"];
}
declare class CardPool<T extends CardLike, K extends string | number = string | number> extends EventEmitter<CardPoolEvents<T>> {
    readonly cardSchema: MongoSchemaBuilder<T>;
    readonly all: Map<string, T>;
    readonly allReleased: Map<string, T>;
    readonly indexes: Map<string, CardIndex<T, K>>;
    readonly nestedIndexes: Map<string, NestedCardIndex<T, K, string | number>>;
    private indexRef;
    private initPromise;
    private queuePromise;
    constructor(cardSchema: MongoSchemaBuilder<T>, indexes?: CardIndex<T, K>[], nestedIndexes?: NestedCardIndex<T, K>[]);
    insert(cards: (T | null | undefined)[]): T[];
    remove(cards: (T | null | undefined)[]): void;
    get(cardId: string, released?: boolean): Promise<T | undefined>;
    getMany(cardIds: string[], released?: boolean): Promise<(T | undefined)[]>;
    has(cardId: string, released?: boolean): Promise<boolean>;
    hasAll(cardIds: string[], released?: boolean): Promise<boolean>;
    clear(): void;
    getIndex(name: string): CardIndex<T, K> | undefined;
    getNestedIndex(name: string): NestedCardIndex<T, K> | undefined;
    private initCache;
    private enqueue;
    refresh(cardIds?: string[]): Promise<void>;
}

interface SearchField<T extends CardLike> {
    name: string;
    getKey(card: T): string | number | undefined;
    /** Transforms the incoming search query before checking for matches. */
    transformer?(query: string): string;
}
interface SampleRateRarity {
    rarity: number;
    oneIn: number;
}
interface SampleRateTier<K extends string | number = string | number> {
    type: K;
    oneIn: number;
    rarities?: SampleRateRarity[];
}
interface CardEngineEvents<T extends CardLike> extends CardPoolEvents<T> {
}
interface CardEngineConfig<T1 extends CardLike, T2 extends InventoryCardLike, K extends string | number = string | number> {
    schemas: {
        card: MongoSchemaBuilder<T1>;
        inventory: MongoSchemaBuilder<T2>;
    };
    indexes?: CardIndex<T1, K>[];
    nestedIndexes?: NestedCardIndex<T1, K>[];
    cardSampleIndex: string;
    cardSampleNestedIndex: string;
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
interface CardInsertData<T> {
    prefix: string;
    imageUrl: string;
    cdnRoute: string;
    card: Partial<T>;
}
declare class CardEngine<T1 extends CardLike, T2 extends InventoryCardLike, K extends string | number = string | number> extends EventEmitter<CardEngineEvents<T1>> {
    private readonly config;
    readonly pool: CardPool<T1, K>;
    private readonly compiledSampleRates;
    constructor(config: CardEngineConfig<T1, T2, K>);
    /** Gets a card from the pool. */
    get(cardId: string, released?: boolean): Promise<T1 | undefined>;
    /** Gets many cards from the pool and sorts them. */
    getMany(cardIds: string[], released?: boolean): Promise<T1[]>;
    /** Checks if a card is in the pool. */
    has(cardId: string, released?: boolean): Promise<boolean>;
    /** Checks if all cards are in the pool. */
    hasAll(cardIds: string[], released?: boolean): Promise<boolean>;
    /** Refreshes the card pool. */
    refresh(cardIds?: string[]): Promise<void>;
    /** Sorts an array of cards. Non-destructive. */
    sort(cards: T1[]): T1[];
    /** Fuzzy searches the card pool using the configured search fields and sorts the results. Case-insensitive. */
    search(query: string, options?: SearchOptions<T1>): T1[];
    /** Fuzzy searches the card pool by the configured indexes. Does not query nested indexes. Case-insensitive. */
    searchByIndex(query: string, options?: SearchByIndexOptions<T1>): IndexedSearchResult[];
    /**
     * Samples a number of cards from the card pool.
     *
     * Requires:
     * - `NestedCardIndex`: **type -> rarity**
     * - `CardIndex`: **type**
     */
    sample(limit: number, options?: SampleOptions): Promise<T1[]>;
    /** Samples a number of cards from the card pool and updates them, returning the modified cards. */
    sampleAndUpdate(limit: number, update: UpdateQuery<T1>, options?: SampleOptions): Promise<T1[]>;
    /** Creates a new card in the database and uploads its image to the CDN. */
    insert(data: CardInsertData<T1>, stageFns?: [() => any, () => any, () => any]): Promise<T1>;
    /** Removes a card from the database and CDN, and clears it from player inventories. */
    remove(cardIds: string[]): Promise<void>;
    /** Updates multiple cards in the database. Supports atomic operators e.g. $inc. */
    update(cardIds: string[], update: UpdateQuery<T1>): Promise<T1[]>;
    /** Swaps the image of a card in the database. */
    swapImage(cardId: string, newImageUrl: string, options: {
        prefix: string;
        cdnRoute: string;
    }): Promise<T1 | null>;
    /** Releases a batch of cards and updates the cache. */
    release(cardIds: string[]): Promise<T1[]>;
}
declare function createSearchField<T extends CardLike>(name: string, getKey: (card: T) => string | number | undefined, 
/** Transforms the incoming search query before checking for matches. */
transformer?: (query: string) => string): SearchField<T>;

interface FetchInventoryCardOptions<InvCard extends InventoryCardLike> {
    projection?: ProjectionType<InvCard>;
}
interface InventoryEngineConfig<T1 extends CardLike, T2 extends InventoryCardLike, K extends string | number = string | number> {
    cardEngine: CardEngine<T1, T2, K>;
    inventorySchema: MongoSchemaBuilder<T2>;
}
declare class InventoryEngine<T1 extends CardLike, T2 extends InventoryCardLike, K extends string | number = string | number> {
    private readonly config;
    constructor(config: InventoryEngineConfig<T1, T2, K>);
    /** Fetches an inventory card and maps it to its actual card. */
    fetch(userId: string, invId: string, options?: FetchInventoryCardOptions<T2>): Promise<MappedInventoryCard<T1, T2> | undefined>;
    fetch(userId: string, invIds: string | string[], options?: FetchInventoryCardOptions<T2>): Promise<MappedInventoryCard<T1, T2>[]>;
    fetchAll(userId: string, options?: FetchInventoryCardOptions<T2>): Promise<MappedInventoryCard<T1, T2>[]>;
    /** Maps inventory cards to their actual card, filtering out cards that don't exist. */
    mapCards(invCards: T2[]): Promise<MappedInventoryCard<T1, T2>[]>;
}

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

export { BunnyCDN, type BunnyCDNOptions, type BunnyCDNRegion, type BunnyCDNUploadOptions, type BunnyCDN_Upload, CanvasUtils, CardEngine, type CardEngineConfig, type CardEngineEvents, CardGalleryRenderer, CardIndex, type CardInsertData, type CardLike, CardPool, type CardPoolEvents, type CreateImageGalleryOptions, type FetchedImageWithSharp, ImageManager, type InventoryCardLike, InventoryEngine, type InventoryEngineConfig, type KeyGetter, type MappedInventoryCard, type MediaDimensions, NestedCardIndex, type RenderedMediaWithSharp, type Validator, createCardIndex, createNestedCardIndex, createSearchField, useBunnyCDN };
