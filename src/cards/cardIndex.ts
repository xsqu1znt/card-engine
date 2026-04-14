import type { CardLike } from "@/types/card.types.js";

export type KeyGetter<T, K> = (card: T) => K | undefined;
export type Validator<T> = (card: T) => boolean;

export class CardIndex<T extends CardLike, K extends string | number = string | number> {
    private readonly items: Map<K, Set<string>> = new Map();

    constructor(
        /** Example: "byName" */
        readonly name: string,
        private readonly getKey: KeyGetter<T, K>,
        private readonly validator: Validator<T>
    ) {}

    insert(card: T): void {
        if (!this.validator(card)) return;
        const key = this.getKey(card);
        if (key === undefined) return;

        const bucket = this.items.get(key) ?? new Set();
        bucket.add(card.cardId);
        this.items.set(key, bucket);
    }

    remove(card: T): void {
        const key = this.getKey(card);
        if (!key) return;

        this.items.get(key)?.delete(card.cardId);
    }

    get(key: K): ReadonlySet<string> {
        return this.items.get(key) ?? new Set();
    }

    has(key: K): boolean {
        return this.items.has(key);
    }

    clear(): void {
        this.items.clear();
    }

    entries(): [K, ReadonlySet<string>][] {
        return Array.from(this.items.entries());
    }

    keys(): K[] {
        return Array.from(this.items.keys());
    }

    values(): ReadonlySet<string>[] {
        return Array.from(this.items.values());
    }
}

export class NestedCardIndex<
    T extends CardLike,
    K1 extends string | number = string | number,
    K2 extends string | number = string | number
> {
    private readonly items: Map<K1, Map<K2, Set<string>>> = new Map();

    constructor(
        readonly name: string,
        private readonly getKey1: KeyGetter<T, K1>,
        private readonly getKey2: KeyGetter<T, K2>,
        private readonly validator: Validator<T>
    ) {}

    insert(card: T): void {
        if (!this.validator(card)) return;
        const k1 = this.getKey1(card);
        const k2 = this.getKey2(card);
        if (k1 === undefined || k2 === undefined) return;

        const outer = this.items.get(k1) ?? new Map();
        if (!outer) this.items.set(k1, outer);

        const bucket = outer.get(k2) ?? new Set();
        bucket.add(card.cardId);
        this.items.set(k1, bucket);
    }

    remove(card: T): void {
        const k1 = this.getKey1(card);
        const k2 = this.getKey2(card);
        if (k1 === undefined || k2 === undefined) return;
        this.items.get(k1)?.get(k2)?.delete(card.cardId);
    }

    get(k1: K1, k2: K2 | undefined): ReadonlySet<string> {
        if (k2 === undefined) return new Set();
        return this.items.get(k1)?.get(k2) ?? new Set();
    }

    clear(): void {
        this.items.clear();
    }
}

/** Fallback validator applied to indices that don't specify one. */
const DEFAULT_VALIDATOR = <T extends CardLike>(card: T): boolean => card.state.released && card.state.droppable;

export function createCardIndex<T extends CardLike, K extends string | number>(
    name: string,
    getKey: KeyGetter<T, K>,
    /** @defaultBehavior Only allows `state.released` and `state.droppable` cards to be indexed. */
    validator?: Validator<T>
): CardIndex<T, K> {
    return new CardIndex(name, getKey, validator ?? DEFAULT_VALIDATOR);
}

export function createNestedCardIndex<
    T extends CardLike,
    K1 extends string | number = string | number,
    K2 extends string | number = string | number
>(
    name: string,
    getKey1: KeyGetter<T, K1>,
    getKey2: KeyGetter<T, K2>,
    /** @defaultBehavior Only allows `state.released` and `state.droppable` cards to be indexed. */
    validator?: Validator<T>
): NestedCardIndex<T, K1, K2> {
    return new NestedCardIndex(name, getKey1, getKey2, validator ?? DEFAULT_VALIDATOR);
}
