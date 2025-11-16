import { ItemView, WorkspaceLeaf } from 'obsidian';
import BeastVault from './main';
import { subTitle, hexToRgb } from './utils';

export const LIBRARY_VIEW_TYPE = 'beastvault-library-view';

export class LibraryView extends ItemView {
    constructor(leaf: WorkspaceLeaf, private plugin: BeastVault) {
        super(leaf);
        this.icon = 'library';
        this.navigation = false;
    }

    getViewType() {
        return LIBRARY_VIEW_TYPE;
    }

    getDisplayText() {
        return 'BeastVault Library';
    }

    // TODO: add source, add search/filter/sort by tier, source, type, name
    // TODO: add a popup on hover/click with full block displayed "copy" button
    // TODO: when popup active, add right/left navigation
    async onOpen() {
        this.contentEl.empty();
        const grid = this.contentEl.createDiv('daggerheart-library');
        const everything = [...this.plugin.allAdversaries(), ...this.plugin.allEnvironments()];
        for (const item of everything) {
            const card = grid.createDiv({ cls: 'callout daggerheart library-item', attr: { 'data-callout': 'daggerheart-card' } });
            card.createDiv({ cls: 'callout-title larger' }).createEl('b', { text: item.name });
            card.createDiv({ text: subTitle(item.tier, item.type) })
            card.createEl('p', { cls: 'smaller muted' }).createEl('i', { text: item.desc })

            const color = this.plugin.state.settings.defaultColor;
            card.style.setProperty('--callout-color', hexToRgb(color));
            card.style.setProperty('--checkbox-color', color)
            card.style.setProperty('--checkbox-color-hover', color)
        }
    }

    async onClose() { }
}
