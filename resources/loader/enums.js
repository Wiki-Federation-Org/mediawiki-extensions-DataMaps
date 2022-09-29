module.exports = {
    CRSOrigin: {
        TopLeft: 1,
        BottomLeft: 2
    },

    CollectibleType: {
        // Corresponds to CM_ constants in Data\MarkerGroupSpec
        Individual: 1,
        Group: 2,
        GlobalGroup: 3
    },

    MarkerGroupFlags: {
        IsNumberedInChecklists: 1<<0,
        CannotBeSearched: 1<<1,
        IsUnselected: 1<<2,
        Collectible_Individual: 1<<3,
        Collectible_Group: 1<<4,
        Collectible_GlobalGroup: 1<<5
    }
};