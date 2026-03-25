export interface CardLike {
    cardId: string;
    asset: { imageUrl: string; cdn: { filePath: string } };
    state: {
        released: boolean;
        droppable: boolean;
    };
}
