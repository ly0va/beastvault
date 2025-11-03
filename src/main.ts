import { Editor, Plugin } from 'obsidian';
import * as yaml from 'yaml';
import { SettingTab, type PluginSettings, DEFAULT_SETTINGS } from './settings';
import { ADV_LIBRARY, ENV_LIBRARY, ADV_TEMPLATE, ENV_TEMPLATE, reviver } from './utils';
import { AdversaryCard, AdversaryModal, type Adversary } from './ui';

export type PluginState = {
    settings: PluginSettings;
    cards: {
        [id: string]: {
            color?: string;
            stats?: {
                hp?: number;
                stress?: number;
                uses?: { [featureName: string]: number }
            }[];
        }
    }
}

export default class DaggerheartPlugin extends Plugin {
    activeBlocks: Map<AdversaryCard, string> = new Map();
    state: PluginState;
    saveTimer?: number;
    saving?: Promise<void>;
    battlePoints: HTMLElement;

    updateStatusBar() {
        const file = this.app.workspace.getActiveFile();
        if (file) {
            const bp = Math.ceil(this.calculateBattlePoints(file?.path));
            if (bp > 0) {
                this.battlePoints.setText(`${bp} battle points`);
                // TODO: add tooltip with base battle points for set number of PCs
                // .title is not pretty :(
                return;
            }
        }
        this.battlePoints.setText('');
    }

    calculateBattlePoints(filePath: string): number {
        let totalBP = 0;
        const bpPerType: Record<string, number> = {
            'solo': 5,
            'bruiser': 4,
            'leader': 3,
            'horde': 2,
            'skulk': 2,
            'ranged': 2,
            'standard': 2,
            'support': 1,
            'social': 1,
            'minion': 1 / this.state.settings.numberOfPCs,
        }
        for (const [block, path] of this.activeBlocks) {
            if (path !== filePath) continue;
            const type = block.adv.type?.trim().toLowerCase();
            const count = block.adv.count ?? 1;
            if (type?.startsWith('horde')) totalBP += bpPerType['horde'] * count;
            if (type && bpPerType[type]) totalBP += bpPerType[type] * count;
        }
        return totalBP;
    }

    async onload() {
        this.state = Object.assign({}, { settings: {}, cards: {} }, await this.loadData());
        this.state.settings = Object.assign({}, DEFAULT_SETTINGS, this.state.settings);
        this.battlePoints = this.addStatusBarItem();
        this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.updateStatusBar()));

        this.registerMarkdownCodeBlockProcessor("daggerheart", (src, el, ctx) => {
            const adv = (yaml.parse(src, reviver, { strict: false }) ?? {}) as Adversary;
            const child = new AdversaryCard(el, adv, this);
            ctx.addChild(child);
            child.render();
            // Track it so we can refresh on settings change:
            this.activeBlocks.set(child, this.app.workspace.getActiveFile()?.path ?? ctx.sourcePath);
            this.updateStatusBar();
            // Ensure we stop tracking when the block is removed:
            child.register(() => {
                this.activeBlocks.delete(child);
                this.updateStatusBar();
            });
        });

        this.addSettingTab(new SettingTab(this.app, this));

        this.addCommand({
            id: 'insert-adversary-template',
            name: 'Insert adversary template',
            editorCallback: (editor: Editor) => {
                editor.replaceRange(ADV_TEMPLATE.trim(), editor.getCursor());
            },
        })
        this.addCommand({
            id: 'insert-environment-template',
            name: 'Insert environment template',
            editorCallback: (editor: Editor) => {
                editor.replaceRange(ENV_TEMPLATE.trim(), editor.getCursor());
            },
        })
        this.addCommand({
            id: 'clear-card-state',
            name: 'Clear all card state',
            callback: () => {
                this.state.cards = {};
                this.updateState();
                this.renderAll();
            }
        })
        this.addCommand({
            id: 'insert-from-library',
            name: 'Insert adversary from library',
            editorCallback: (editor: Editor) => {
                new AdversaryModal(this.app, editor, ADV_LIBRARY).open();
            },
        });
        this.addCommand({
            id: 'insert-environment-from-library',
            name: 'Insert environment from library',
            editorCallback: (editor: Editor) => {
                new AdversaryModal(this.app, editor, ENV_LIBRARY).open();
            },
        });
    }

    onunload() {
        if (this.saveTimer != null) {
            this.flushSave();
        }
    }

    renderAll() {
        for (const [block] of this.activeBlocks) {
            block.render();
        }
    }

    updateState() {
        // Debounce writes
        if (this.saveTimer != null) window.clearTimeout(this.saveTimer);
        this.saveTimer = window.setTimeout(() => { this.flushSave(); }, 1000);
    }

    async flushSave() {
        if (this.saveTimer != null) {
            window.clearTimeout(this.saveTimer);
            this.saveTimer = undefined;
        }
        const run = async () => await this.saveData(this.state);
        // Chain to the previous save if one is in-flight
        this.saving = (this.saving ?? Promise.resolve()).then(run, run);
        await this.saving;
    }

    updateCard(keys: (string | number)[], value: string | number) {
        let data: Record<any, any> = this.state.cards;
        const lastKey = keys.pop()!;
        for (const key of keys) {
            if (!data[key]) data[key] = {};
            data = data[key]
        }
        data[lastKey] = value;
        this.updateState();
    }
}


