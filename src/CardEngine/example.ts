/**
 * Example: Setting up and using the CardPoolEngine
 *
 * This file demonstrates how to configure and use the CardPoolEngine
 * with a custom card schema and type.
 */

import type { MongoSchemaBuilder } from "vimcord";
import { createCardPoolEngine } from "./index";

// ============================================================================
// Step 1: Define your bot-specific card interface
// ============================================================================

enum CardType {
    Regular = 0,
    Event = 10,
    Special = 20
}

enum CardTier {
    None = 0,
    Bronze = 1,
    Silver = 2,
    Gold = 3
}

interface ICustomCard {
    cardId: string;

    identity: {
        name: string;
        group: string;
        subgroup?: string;
        era?: string;
        version: number;
    };

    class: {
        type: CardType;
        tier: CardTier;
        rarity?: number;
    };

    visual?: {
        emoji?: string;
        colorPalette?: string[];
    };

    asset: {
        imageUrl: string;
        cdn: { filePath: string };
    };

    state: {
        released: boolean;
        droppable: boolean;
        tradeable: boolean;
    };
}

// ============================================================================
// Step 2: Create your MongoDB schema (outside the engine)
// ============================================================================

// This would normally be in your db/schemas/card.schema.ts
// import { createMongoSchema } from "vimcord";
// export const CardSchema = createMongoSchema<ICustomCard>("Cards", {...});

declare const CardSchema: MongoSchemaBuilder<ICustomCard>;

// ============================================================================
// Step 3: Configure and create the engine
// ============================================================================

export const { engine, useCardEngine, useCardPool } = createCardPoolEngine<ICustomCard>({
    // Your MongoDB schema builder
    cardSchema: CardSchema,

    // Define your indices - these are used for fast lookups and identity searches
    indices: [
        {
            name: "byName",
            getKey: c => c.identity.name
        },
        {
            name: "byGroup",
            getKey: c => c.identity.group
        },
        {
            name: "bySubgroup",
            getKey: c => c.identity.subgroup,
            validator: c => c.identity.subgroup !== undefined // Only index cards with subgroups
        },
        {
            name: "byEra",
            getKey: c => c.identity.era,
            validator: c => c.identity.era !== undefined
        },
        {
            name: "byType",
            getKey: c => c.class.type
        },
        {
            name: "byTier",
            getKey: c => c.class.tier
        },
        {
            name: "byRarity",
            getKey: c => c.class.rarity,
            validator: c => c.class.rarity !== undefined
        }
    ],

    // Nested indices for compound lookups (e.g., type + rarity)
    nestedIndices: [
        {
            name: "byTypeRarity",
            getKey1: c => c.class.type,
            getKey2: c => c.class.rarity,
            validator: c => c.class.rarity !== undefined
        }
    ],

    // Drop rates configuration for the sampling/drop system
    // This defines the weighted probability distribution
    dropRates: {
        tiers: [
            {
                type: CardType.Regular,
                oneIn: 1, // Base weight
                rarities: [
                    { rarity: 1, oneIn: 2 },
                    { rarity: 2, oneIn: 5 },
                    { rarity: 3, oneIn: 10 },
                    { rarity: 4, oneIn: 25 },
                    { rarity: 5, oneIn: 100 }
                ]
            },
            {
                type: CardType.Event,
                oneIn: 10, // 10x rarer than Regular
                rarities: [
                    { rarity: 1, oneIn: 2 },
                    { rarity: 2, oneIn: 5 }
                ]
            },
            {
                type: CardType.Special,
                oneIn: 50 // 50x rarer than Regular
            }
        ]
    },

    // Fuzzy search configuration - which fields to search
    fuzzySearch: {
        fields: [
            { name: "cardId", getter: c => c.cardId },
            { name: "name", getter: c => c.identity.name },
            { name: "group", getter: c => c.identity.group },
            { name: "era", getter: c => c.identity.era }
        ]
    },

    // Custom sort function for cards
    sortFn: (a, b) => {
        // Sort by: tier → type → rarity → group → name → era
        const tierDiff = a.class.tier - b.class.tier;
        if (tierDiff !== 0) return tierDiff;

        const typeDiff = a.class.type - b.class.type;
        if (typeDiff !== 0) return typeDiff;

        const rarityDiff = (a.class.rarity ?? 0) - (b.class.rarity ?? 0);
        if (rarityDiff !== 0) return rarityDiff;

        const groupDiff = a.identity.group.localeCompare(b.identity.group);
        if (groupDiff !== 0) return groupDiff;

        const nameDiff = a.identity.name.localeCompare(b.identity.name);
        if (nameDiff !== 0) return nameDiff;

        if (a.identity.era && b.identity.era) {
            return a.identity.era.localeCompare(b.identity.era);
        }

        return 0;
    }
});

// ============================================================================
// Step 4: Listen to engine events (optional)
// ============================================================================

engine.on("initialized", () => {
    console.log("Card pool engine initialized!");
});

engine.on("refreshed", count => {
    console.log(`Card pool refreshed with ${count} cards`);
});

engine.on("cardInserted", card => {
    console.log(`Card inserted: ${card.cardId}`);
});

engine.on("cardRemoved", card => {
    console.log(`Card removed: ${card.cardId}`);
});

engine.on("cardUpdated", (card, oldCard) => {
    console.log(`Card updated: ${card.cardId}`);
});

engine.on("error", error => {
    console.error("Card pool engine error:", error);
});

// ============================================================================
// Step 5: Usage Examples
// ============================================================================

async function examples(): Promise<void> {
    // Initialize the engine (auto-initializes on first use)
    const cardEngine = await useCardEngine();
    const pool = await useCardPool();

    // --- Search Examples ---

    // Fuzzy search across configured fields
    const searchResults = cardEngine.fuzzySearch("jimin", { limit: 10, released: true });
    console.log("Search results:", searchResults.formatted);

    // Identity search (uses indices)
    const identityResults = cardEngine.fuzzySearchIdentity("BTS", { limit: 5 });
    console.log("Identity matches:", identityResults.formatted);

    // Get specific card
    const card = cardEngine.get("CARD_001", true); // true = only released
    if (card) {
        console.log(`Found card: ${card.identity.name}`);
    }

    // Get multiple cards
    const cards = cardEngine.getMany(["CARD_001", "CARD_002", "CARD_003"], true);
    console.log(`Retrieved ${cards.length} cards`);

    // --- Sampling Examples ---

    // Sample 3 random cards using weighted drop rates
    const sample = cardEngine.sample(3);
    if (sample.cards.length > 0) {
        console.log(
            "Sampled cards:",
            sample.cards.map(c => c.cardId)
        );
    } else {
        console.log("Sampling failed:", sample.failReason);
    }

    // Sample with exclusions
    const excludeIds = ["CARD_001", "CARD_002"];
    const sampleWithExclusions = cardEngine.sample(3, { excludeCardIds: excludeIds });

    // --- CRUD Examples ---

    // Create a new card
    const newCard = await cardEngine.insert({
        cardId: "CARD_NEW",
        identity: {
            name: "New Card",
            group: "Test Group",
            version: 1
        },
        class: {
            type: CardType.Regular,
            tier: CardTier.None,
            rarity: 1
        },
        asset: {
            imageUrl: "https://cdn.example.com/cards/new.png",
            cdn: { filePath: "cards/new.png" }
        },
        state: {
            released: false,
            droppable: true,
            tradeable: true
        }
    });

    // Update a card
    const updated = await cardEngine.update("CARD_NEW", {
        state: { released: true, droppable: true, tradeable: true }
    });

    // Delete a card
    const deleted = await cardEngine.delete("CARD_NEW");
    if (deleted) {
        console.log("Card deleted successfully");
    }

    // --- Pool Access ---

    // Access raw pool data
    console.log(`Total cards: ${pool.all.size}`);
    console.log(`Released cards: ${pool.allReleased.size}`);

    // Access specific indices
    const byGroup = pool.getIndex<string>("byGroup");
    if (byGroup) {
        const btsCards = byGroup.get("BTS");
        console.log(`BTS cards: ${btsCards.size}`);
    }

    // Access nested index
    const byTypeRarity = pool.getNestedIndex<CardType, number>("byTypeRarity");
    if (byTypeRarity) {
        const regularRarity3 = byTypeRarity.get(CardType.Regular, 3);
        console.log(`Regular rarity 3 cards: ${regularRarity3.size}`);
    }

    // Sort cards
    const allCards = Array.from(pool.all.values());
    const sortedCards = cardEngine.sort(allCards);
}

// ============================================================================
// Step 6: Advanced Usage - Multiple Engine Instances
// ============================================================================

// You can create multiple engines for different card types or bot features
interface ISpecialCard extends ICustomCard {
    specialPower: string;
}

declare const SpecialCardSchema: MongoSchemaBuilder<ISpecialCard>;

const specialKit = createCardPoolEngine<ISpecialCard>({
    cardSchema: SpecialCardSchema,
    indices: [
        { name: "byName", getKey: c => c.identity.name },
        { name: "byPower", getKey: c => c.specialPower }
    ],
    dropRates: {
        tiers: [{ type: "special", oneIn: 1 }]
    },
    fuzzySearch: {
        fields: [
            { name: "name", getter: c => c.identity.name },
            { name: "power", getter: c => c.specialPower }
        ]
    },
    sortFn: (a, b) => a.cardId.localeCompare(b.cardId)
});

// Export the special kit for use elsewhere
export const { engine: specialEngine, useCardEngine: useSpecialEngine } = specialKit;

// ============================================================================
// Usage in Discord Commands
// ============================================================================

/*
// Example Discord.js slash command
import { useCardEngine } from "@/core/cardEngine";

export default {
    name: "drop",
    description: "Drop some cards",
    
    async execute(interaction) {
        const engine = await useCardEngine();
        
        const result = engine.sample(3);
        if (result.failReason) {
            return interaction.reply("Not enough cards available!");
        }
        
        const cards = result.cards;
        const cardNames = cards.map(c => c.identity.name).join(", ");
        
        await interaction.reply(`You dropped: ${cardNames}`);
    }
};
*/

// Run examples (would be called in your bot startup)
// examples().catch(console.error);
