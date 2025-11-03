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

count:
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

export function reviver(key: any, value: any): any {
    if (key == 'attack' && typeof value === 'number') {
        return value > 0 ? `+${value}` : `${value}`;
    }
    if (key == 'thresholds') {
        if (typeof value === "string") return value.split(/[,\/]/).filter((s) => s.trim().toLowerCase() != 'none');
        if (typeof value === "number") return [value];
    }
    if (key == 'xp') {
        if (typeof value === "string") return value.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    }
    return value;
}

