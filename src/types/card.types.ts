export interface CardLike {
    cardId: string;
    asset: { imageUrl: string; cdn: { filePath: string } };
    state: {
        released: boolean;
        droppable: boolean;
    };
}

export interface InventoryCardLike {
    userId: string;
    cardId: string;
}

export interface MappedInventoryCard<
    Card extends CardLike = CardLike,
    InvCard extends InventoryCardLike = InventoryCardLike
> {
    card: Card;
    invCard: InvCard;
}
