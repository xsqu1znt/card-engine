"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  BunnyCDN: () => BunnyCDN,
  CanvasUtils: () => CanvasUtils,
  CardEngine: () => CardEngine,
  CardGalleryRenderer: () => CardGalleryRenderer,
  CardIndex: () => CardIndex,
  CardPool: () => CardPool,
  ImageManager: () => ImageManager,
  InventoryEngine: () => InventoryEngine,
  NestedCardIndex: () => NestedCardIndex,
  createCardIndex: () => createCardIndex,
  createNestedCardIndex: () => createNestedCardIndex,
  createSearchField: () => createSearchField,
  useBunnyCDN: () => useBunnyCDN
});
module.exports = __toCommonJS(index_exports);

// src/cards/InventoryEngine.ts
var InventoryEngine = class {
  constructor(config) {
    this.config = config;
  }
  config;
  async fetch(invIds, options = {}) {
    const { userId, projection } = options;
    const isArray = Array.isArray(invIds);
    const cardIdsArray = isArray ? invIds : [invIds];
    const invCards = await this.config.inventorySchema.fetchAll(
      {
        ...userId && { userId },
        invId: { $in: cardIdsArray }
      },
      projection
    );
    const mapped = await this.mapCards(invCards);
    return isArray ? mapped : mapped[0];
  }
  async fetchAll(options = {}) {
    const { userId, projection } = options;
    const invCards = await this.config.inventorySchema.fetchAll({ ...userId && { userId } }, projection);
    return this.mapCards(invCards);
  }
  /** Maps inventory cards to their actual card, filtering out cards that don't exist. */
  async mapCards(invCards) {
    return (await Promise.all(
      invCards.map(async (invCard) => ({ card: await this.config.cardEngine.get(invCard.cardId), invCard }))
    )).filter(({ card }) => card);
  }
};

// src/cards/cardEngine.ts
var import_node_stream2 = require("stream");
var import_qznt3 = require("qznt");

// src/media/renderers/CardGalleryRenderer.ts
var import_sharp2 = __toESM(require("sharp"), 1);

// src/media/utils/ImageUtils.ts
var import_axios = __toESM(require("axios"), 1);
var import_discord = require("discord.js");
var import_qznt = require("qznt");
var import_sharp = __toESM(require("sharp"), 1);
var ImageManager = class _ImageManager {
  static MAX_QUEUE_SIZE = 100;
  static queue = /* @__PURE__ */ new Map();
  static createRenderedMediaData(image, buffer, dimensions, fileName) {
    return {
      image,
      buffer,
      dimensions,
      fileName,
      url: `attachment://${fileName}`,
      getFileSize() {
        return {
          kb: Number((buffer.byteLength / 1024).toFixed(2)),
          string: (0, import_qznt.memory)(buffer.byteLength, 2)
        };
      },
      files() {
        return { files: [new import_discord.AttachmentBuilder(buffer, { name: this.fileName })] };
      }
    };
  }
  static async fetch(url, useSharp) {
    const existing = this.queue.get(url);
    if (existing) {
      console.debug("Using buffer from queue");
      return existing;
    }
    if (this.queue.size >= _ImageManager.MAX_QUEUE_SIZE) {
      throw new Error("[ImageManager] Fetch queue is full");
    }
    const fetchImage = async () => {
      console.debug(`\u23F3 Fetching '${url}'`);
      const res = await import_axios.default.get(url, { responseType: "arraybuffer" });
      console.debug(`\u2713 Fetched '${url}'`);
      const buffer = Buffer.from(res.data, "binary");
      if (useSharp) {
        const canvas = (0, import_sharp.default)(buffer);
        const metadata = await canvas.metadata();
        return { canvas, buffer, metadata };
      }
      return buffer;
    };
    const promise = fetchImage().catch((err) => {
      throw new Error(`[ImageManager] Failed to fetch '${url}'`, { cause: err });
    });
    this.queue.set(url, promise);
    try {
      return await promise;
    } finally {
      this.queue.delete(url);
    }
  }
  static async scaleBuffer(buffer, factor) {
    const image = (0, import_sharp.default)(buffer);
    const { width, height } = await image.metadata();
    if (!width || !height) throw new Error("[ImageManager] Could not read image dimensions");
    return image.resize(Math.round(width * factor), Math.round(height * factor)).toBuffer();
  }
};

// src/media/renderers/CardGalleryRenderer.ts
var CardGalleryRenderer = class {
  cards = /* @__PURE__ */ new Map();
  cardBuffers = /* @__PURE__ */ new Map();
  cardMetadata = /* @__PURE__ */ new Map();
  constructor(options) {
    if (options?.cards.length) this.addCards(...options.cards);
  }
  addCards(...cards) {
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
  async fetchCardImages() {
    await Promise.all(
      Array.from(this.cards.values()).map(async (card) => {
        if (this.cardBuffers.has(card.cardId)) {
          if (!this.cardMetadata.has(card.cardId)) {
            const metadata2 = await (0, import_sharp2.default)(this.cardBuffers.get(card.cardId)).metadata();
            this.cardMetadata.set(card.cardId, metadata2);
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
      buffers: cardEntries.map((c) => this.cardBuffers.get(c.cardId)),
      metadata: cardEntries.map((c) => this.cardMetadata.get(c.cardId))
    };
  }
  chunkRows(metadata, rowLength) {
    const rows = [];
    for (let i = 0; i < metadata.length; i += rowLength) {
      rows.push(metadata.slice(i, i + rowLength));
    }
    return rows;
  }
  calculateCanvasSize(slots, rowLength, gap) {
    if (!slots.length) return { canvasWidth: 0, canvasHeight: 0 };
    const rows = this.chunkRows(slots, rowLength);
    const canvasWidth = Math.max(
      ...rows.map((row) => {
        const widthSum = row.reduce((sum, slot) => sum + (slot.width ?? 0), 0);
        return widthSum + gap * (row.length - 1);
      })
    );
    const rowHeights = rows.map((row) => Math.max(...row.map((slot) => slot.height ?? 0)));
    const canvasHeight = rowHeights.reduce((sum, h) => sum + h, 0) + gap * (rows.length - 1);
    return { canvasWidth, canvasHeight };
  }
  getCompositeOperations(buffers, metadata, rowLength, gap) {
    if (!metadata.length) return [];
    const rows = this.chunkRows(metadata, rowLength);
    const rowMaxHeights = rows.map((row) => Math.max(...row.map((slot) => slot.height ?? 0)));
    const compositeOps = [];
    let currentY = 0;
    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      let currentX = 0;
      const row = rows[rowIdx];
      for (let colIdx = 0; colIdx < row.length; colIdx++) {
        const globalIdx = rowIdx * rowLength + colIdx;
        compositeOps.push({
          input: buffers[globalIdx],
          left: currentX,
          top: currentY,
          blend: "over"
        });
        currentX += (row[colIdx].width ?? 0) + gap;
      }
      currentY += rowMaxHeights[rowIdx] + gap;
    }
    return compositeOps;
  }
  async render(options = {}) {
    const { rowLength = 4, gap = 7, scaleFactor = 0.4, pngOptions, padToFullRow = false } = options;
    const { buffers, metadata } = await this.fetchCardImages();
    if (!buffers.length) throw new Error("No cards to render for gallery");
    const slotDimensions = metadata.map((m) => ({
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
    const canvas = (0, import_sharp2.default)({
      create: {
        width: canvasWidth,
        height: canvasHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    });
    const outputBuffer = await canvas.composite(this.getCompositeOperations(buffers, metadata, rowLength, gap)).png({ compressionLevel: 9, quality: 30, ...pngOptions }).toBuffer();
    const scaledBuffer = await ImageManager.scaleBuffer(outputBuffer, scaleFactor);
    return ImageManager.createRenderedMediaData(
      (0, import_sharp2.default)(scaledBuffer),
      scaledBuffer,
      { width: canvasWidth, height: canvasHeight },
      "CardGallery.png"
    );
  }
};

// src/media/utils/BunnyCDN.ts
var import_axios2 = __toESM(require("axios"), 1);
var import_qznt2 = require("qznt");
var BunnyCDN = class _BunnyCDN {
  static instance = null;
  options;
  constructor(options) {
    if (!options.accessKey) throw new Error("Missing BunnyCDN access key");
    if (!options.storageZone) throw new Error("Missing BunnyCDN storage zone");
    if (!options.pullZone) throw new Error("Missing BunnyCDN pull zone");
    this.options = options;
  }
  static use() {
    if (!_BunnyCDN.instance) {
      _BunnyCDN.instance = new _BunnyCDN({
        accessKey: process.env.BUNNY_ACCESS_KEY,
        storageZone: process.env.BUNNY_STORAGE_ZONE,
        pullZone: process.env.BUNNY_PULL_ZONE,
        region: process.env.BUNNY_REGION
      });
    }
    return _BunnyCDN.instance;
  }
  buildHeaders(headers) {
    return { AccessKey: this.options.accessKey, ...headers };
  }
  buildBaseUrl() {
    return `https://${this.options.region ? `${this.options.region}.` : ""}storage.bunnycdn.com/${this.options.storageZone}`;
  }
  buildFileUrl(filename, folder) {
    const baseUrl = this.buildBaseUrl();
    const nestedPath = folder ? `/${folder}` : "";
    return {
      uploadUrl: `${baseUrl}${nestedPath}/${filename}`,
      cdnUrl: `${this.options.pullZone}${nestedPath}/${filename}`,
      path: `${nestedPath}/${filename}`
    };
  }
  async uploadImageFromUrl(url, filename, folder) {
    try {
      const res = await import_axios2.default.get(url, { responseType: "arraybuffer" });
      if (!res.data) {
        console.error(`BunnyCDN: Failed to fetch image from URL: ${url}`);
        return { success: false };
      }
      return this.uploadFromBuffer(Buffer.from(res.data), filename, folder);
    } catch (err) {
      console.error(`BunnyCDN: Failed to fetch image from URL: ${url}`, err instanceof Error ? err.message : err);
      return { success: false };
    }
  }
  async uploadFromBuffer(buffer, filename, folder) {
    const fileUrl = this.buildFileUrl(filename, folder);
    try {
      const res = await import_axios2.default.put(fileUrl.uploadUrl, buffer, {
        headers: this.buildHeaders({ "Content-Type": "application/octet-stream" })
      });
      if (res.status === 201) {
        return {
          success: true,
          name: filename,
          path: fileUrl.path,
          size: { bytes: buffer.length, str: (0, import_qznt2.memory)(buffer.length) },
          cdnUrl: fileUrl.cdnUrl
        };
      }
      console.error(`BunnyCDN: Failed to upload buffer, status code: ${res.status}`);
      return { success: false };
    } catch (err) {
      console.error(`BunnyCDN: Failed to upload buffer`, err instanceof Error ? err.message : err);
      return { success: false };
    }
  }
  async delete(path) {
    const baseUrl = this.buildBaseUrl();
    const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
    try {
      const res = await import_axios2.default.delete(`${baseUrl}/${normalizedPath}`, { headers: this.buildHeaders() });
      if ([200, 204].includes(res.status)) return true;
      console.error(`BunnyCDN: Delete failed for ${path}, status code: ${res.status}`);
      return false;
    } catch (err) {
      console.error(`BunnyCDN: Delete failed for ${path}`, err instanceof Error ? err.message : err);
      return false;
    }
  }
};
var useBunnyCDN = () => BunnyCDN.use();

// src/media/utils/CanvasUtils.ts
var import_canvas = require("@napi-rs/canvas");
var CanvasUtils = class {
  static createTextBuffer(text, canvasWidth, canvasHeight, xPos, yPos, options = {}) {
    const { font, fontSize = 32, fontStyle, fontWeight, align = "left", color = "#000" } = options;
    const canvas = (0, import_canvas.createCanvas)(canvasWidth, canvasHeight);
    const ctx = canvas.getContext("2d");
    const fontParts = [fontStyle, fontWeight, `${fontSize}px`, font].filter(Boolean).join(" ");
    ctx.font = fontParts;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(text, xPos, yPos, canvasWidth);
    return canvas.toBuffer("image/png");
  }
};

// src/cards/cardPool.ts
var import_node_stream = require("stream");
var CardPool = class extends import_node_stream.EventEmitter {
  constructor(cardSchema, indexes, nestedIndexes) {
    super();
    this.cardSchema = cardSchema;
    this.indexes = new Map((indexes ?? []).map((index) => [index.name, index]));
    this.nestedIndexes = new Map((nestedIndexes ?? []).map((index) => [index.name, index]));
    this.indexRef = [...indexes ?? [], ...nestedIndexes ?? []];
  }
  cardSchema;
  // --- Indexes ---
  all = /* @__PURE__ */ new Map();
  allReleased = /* @__PURE__ */ new Map();
  indexes = /* @__PURE__ */ new Map();
  nestedIndexes = /* @__PURE__ */ new Map();
  indexRef = [];
  // --- Cache ---
  initPromise = null;
  queuePromise = Promise.resolve();
  // --- Indexes ---
  insert(cards) {
    const inserted = [];
    for (const card of cards) {
      if (!card) continue;
      const oldCard = this.all.get(card.cardId);
      if (oldCard) {
        this.all.delete(oldCard.cardId);
        this.allReleased.delete(oldCard.cardId);
        for (const index of this.indexRef) index.remove(oldCard);
      }
      this.all.set(card.cardId, card);
      if (card.state.released) this.allReleased.set(card.cardId, card);
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
  remove(cards) {
    for (const card of cards) {
      if (!card) continue;
      this.all.delete(card.cardId);
      this.allReleased.delete(card.cardId);
      for (const index of this.indexRef) index.remove(card);
      this.emit("cardRemoved", card);
    }
  }
  async get(cardId, released) {
    await this.initCache();
    return released ? this.allReleased.get(cardId) : this.all.get(cardId);
  }
  async getMany(cardIds, released) {
    await this.initCache();
    return cardIds.map((id) => released ? this.allReleased.get(id) : this.all.get(id));
  }
  async has(cardId, released) {
    await this.initCache();
    return released ? this.allReleased.has(cardId) : this.all.has(cardId);
  }
  async hasAll(cardIds, released) {
    await this.initCache();
    return cardIds.every((id) => released ? this.allReleased.has(id) : this.all.has(id));
  }
  clear() {
    this.all.clear();
    this.allReleased.clear();
    for (const index of this.indexRef) {
      index.clear();
    }
  }
  async getIndex(name) {
    await this.initCache();
    return this.indexes.get(name);
  }
  async getNestedIndex(name) {
    await this.initCache();
    return this.nestedIndexes.get(name);
  }
  // --- Cache ---
  async initCache() {
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
  enqueue(fn) {
    this.queuePromise = this.queuePromise.then(() => fn()).catch((err) => console.error("[CardPool] Error refreshing cache", err instanceof Error ? err.message : err));
    return this.queuePromise;
  }
  async refresh(cardIds) {
    await this.initCache();
    await this.enqueue(async () => {
      if (!cardIds?.length) this.clear();
      const cards = cardIds?.length ? await this.cardSchema.fetchAll({ cardId: { $in: cardIds } }) : await this.cardSchema.fetchAll();
      this.insert(cards);
      this.emit("cacheRefreshed", cards, cardIds?.length ? "partial" : "full");
    });
  }
};

// src/cards/cardEngine.ts
var CardEngine = class extends import_node_stream2.EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.pool = new CardPool(config.schemas.card, config.indexes, config.nestedIndexes);
    this.compiledSampleRates = compileWeightPool(config.cardSampleRates);
    this.pool.on("initialized", () => this.emit("initialized"));
    this.pool.on("cardInserted", (card) => this.emit("cardInserted", card));
    this.pool.on("cardRemoved", (card) => this.emit("cardRemoved", card));
    this.pool.on("cardUpdated", (oldCard, newCard) => this.emit("cardUpdated", oldCard, newCard));
    this.pool.on("cacheRefreshed", (cards, scope) => this.emit("cacheRefreshed", cards, scope));
  }
  config;
  pool;
  compiledSampleRates;
  // --- Pool Utils ---
  /** Gets a card from the pool. */
  async get(cardId, released) {
    return await this.pool.get(cardId, released);
  }
  /** Gets many cards from the pool and sorts them. */
  async getMany(cardIds, released) {
    const results = await this.pool.getMany(cardIds, released);
    return this.sort(results.filter((c) => !!c));
  }
  /** Checks if a card is in the pool. */
  async has(cardId, released) {
    return await this.pool.has(cardId, released);
  }
  /** Checks if all cards are in the pool. */
  async hasAll(cardIds, released) {
    return await this.pool.hasAll(cardIds, released);
  }
  /** Refreshes the card pool. */
  async refresh(cardIds) {
    return await this.pool.refresh(cardIds);
  }
  // --- Card Utils ---
  /** Sorts an array of cards. Non-destructive. */
  sort(cards) {
    return structuredClone(cards).sort(this.config.sortFn);
  }
  // --- CRUD ---
  /** Fuzzy searches the card pool using the configured search fields and sorts the results. Case-insensitive. */
  search(query, options = {}) {
    const { limit = 25, released = true, excludeSearchFields = [], exclude } = options;
    query = query.toLowerCase();
    const source = Array.from((released ? this.pool.allReleased : this.pool.all).values()).filter(
      (card) => !exclude?.(card)
    );
    if (!source.length) {
      if (!exclude) console.warn(`[CardEngine] Search failed for '${query}'; the card pool is empty`);
      return [];
    }
    const searchFields = Object.entries(this.config.searchFields ?? []).filter(([name]) => !excludeSearchFields.length || !excludeSearchFields.includes(name)).map(([, getter]) => getter);
    if (!searchFields.length) {
      console.warn(`[CardEngine] Search failed for '${query}'; no search fields are configured`);
      return [];
    }
    const results = [];
    for (const card of source) {
      if (results.length >= limit) break;
      for (const field of searchFields) {
        const matchedKey = field.getKey(card);
        if (matchedKey === void 0) continue;
        if (typeof matchedKey === "string" && matchedKey.toLowerCase().includes(query)) {
          results.push(card);
          break;
        }
        if (field.transformer) {
          const transformed = field.transformer(query);
          if (typeof matchedKey === "number" && matchedKey.toString() === query) {
            results.push(card);
            break;
          } else if (typeof matchedKey === "boolean" && matchedKey === transformed) {
            results.push(card);
            break;
          }
        }
      }
    }
    return this.sort(results);
  }
  /** Fuzzy searches the card pool by the configured indexes. Does not query nested indexes. Case-insensitive. */
  searchByIndex(query, options = {}) {
    const { limit = 25, released = true, exclude } = options;
    query = query.toLowerCase();
    const source = Array.from((released ? this.pool.allReleased : this.pool.all).values()).filter(
      (card) => !exclude?.(card)
    );
    if (!source.length) {
      if (!exclude) console.warn(`[CardEngine] Search failed for '${query}'; the card pool is empty`);
      return [];
    }
    const results = [];
    for (const index of this.pool.indexes.values()) {
      if (results.length >= limit) break;
      for (const [indexKey, cardIdSet] of index.entries()) {
        if (typeof indexKey !== "string") continue;
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
  async sample(limit, options = {}) {
    const { excludeCards = [] } = options;
    const picked = new Set(excludeCards);
    const results = [];
    for (let i = 0; i < limit; i++) {
      const selectedType = import_qznt3.$.rnd.weighted(this.compiledSampleRates, (t) => t.compiledWeight);
      let selectedRarity;
      if (selectedType.rarities) {
        selectedRarity = import_qznt3.$.rnd.weighted(selectedType.rarities, (r) => r.compiledWeight).rarity;
      }
      let candidates;
      if (selectedRarity !== void 0) {
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
      const availableCandidates = Array.from(candidates).filter((id) => !picked.has(id));
      if (!availableCandidates.length) {
        console.warn("[CardEngine] Sample failed; not enough cards available");
        return [];
      }
      const cardId = import_qznt3.$.rnd.choice(availableCandidates);
      picked.add(cardId);
      results.push(await this.pool.get(cardId));
    }
    return results;
  }
  /** Samples a number of cards from the card pool and updates them, returning the modified cards. */
  async sampleAndUpdate(limit, update, options) {
    const cards = await this.sample(limit, options);
    return await this.update(
      cards.map((c) => c.cardId),
      update
    );
  }
  /** Creates a new card in the database and uploads its image to the CDN. */
  async insert(data, stageFns) {
    const existing = await this.pool.get(data.card.cardId);
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
      { ...data.card, asset: { imageUrl: imageResult.cdnUrl, cdn: { filePath: imageResult.path } } }
    ]);
    if (!card) throw new Error("Failed to insert card into database");
    await stageFns?.[2]();
    await this.pool.refresh([card.cardId]);
    return card;
  }
  /** Removes a card from the database and CDN, and clears it from player inventories. */
  async remove(cardIds) {
    await Promise.all(
      cardIds.map(async (cardId) => {
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
  async update(cardIds, update) {
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
  async swapImage(cardId, newImageUrl, options) {
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
      { "asset.imageUrl": imageResult.cdnUrl, "asset.cdn.filePath": imageResult.path },
      { returnDocument: "after" }
    );
    if (!updated) return null;
    this.pool.insert([updated]);
    return updated;
  }
  /** Releases a batch of cards and updates the cache. */
  async release(cardIds) {
    await this.config.schemas.card.updateAll({ cardId: { $in: cardIds } }, { "state.released": true });
    await this.pool.refresh(cardIds);
    return await this.getMany(cardIds, true);
  }
};
function buildCardFilename(prefix, imageUrl) {
  const fileExt = imageUrl.split("?").shift()?.split(".").pop();
  return `${prefix.toUpperCase()}_CARD_${Date.now()}${import_qznt3.$.rnd.str(2, "alpha", { casing: "upper" })}.${fileExt}`;
}
function compileWeightPool(sampleRates) {
  const totalRawBaseWeight = sampleRates.reduce((acc, cur) => acc + 1 / cur.oneIn, 0);
  return sampleRates.map((tier) => {
    const compiled = {
      type: tier.type,
      oneIn: tier.oneIn,
      compiledWeight: 1 / tier.oneIn / totalRawBaseWeight
    };
    if (tier.rarities) {
      const totalRawRarityWeight = tier.rarities.reduce((acc, cur) => acc + 1 / cur.oneIn, 0);
      compiled.rarities = tier.rarities.map((r) => ({
        rarity: r.rarity,
        oneIn: r.oneIn,
        compiledWeight: 1 / r.oneIn / totalRawRarityWeight
      }));
    }
    return compiled;
  });
}
function createSearchField(name, getKey, transformer) {
  return { name, getKey, transformer };
}

// src/cards/cardIndex.ts
var CardIndex = class {
  constructor(name, getKey, validator) {
    this.name = name;
    this.getKey = getKey;
    this.validator = validator;
  }
  name;
  getKey;
  validator;
  items = /* @__PURE__ */ new Map();
  insert(card) {
    if (!this.validator(card)) return;
    const key = this.getKey(card);
    if (key === void 0) return;
    const bucket = this.items.get(key) ?? /* @__PURE__ */ new Set();
    bucket.add(card.cardId);
    this.items.set(key, bucket);
  }
  remove(card) {
    const key = this.getKey(card);
    if (!key) return;
    this.items.get(key)?.delete(card.cardId);
  }
  get(key) {
    return this.items.get(key) ?? /* @__PURE__ */ new Set();
  }
  has(key) {
    return this.items.has(key);
  }
  clear() {
    this.items.clear();
  }
  entries() {
    return Array.from(this.items.entries());
  }
  keys() {
    return Array.from(this.items.keys());
  }
  values() {
    return Array.from(this.items.values());
  }
};
var NestedCardIndex = class {
  constructor(name, getKey1, getKey2, validator) {
    this.name = name;
    this.getKey1 = getKey1;
    this.getKey2 = getKey2;
    this.validator = validator;
  }
  name;
  getKey1;
  getKey2;
  validator;
  items = /* @__PURE__ */ new Map();
  insert(card) {
    if (!this.validator(card)) return;
    const k1 = this.getKey1(card);
    const k2 = this.getKey2(card);
    if (k1 === void 0 || k2 === void 0) return;
    const outer = this.items.get(k1) ?? /* @__PURE__ */ new Map();
    if (!outer) this.items.set(k1, outer);
    const bucket = outer.get(k2) ?? /* @__PURE__ */ new Set();
    bucket.add(card.cardId);
    this.items.set(k1, bucket);
  }
  remove(card) {
    const k1 = this.getKey1(card);
    const k2 = this.getKey2(card);
    if (k1 === void 0 || k2 === void 0) return;
    this.items.get(k1)?.get(k2)?.delete(card.cardId);
  }
  get(k1, k2) {
    if (k2 === void 0) return /* @__PURE__ */ new Set();
    return this.items.get(k1)?.get(k2) ?? /* @__PURE__ */ new Set();
  }
  clear() {
    this.items.clear();
  }
};
var DEFAULT_VALIDATOR = (card) => card.state.released && card.state.droppable;
function createCardIndex(name, getKey, validator) {
  return new CardIndex(name, getKey, validator ?? DEFAULT_VALIDATOR);
}
function createNestedCardIndex(name, getKey1, getKey2, validator) {
  return new NestedCardIndex(name, getKey1, getKey2, validator ?? DEFAULT_VALIDATOR);
}

// src/types/image.types.ts
var import_discord2 = require("discord.js");
var import_sharp3 = require("sharp");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  BunnyCDN,
  CanvasUtils,
  CardEngine,
  CardGalleryRenderer,
  CardIndex,
  CardPool,
  ImageManager,
  InventoryEngine,
  NestedCardIndex,
  createCardIndex,
  createNestedCardIndex,
  createSearchField,
  useBunnyCDN
});
