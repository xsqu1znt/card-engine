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
  CardGalleryRenderer: () => CardGalleryRenderer,
  CardIndex: () => CardIndex,
  CardPool: () => CardPool,
  CardPoolCache: () => CardPoolCache,
  CardPoolEngine: () => CardPoolEngine,
  ImageManager: () => ImageManager,
  InventoryEngine: () => InventoryEngine,
  NestedCardIndex: () => NestedCardIndex,
  createCardPoolEngine: () => createCardPoolEngine,
  createInventoryEngine: () => createInventoryEngine,
  useBunnyCDN: () => useBunnyCDN
});
module.exports = __toCommonJS(index_exports);

// src/CardEngine/CardIndex.ts
var EMPTY_SET = /* @__PURE__ */ new Set();
var EMPTY_MAP = /* @__PURE__ */ new Map();
var CardIndex = class {
  constructor(getKey, validator) {
    this.getKey = getKey;
    this.validator = validator;
  }
  map = /* @__PURE__ */ new Map();
  insert(card) {
    if (this.validator && !this.validator(card)) return;
    const key = this.getKey(card);
    if (key === void 0) return;
    let bucket = this.map.get(key);
    if (!bucket) this.map.set(key, bucket = /* @__PURE__ */ new Set());
    bucket.add(card.cardId);
  }
  remove(card) {
    const key = this.getKey(card);
    if (key === void 0) return;
    this.map.get(key)?.delete(card.cardId);
  }
  get(key) {
    return this.map.get(key) ?? EMPTY_SET;
  }
  has(key) {
    return this.map.has(key);
  }
  entries() {
    return Array.from(this.map.entries());
  }
  keys() {
    return Array.from(this.map.keys());
  }
  values() {
    return Array.from(this.map.values());
  }
  clear() {
    this.map.clear();
  }
};
var NestedCardIndex = class {
  constructor(getKey1, getKey2, validator) {
    this.getKey1 = getKey1;
    this.getKey2 = getKey2;
    this.validator = validator;
  }
  map = /* @__PURE__ */ new Map();
  insert(card) {
    if (this.validator && !this.validator(card)) return;
    const k1 = this.getKey1(card);
    const k2 = this.getKey2(card);
    if (k1 === void 0 || k2 === void 0) return;
    let outer = this.map.get(k1);
    if (!outer) this.map.set(k1, outer = /* @__PURE__ */ new Map());
    let bucket = outer.get(k2);
    if (!bucket) outer.set(k2, bucket = /* @__PURE__ */ new Set());
    bucket.add(card.cardId);
  }
  remove(card) {
    const k1 = this.getKey1(card);
    const k2 = this.getKey2(card);
    if (k1 === void 0 || k2 === void 0) return;
    this.map.get(k1)?.get(k2)?.delete(card.cardId);
  }
  get(key1, key2) {
    if (key2 === void 0) return EMPTY_SET;
    return this.map.get(key1)?.get(key2) ?? EMPTY_SET;
  }
  getOuter(key1) {
    return this.map.get(key1) ?? EMPTY_MAP;
  }
  clear() {
    this.map.clear();
  }
};

// src/CardEngine/CardPool.ts
var defaultValidator = (card) => card.state.released && card.state.droppable;
var CardPool = class {
  all = /* @__PURE__ */ new Map();
  allReleased = /* @__PURE__ */ new Map();
  indices = /* @__PURE__ */ new Map();
  nestedIndices = /* @__PURE__ */ new Map();
  indexList = [];
  constructor(indexConfigs, nestedIndexConfigs) {
    for (const config of indexConfigs) {
      const index = new CardIndex(config.getKey, config.validator ?? defaultValidator);
      this.indices.set(config.name, index);
      this.indexList.push(index);
    }
    if (nestedIndexConfigs) {
      for (const config of nestedIndexConfigs) {
        const index = new NestedCardIndex(
          config.getKey1,
          config.getKey2,
          config.validator ?? defaultValidator
        );
        this.nestedIndices.set(config.name, index);
        this.indexList.push(index);
      }
    }
  }
  insert(card) {
    const existing = this.all.get(card.cardId);
    if (existing) this.remove(existing);
    this.all.set(card.cardId, card);
    if (card.state.released) this.allReleased.set(card.cardId, card);
    for (const index of this.indexList) {
      index.insert(card);
    }
  }
  remove(card) {
    this.all.delete(card.cardId);
    this.allReleased.delete(card.cardId);
    for (const index of this.indexList) {
      index.remove(card);
    }
  }
  get(cardId) {
    return this.all.get(cardId);
  }
  has(cardId) {
    return this.all.has(cardId);
  }
  clear() {
    this.all.clear();
    this.allReleased.clear();
    for (const index of this.indexList) {
      index.clear();
    }
  }
  getIndex(name) {
    return this.indices.get(name);
  }
  getNestedIndex(name) {
    return this.nestedIndices.get(name);
  }
};

// src/CardEngine/CardPoolCache.ts
var import_node_events = require("events");
var CardPoolCache = class extends import_node_events.EventEmitter {
  constructor(cardSchema, indexConfigs, nestedIndexConfigs) {
    super();
    this.cardSchema = cardSchema;
    this.indexConfigs = indexConfigs;
    this.nestedIndexConfigs = nestedIndexConfigs;
  }
  pool = null;
  initPromise = null;
  refreshQueue = Promise.resolve();
  version = 0;
  get cardPool() {
    if (!this.pool) throw new Error("Card pool not initialized");
    return this.pool;
  }
  async init() {
    if (this.pool) return this;
    if (!this.initPromise) {
      this.initPromise = this.refreshAll().catch((err) => {
        this.initPromise = null;
        throw err;
      });
    }
    await this.initPromise;
    return this;
  }
  enqueue(fn) {
    this.refreshQueue = this.refreshQueue.then(() => {
      this.initPromise ?? Promise.resolve();
    }).then(() => fn()).catch((err) => {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
      throw err;
    });
    return this.refreshQueue;
  }
  async fetchAndReplacePool() {
    const myVersion = ++this.version;
    const cards = await this.cardSchema.fetchAll();
    if (myVersion !== this.version) return;
    const pool = new CardPool(this.indexConfigs, this.nestedIndexConfigs);
    for (const card of cards) pool.insert(card);
    this.pool = pool;
    this.emit("refreshed", cards.length);
  }
  async refreshAll() {
    await this.enqueue(() => this.fetchAndReplacePool());
  }
  async refreshMany(cardIds) {
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
  async removeMany(cardIds) {
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
};

// src/MediaTools/renderers/CardGalleryRenderer.ts
var import_sharp2 = __toESM(require("sharp"));

// src/MediaTools/utils/ImageUtils.ts
var import_axios = __toESM(require("axios"));
var import_discord = require("discord.js");
var import_qznt = require("qznt");
var import_sharp = __toESM(require("sharp"));
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

// src/MediaTools/renderers/CardGalleryRenderer.ts
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

// src/MediaTools/utils/BunnyCDN.ts
var import_axios2 = __toESM(require("axios"));
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

// src/MediaTools/utils/CanvasUtils.ts
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

// src/CardEngine/CardPoolEngine.ts
var import_node_events2 = require("events");
var import_qznt3 = require("qznt");
function buildCardFilename(namePrefix, imageUrl) {
  const imageExt = imageUrl.split("?").shift()?.split(".").pop();
  return `${namePrefix.toUpperCase()}_CARD_${Date.now()}${(0, import_qznt3.str)(2, "alpha", { casing: "upper" })}.${imageExt}`;
}
function compileWeightPool(dropRates) {
  const totalRawBaseWeight = dropRates.tiers.reduce((acc, cur) => acc + 1 / cur.oneIn, 0);
  return dropRates.tiers.map((tier) => {
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
var CardPoolEngine = class extends import_node_events2.EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.cache = new CardPoolCache(config.cardSchema, config.indices, config.nestedIndices);
    this.compiledDropRates = compileWeightPool(config.dropRates);
    this.cache.on("refreshed", (count) => this.emit("refreshed", count));
    this.cache.on("cardInserted", (card) => this.emit("cardInserted", card));
    this.cache.on("cardRemoved", (card) => this.emit("cardRemoved", card));
    this.cache.on("cardUpdated", (card, oldCard) => this.emit("cardUpdated", card, oldCard));
    this.cache.on("error", (err) => this.emit("error", err));
  }
  cache;
  compiledDropRates;
  initialized = false;
  get pool() {
    return this.cache.cardPool;
  }
  async init() {
    await this.cache.init();
    this.initialized = true;
    this.emit("initialized");
    return this;
  }
  async ensureInit() {
    if (!this.initialized) await this.init();
  }
  /** Fuzzy searches the card pool and returns a list of cards. */
  fuzzySearch(query, options) {
    const pool = this.cache.cardPool;
    const source = options?.released ? pool.allReleased : pool.all;
    const lowerQuery = query.toLowerCase();
    const results = [];
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
    const formatted = sorted.map(
      (card) => this.config.fuzzySearch.fields.map((f) => f.getter(card)).filter(Boolean).join(" \xB7 ")
    );
    return {
      results: sorted,
      formatted,
      nv: sorted.map((card, idx) => ({ name: formatted[idx], value: card.cardId }))
    };
  }
  /** Fuzzy searches the card pool and returns a list of cards by their identity properties. */
  fuzzySearchIdentity(query, options) {
    const pool = this.cache.cardPool;
    const lowerQuery = query.toLowerCase();
    const limit = options?.limit ?? 25;
    const results = [];
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
      results: results.map((r) => ({ key: r.key, cardIds: r.cardIds })),
      formatted: results.map((r) => r.nv.name),
      nv: results.map((r) => r.nv)
    };
  }
  /** Gets a card from the card pool. */
  get(cardId, released) {
    const pool = this.cache.cardPool;
    return released ? pool.allReleased.get(cardId) : pool.all.get(cardId);
  }
  getMany(cardIds, released) {
    const pool = this.cache.cardPool;
    const results = [];
    for (const cardId of cardIds) {
      const card = released ? pool.allReleased.get(cardId) : pool.all.get(cardId);
      if (card) results.push(card);
    }
    return this.sort(results);
  }
  /** Samples a number of cards from the card pool. */
  sample(limit, options) {
    const pool = this.cache.cardPool;
    const picked = new Set(options?.excludeCardIds);
    const results = [];
    for (let i = 0; i < limit; i++) {
      const selectedType = (0, import_qznt3.weighted)(this.compiledDropRates, (t) => t.compiledWeight);
      let selectedRarity;
      if (selectedType.rarities) {
        selectedRarity = (0, import_qznt3.weighted)(selectedType.rarities, (r) => r.compiledWeight).rarity;
      }
      let candidates;
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
      const available = Array.from(candidates).filter((id) => !picked.has(id));
      if (!available.length) return [[], "Not enough cards were available to drop."];
      const cardId = (0, import_qznt3.choice)(available);
      picked.add(cardId);
      results.push(pool.all.get(cardId));
    }
    return [results];
  }
  /** Samples a number of cards from the card pool and modifies them, then returns the modified cards. */
  async sampleAndModify(limit, update, options) {
    const [cards, failReason] = this.sample(limit, options);
    if (failReason) return [[], failReason];
    const modifiedCards = await this.modifyMany(
      cards.map((c) => c.cardId),
      update
    );
    if (!modifiedCards.length) return [[], "Failed to modify cards."];
    return [modifiedCards];
  }
  /** Sorts a list of cards by an opinionated order. */
  sort(cards) {
    return [...cards].sort(this.config.sortFn);
  }
  /** Creates a new card in the database and uploads its image to the CDN. */
  async insert(data, stageFns) {
    await this.ensureInit();
    const existing = this.pool.get(data.card.cardId);
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
      { ...data.card, asset: { imageUrl: imageResult.cdnUrl, cdn: { filePath: imageResult.path } } }
    ]);
    if (!card) throw new Error("Failed to insert card into database");
    await stageFns?.[2]();
    await this.cache.refreshMany([card.cardId]);
    return card;
  }
  /** Modifies a card in the database. Supports atomic operators e.g. $inc. */
  async modify(cardId, update) {
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
  async modifyMany(cardIds, update) {
    await this.ensureInit();
    const oldCards = cardIds.map((id) => this.pool.get(id));
    if (oldCards.length !== cardIds.length) return [];
    const updateRes = await this.config.cardSchema.updateAll({ cardId: { $in: cardIds } }, update);
    if (updateRes.modifiedCount !== cardIds.length) return [];
    const updated = await this.config.cardSchema.fetchAll({ cardId: { $in: cardIds } });
    if (updated.length !== cardIds.length) return [];
    updated.forEach((card) => {
      this.pool.insert(card);
      this.emit(
        "cardUpdated",
        card,
        oldCards.find((c) => c?.cardId === card.cardId)
      );
    });
    return updated;
  }
  /** Removes a card from the database and CDN, and clears it from player inventories. */
  async delete(cardId) {
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
  async swapImage(cardId, newImageUrl, options) {
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
      { "asset.imageUrl": imageResult.cdnUrl, "asset.cdn.filePath": imageResult.path },
      { returnDocument: "after" }
    );
    if (!updated) return null;
    this.pool.insert(updated);
    this.emit("cardUpdated", updated, oldCard);
    return updated;
  }
  /** Releases a batch of cards and updates the cache. */
  async release(cardIds) {
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
  async refresh(cardIds) {
    if (cardIds) {
      await this.cache.refreshMany(cardIds);
    } else {
      await this.cache.refreshAll();
    }
  }
};
function createCardPoolEngine(config) {
  const engine = new CardPoolEngine(config);
  let initPromise = null;
  const useCardEngine = async () => {
    if (initPromise) return initPromise;
    initPromise = engine.init();
    return initPromise;
  };
  const useCardPool = async () => {
    const eng = await useCardEngine();
    return eng.pool;
  };
  return { engine, useCardEngine, useCardPool };
}

// src/CardEngine/InventoryEngine.ts
var InventoryEngine = class {
  useCardEngine;
  inventoryCardSchema;
  constructor(config) {
    this.useCardEngine = config.useCardEngine;
    this.inventoryCardSchema = config.inventoryCardSchema;
  }
  async fetch(invIds, options = {}) {
    const { userId, projection } = options;
    const isArray = Array.isArray(invIds);
    const cardIdsArray = isArray ? invIds : [invIds];
    const invCards = await this.inventoryCardSchema.fetchAll(
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
    const invCards = await this.inventoryCardSchema.fetchAll({ ...userId && { userId } }, projection);
    return this.mapCards(invCards);
  }
  /** Maps inventory cards to their actual card, filtering out cards that don't exist. */
  async mapCards(invCards) {
    const cardEngine = await this.useCardEngine();
    return invCards.map((invCard) => ({ card: cardEngine.get(invCard.cardId), invCard })).filter(({ card }) => card);
  }
};
function createInventoryEngine(config) {
  const engine = new InventoryEngine(config);
  const useInventoryEngine = () => engine;
  return { engine, useInventoryEngine };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  BunnyCDN,
  CanvasUtils,
  CardGalleryRenderer,
  CardIndex,
  CardPool,
  CardPoolCache,
  CardPoolEngine,
  ImageManager,
  InventoryEngine,
  NestedCardIndex,
  createCardPoolEngine,
  createInventoryEngine,
  useBunnyCDN
});
//# sourceMappingURL=index.cjs.map