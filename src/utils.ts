import type { Adversary } from './ui';

export const ADV_LIBRARY: Adversary[] = require('../data/adversaries.json');
export const ENV_LIBRARY: Adversary[] = require('../data/environments.json');

export const ADV_TEMPLATE = `\`\`\`daggerheart
name:
tier:
type:
desc:
difficulty:

attack:
thresholds:
hp:
stress:
xp:
motives:

weapon:
range:
damage:

features:
- name:
  type:
  desc:
\`\`\`
`

export const ENV_TEMPLATE = `\`\`\`daggerheart
name:
tier:
type:
desc:
difficulty:

tone:
impulses:
adversaries:

features:
- name:
  type:
  desc:
  flavor:
\`\`\`
`

export const DICE_PATTERN = /\b\d+d\d+(\+\d+d\d+)*(\+\d+)?\b/g;

export function hexToRgb(hex: string) {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
    const num = parseInt(hex, 16);
    const rgb = [num >> 16, (num >> 8) & 255, num & 255];
    return `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`;
}

export function processAdversary(obj: any, filePath: string): Adversary {
    if (typeof obj.attack === 'number') {
        obj.attack = obj.attack > 0 ? `+${obj.attack}` : `${obj.attack}`;
    }
    if (typeof obj.thresholds === "string") {
        obj.thresholds = obj.thresholds.split(/[,\/]/).filter((s: string) => s.trim().toLowerCase() != 'none');
    }
    if (typeof obj.thresholds === "number") {
        obj.thresholds = [obj.thresholds];
    }
    if (typeof obj.xp === "string") {
        obj.xp = obj.xp.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
    }

    obj.id ??= `${filePath}::${obj.name || ''}`;
    obj.hp ??= 0;
    obj.stress ??= 0;
    obj.xp ??= [];
    obj.thresholds ??= [];
    obj.features ??= [];

    return obj;
}

