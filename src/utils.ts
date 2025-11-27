import type { Adversary } from './ui';
import { TFile, TFolder } from "obsidian";
import ADV_LIBRARY_DATA from '../data/adversaries.json';
import ENV_LIBRARY_DATA from '../data/environments.json';

export const ADV_LIBRARY: Adversary[] = ADV_LIBRARY_DATA as any;
export const ENV_LIBRARY: Adversary[] = ENV_LIBRARY_DATA as any;

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

export const DICE_PATTERN = /(\b\d+d\d+(?:\+\d+d\d+)*(?:\+\d+)?\b)/g;

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
        obj.thresholds = obj.thresholds.split(/[,/]/).filter((s: string) => s.trim().toLowerCase() != 'none');
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

    // TODO: clean up stray keys

    return obj;
}

export async function walkFolder(folder: TFolder, callback: (file: TFile) => Promise<void>) {
    for (const child of folder.children) {
        if (child instanceof TFile) {
            await callback(child);
        } else if (child instanceof TFolder) {
            await walkFolder(child, callback); // recurse
        }
    }
}
