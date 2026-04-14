import { CardLike, InventoryCardLike, MappedInventoryCard } from "@/types/card.types";
import { ProjectionType } from "mongoose";
import { MongoSchemaBuilder } from "vimcord";
import { CardPoolEngine } from "./CardPoolEngine";

interface FetchInventoryCardOptions<InvCard extends InventoryCardLike> {
    userId?: string;
    projection?: ProjectionType<InvCard>;
}

export interface InventoryEngineConfig<Card extends CardLike, InvCard extends InventoryCardLike> {
    useCardEngine: () => Promise<CardPoolEngine<Card>>;
    inventoryCardSchema: MongoSchemaBuilder<InvCard>;
}

export class InventoryEngine<Card extends CardLike, InvCard extends InventoryCardLike> {
    private useCardEngine: () => Promise<CardPoolEngine<Card>>;
    private inventoryCardSchema: MongoSchemaBuilder<InvCard>;

    constructor(config: InventoryEngineConfig<Card, InvCard>) {
        this.useCardEngine = config.useCardEngine;
        this.inventoryCardSchema = config.inventoryCardSchema;
    }

    /** Fetches an inventory card and maps it to its actual card. */
    async fetch(
        invId: string,
        options?: FetchInventoryCardOptions<InvCard>
    ): Promise<MappedInventoryCard<Card, InvCard> | undefined>;
    async fetch(
        invIds: string | string[],
        options?: FetchInventoryCardOptions<InvCard>
    ): Promise<MappedInventoryCard<Card, InvCard>[]>;
    async fetch(
        invIds: string | string[],
        options: FetchInventoryCardOptions<InvCard> = {}
    ): Promise<(MappedInventoryCard<Card, InvCard> | undefined) | MappedInventoryCard<Card, InvCard>[]> {
        const { userId, projection } = options;

        const isArray = Array.isArray(invIds);
        const cardIdsArray = isArray ? invIds : [invIds];
        const invCards = await this.inventoryCardSchema.fetchAll(
            {
                ...(userId && { userId }),
                invId: { $in: cardIdsArray }
            },
            projection
        );

        const mapped = await this.mapCards(invCards);
        return isArray ? mapped : mapped[0];
    }

    async fetchAll(options: FetchInventoryCardOptions<InvCard> = {}): Promise<MappedInventoryCard<Card, InvCard>[]> {
        const { userId, projection } = options;

        const invCards = await this.inventoryCardSchema.fetchAll({ ...(userId && { userId }) }, projection);
        return this.mapCards(invCards);
    }

    /** Maps inventory cards to their actual card, filtering out cards that don't exist. */
    async mapCards(invCards: InvCard[]): Promise<MappedInventoryCard<Card, InvCard>[]> {
        const cardEngine = await this.useCardEngine();
        return (
            invCards
                // NOTE: I asserted here just for the type, it'll never throw because of filtering
                .map(invCard => ({ card: cardEngine.get(invCard.cardId)!, invCard }))
                .filter(({ card }) => card)
        );
    }
}

export function createInventoryEngine<Card extends CardLike, InvCard extends InventoryCardLike>(
    config: InventoryEngineConfig<Card, InvCard>
) {
    const engine = new InventoryEngine<Card, InvCard>(config);
    const useInventoryEngine = (): InventoryEngine<Card, InvCard> => engine;
    return { engine, useInventoryEngine };
}
