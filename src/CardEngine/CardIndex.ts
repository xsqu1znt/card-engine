import { CardLike } from "@/types/card.types";
import type { ICardIndex, KeyExtractor, Validator } from "@/types/CardEngine.types";

export class CardIndex<T extends CardLike, K> implements ICardIndex<T> {
    private readonly map = new Map<K, Set<string>>();

    constructor(
        private readonly getKey: KeyExtractor<T, K>,
        private readonly validator?: Validator<T>
    ) {}

    insert(card: T): void {
        if (this.validator && !this.validator(card)) return;
        const key = this.getKey(card);
        if (key === undefined) return;

        let bucket = this.map.get(key);
        if (!bucket) this.map.set(key, (bucket = new Set()));
        bucket.add(card.cardId);
    }

    remove(card: T): void {
        const key = this.getKey(card);
        if (key === undefined) return;
        this.map.get(key)?.delete(card.cardId);
    }

    get(key: K): ReadonlySet<string> {
        return this.map.get(key) ?? CardIndex.EMPTY;
    }

    has(key: K): boolean {
        return this.map.has(key);
    }

    entries(): [K, ReadonlySet<string>][] {
        return Array.from(this.map.entries());
    }

    keys(): K[] {
        return Array.from(this.map.keys());
    }

    values(): ReadonlySet<string>[] {
        return Array.from(this.map.values());
    }

    clear(): void {
        this.map.clear();
    }

    private static readonly EMPTY: ReadonlySet<string> = new Set();
}

export class NestedCardIndex<T extends CardLike, K1, K2> implements ICardIndex<T> {
    private readonly map = new Map<K1, Map<K2, Set<string>>>();

    constructor(
        private readonly getKey1: KeyExtractor<T, K1>,
        private readonly getKey2: KeyExtractor<T, K2>,
        private readonly validator?: Validator<T>
    ) {}

    insert(card: T): void {
        if (this.validator && !this.validator(card)) return;
        const k1 = this.getKey1(card);
        const k2 = this.getKey2(card);
        if (k1 === undefined || k2 === undefined) return;

        let outer = this.map.get(k1);
        if (!outer) this.map.set(k1, (outer = new Map()));

        let bucket = outer.get(k2);
        if (!bucket) outer.set(k2, (bucket = new Set()));
        bucket.add(card.cardId);
    }

    remove(card: T): void {
        const k1 = this.getKey1(card);
        const k2 = this.getKey2(card);
        if (k1 === undefined || k2 === undefined) return;
        this.map.get(k1)?.get(k2)?.delete(card.cardId);
    }

    get(key1: K1, key2: K2): ReadonlySet<string> {
        return this.map.get(key1)?.get(key2) ?? NestedCardIndex.EMPTY;
    }

    getOuter(key1: K1): ReadonlyMap<K2, Set<string>> {
        return this.map.get(key1) ?? NestedCardIndex.EMPTY_MAP;
    }

    clear(): void {
        this.map.clear();
    }

    private static readonly EMPTY: ReadonlySet<string> = new Set<string>();
    private static readonly EMPTY_MAP: ReadonlyMap<never, never> = new Map<never, never>();
}
