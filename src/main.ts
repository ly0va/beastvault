import { Editor, Plugin } from 'obsidian';
import * as yaml from 'yaml';
import type { Adversary, PluginState } from './types';
import { SettingTab } from './settings';
import { ADV_LIBRARY, ENV_LIBRARY, DEFAULT_SETTINGS, ADV_TEMPLATE, ENV_TEMPLATE, reviver } from './utils';
import { AdversaryCard, AdversaryModal } from './ui';

export default class DaggerheartPlugin extends Plugin {
    activeBlocks: Set<AdversaryCard> = new Set();
    state: PluginState;
    saveTimer?: number;
    saving?: Promise<void>;

    async onload() {
        this.state = Object.assign({}, { settings: {}, cards: {} }, await this.loadData());
        this.state.settings = Object.assign({}, DEFAULT_SETTINGS, this.state.settings);

        this.registerMarkdownCodeBlockProcessor("daggerheart", (src, el, ctx) => {
            const adv = (yaml.parse(src, reviver, { strict: false }) ?? {}) as Adversary;
            const child = new AdversaryCard(el, adv, this);
            ctx.addChild(child);
            child.render();
            // Track it so we can refresh on settings change:
            this.activeBlocks.add(child);
            // Ensure we stop tracking when the block is removed:
            child.register(() => this.activeBlocks.delete(child));
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
    //         // TODO: warn if stray keys are found
    //         // TODO: bases view
    //         // TODO: command to insert template (empty or based on existing)
    //         // TODO: sync frontmatter
    //         // TODO: when reaches 0 hp, somehow reflect in render
    //         // TODO: add ability to add and display conditions
    //         // TODO: capitalize words "Roll, Fear, Stress, Hope, etc", CAPS the name
    //         // TODO: `summons` field to insert summoned adversaries
    //         // TODO: register editor suggestions to autocomplete adversary fields
    //         // TODO: make it foldable?
    //         // TODO: use .capitalized class for stuff
    //         // TODO: display battle points in the tray

    onunload() {
        if (this.saveTimer != null) {
            this.flushSave();
        }
    }

    renderAll() {
        for (const block of this.activeBlocks) {
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

    updateCardStats(id: string, index: number, stats: { hp?: number; stress?: number }) {
        const data = this.state;
        if (!data.cards[id]) data.cards[id] = {};
        if (!data.cards[id].stats) data.cards[id].stats = [];
        if (!data.cards[id].stats![index]) data.cards[id].stats![index] = {};
        if (stats.hp != null) data.cards[id].stats![index].hp = stats.hp;
        if (stats.stress != null) data.cards[id].stats![index].stress = stats.stress;
        this.updateState();
    }

    updateCardColor(id: string, color: string) {
        const data = this.state;
        if (!data.cards[id]) data.cards[id] = {};
        data.cards[id].color = color;
        this.updateState();
    }

    updateCardFeatureTokens(id: string, featureName: string, tokens: number) {
        const data = this.state;
        if (!data.cards[id]) data.cards[id] = {};
        if (!data.cards[id].tokens) data.cards[id].tokens = {};
        data.cards[id].tokens![featureName] = tokens;
        this.updateState();
    }
}


