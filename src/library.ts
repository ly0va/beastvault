import { ItemView, WorkspaceLeaf, Modal } from 'obsidian';
import BeastVault from './main';
import { subTitle, hexToRgb } from './utils';
import { type RawAdversary, AdversaryCard } from './ui';

export const LIBRARY_VIEW_TYPE = 'beastvault-library-view';

type SortBy = 'tier' | 'type' | 'source' | 'name';

export class LibraryView extends ItemView {
    private sortBy: SortBy = 'tier';
    private filters: { tier: boolean[]; type: string; source: string; search?: string } = {
        tier: [false /* this is a fake one */, false, false, false, false],
        type: 'all',
        source: 'all',
        search: undefined
    };
    private grid: HTMLElement;

    constructor(leaf: WorkspaceLeaf, private plugin: BeastVault) {
        super(leaf);
        this.icon = 'library';
        this.navigation = false;
    }

    everything() {
        return [...this.plugin.allAdversaries(), ...this.plugin.allEnvironments()].sort((a, b) => {
            // Default sort: first by Tier, then by Name
            const [aTier, bTier] = [a.tier ?? 999, b.tier ?? 999];
            const comp = aTier - bTier;
            return comp !== 0 ? comp : a.name!.localeCompare(b.name!);
        }).sort((a, b) => {
            if (this.sortBy === 'tier') return (a.tier ?? 999) - (b.tier ?? 999);
            if (this.sortBy === 'type') return (a.type ?? 'zzz').localeCompare(b.type ?? 'zzz');
            if (this.sortBy === 'source') return (a.source ?? 'homebrew').localeCompare(b.source ?? 'homebrew');
            if (this.sortBy === 'name') return a.name!.localeCompare(b.name!);
            return 0;
        }).filter(item => { // user filter
            const tier = this.filters.tier.every(x => !x) || (item.tier != null && this.filters.tier[item.tier]);
            const source = this.filters.source === 'all' || (item.source ?? 'homebrew') === this.filters.source;
            const type = this.filters.type === 'all' ||
                (this.filters.type == 'adversaries' && (item.hp != null || item.stress != null)) ||
                (this.filters.type == 'environments' && item.hp == null && item.stress == null) ||
                item.type != null && item.type.toLowerCase().startsWith(this.filters.type);
            const search = !this.filters.search || item.name!.toLowerCase().includes(this.filters.search) || (item.desc && item.desc.toLowerCase().includes(this.filters.search));
            return tier && source && type && search;
        });
    }

    getViewType() {
        return LIBRARY_VIEW_TYPE;
    }

    getDisplayText() {
        return 'BeastVault Library';
    }

    // TODO: cannot copy any text from view for some reason
    // TODO: add copy button to mini cards
    // TODO: when popup active, add right/left navigation
    // TODO: refresh on library refresh, default color change
    // TODO: ctrl+f to focus on search
    // FIXME: for some reason battle points are sometimes displayed
    async onOpen() {
        this.contentEl.empty();
        const controls = this.contentEl.createDiv({ cls: 'bv-fixed' });

        const searchInput = controls.createDiv('search-input-container').createEl('input', {
            attr: {
                enterkeyhint: 'search',
                type: 'search',
                spellcheck: 'false',
                placeholder: 'Search...',
            }
        });

        searchInput.addEventListener('input', (event) => {
            this.filters.search = (event.target as HTMLInputElement).value.trim().toLowerCase() || undefined;
            this.renderBlocks();
        });


        // TODO: instead of hardcoding options, scan library for existing values

        const sourceDropdown = controls.createEl('select', { cls: 'dropdown' });
        sourceDropdown.createEl('option', { text: 'All Sources', value: 'all' });
        sourceDropdown.createEl('option', { text: 'Core Rulebook', value: 'corebook' });
        sourceDropdown.createEl('option', { text: 'Homebrew', value: 'homebrew' });

        sourceDropdown.addEventListener('change', (event) => {
            this.filters.source = (event.target as HTMLSelectElement).value;
            this.renderBlocks();
        });

        const typeDropdown = controls.createEl('select', { cls: 'dropdown' });
        typeDropdown.createEl('option', { text: 'All Types', value: 'all' });
        typeDropdown.createEl('option', { text: 'Adversaries', value: 'adversaries' });
        typeDropdown.createEl('option', { text: 'Environments', value: 'environments' });
        typeDropdown.createEl('option', { text: 'Minion', value: 'minion' });
        typeDropdown.createEl('option', { text: 'Horde', value: 'horde' });
        typeDropdown.createEl('option', { text: 'Standard', value: 'standard' });
        typeDropdown.createEl('option', { text: 'Skulk', value: 'skulk' });
        typeDropdown.createEl('option', { text: 'Leader', value: 'leader' });
        typeDropdown.createEl('option', { text: 'Ranged', value: 'ranged' });
        typeDropdown.createEl('option', { text: 'Bruiser', value: 'bruiser' });
        typeDropdown.createEl('option', { text: 'Solo', value: 'solo' });
        typeDropdown.createEl('option', { text: 'Social', value: 'social' });
        // typeDropdown.createEl('option', { text: 'Social Environment' }); // TODO
        typeDropdown.createEl('option', { text: 'Traversal', value: 'traversal' });
        typeDropdown.createEl('option', { text: 'Exploration', value: 'exploration' });
        typeDropdown.createEl('option', { text: 'Event', value: 'event' });

        typeDropdown.addEventListener('change', (event) => {
            this.filters.type = (event.target as HTMLSelectElement).value;
            this.renderBlocks();
        });

        const byTier = controls.createDiv({ text: 'Tiers: ' });
        for (let i = 1; i <= 4; i++) {
            const button = byTier.createEl('button', { cls: 'bv-tier-button bv-inactive', text: `${i}` });
            button.addEventListener('click', () => {
                button.toggleClass('bv-inactive', this.filters.tier[i]);
                this.filters.tier[i] = !this.filters.tier[i];
                this.renderBlocks();
            })
        }


        const sortBy = controls.createDiv({ text: 'Sort by: ' });
        const sortDropdown = sortBy.createEl('select', { cls: 'dropdown' });
        sortDropdown.createEl('option', { text: 'Tier', value: 'tier' });
        sortDropdown.createEl('option', { text: 'Name', value: 'name' });
        sortDropdown.createEl('option', { text: 'Type', value: 'type' });
        sortDropdown.createEl('option', { text: 'Source', value: 'source' });

        sortBy.addEventListener('change', (event) => {
            this.sortBy = (event.target as HTMLSelectElement).value as SortBy;
            this.renderBlocks();
        });

        this.renderBlocks();
    }

    renderBlocks() {
        this.grid ??= this.contentEl.createDiv('bv-library');
        this.grid.empty();
        const everything = this.everything();
        for (const item of everything) {
            const card = this.grid.createDiv({ cls: 'callout bv-statblock bv-library-item', attr: { 'data-callout': 'daggerheart-card' } });
            card.createDiv({ cls: 'callout-title bv-larger' }).createEl('b', { text: item.name });
            card.createDiv({ text: subTitle(item.tier, item.type) })
            card.createEl('p', { cls: 'bv-smaller bv-muted' }).createEl('i', { text: item.desc || '' })
            card.createDiv({ cls: 'bv-source', text: `[${item.source}]` });
            card.addEventListener('click', () => {
                new AdversaryPreviewModal(this.plugin, item).open();
            })

            const color = this.plugin.state.settings.defaultColor;
            card.style.setProperty('--callout-color', hexToRgb(color));
            card.style.setProperty('--checkbox-color', color)
            card.style.setProperty('--checkbox-color-hover', color)
        }
    }

    async onClose() { }
}

class AdversaryPreviewModal extends Modal {
    constructor(plugin: BeastVault, adv: RawAdversary) {
        super(plugin.app);
        const card = new AdversaryCard(this.contentEl, adv, plugin, true);
        card.render();
    }
}
