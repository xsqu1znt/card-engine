import { CardLike } from "@/types/card.types";
import type { ICardIndex, IndexConfig, NestedIndexConfig } from "@/types/CardEngine.types";
import { CardIndex, NestedCardIndex } from "./CardIndex";

const defaultValidator = <T extends CardLike>(card: T): boolean => card.state.released && card.state.droppable;

export class CardPool<T extends CardLike> {
    readonly all = new Map<string, T>();
    readonly allReleased = new Map<string, T>();
    readonly indices = new Map<string, CardIndex<T, any>>();
    readonly nestedIndices = new Map<string, NestedCardIndex<T, any, any>>();
    private readonly indexList: ICardIndex<T>[] = [];

    constructor(indexConfigs: IndexConfig<T, any>[], nestedIndexConfigs?: NestedIndexConfig<T, any, any>[]) {
        for (const config of indexConfigs) {
            const index = new CardIndex<T, any>(config.getKey, config.validator ?? defaultValidator);
            this.indices.set(config.name, index);
            this.indexList.push(index);
        }

        if (nestedIndexConfigs) {
            for (const config of nestedIndexConfigs) {
                const index = new NestedCardIndex<T, any, any>(
                    config.getKey1,
                    config.getKey2,
                    config.validator ?? defaultValidator
                );
                this.nestedIndices.set(config.name, index);
                this.indexList.push(index);
            }
        }
    }

    insert(card: T): void {
        const existing = this.all.get(card.cardId);
        if (existing) this.remove(existing);

        this.all.set(card.cardId, card);
        if (card.state.released) this.allReleased.set(card.cardId, card);

        for (const index of this.indexList) {
            index.insert(card);
        }
    }

    remove(card: T): void {
        this.all.delete(card.cardId);
        this.allReleased.delete(card.cardId);

        for (const index of this.indexList) {
            index.remove(card);
        }
    }

    get(cardId: string): T | undefined {
        return this.all.get(cardId);
    }

    has(cardId: string): boolean {
        return this.all.has(cardId);
    }

    clear(): void {
        this.all.clear();
        this.allReleased.clear();
        for (const index of this.indexList) {
            index.clear();
        }
    }

    getIndex<K>(name: string): CardIndex<T, K> | undefined {
        return this.indices.get(name);
    }

    getNestedIndex<K1, K2>(name: string): NestedCardIndex<T, K1, K2> | undefined {
        return this.nestedIndices.get(name);
    }
}
