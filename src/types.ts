export type PluginSettings = {
    defaultColor: string;
    showColorPicker: boolean;
    showMassiveThreshold: boolean;
}


export type Feature = {
    name?: string;
    type?: string;
    desc?: string;
    tokens?: number;
    flavor?: string;
    // TODO: cost?
}

export type Adversary = {
    name?: string;
    tier?: number;
    type?: string;
    difficulty?: string;

    weapon?: string;
    range?: string;
    damage?: string;

    // these are for environments
    tone?: string;
    impulses?: string;
    adversaries?: string;

    hp?: number;
    stress?: number;
    thresholds?: number[];
    attack?: string;
    xp?: string[];
    motives?: string;
    desc?: string;
    source?: string;
    features?: Feature[]
    count?: number;
    id?: string;
    // TODO:
    // syncProperties?: boolean
};

export type PluginState = {
    settings: PluginSettings;
    cards: {
        [id: string]: {
            color?: string;
            stats?: {
                hp?: number;
                stress?: number;
            }[];
            tokens?: { [featureName: string]: number }
        }
    }
}
