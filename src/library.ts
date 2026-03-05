import { ItemView, WorkspaceLeaf, Modal, Scope, setIcon, stringifyYaml, Notice } from 'obsidian';
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
    private searchInput: HTMLInputElement;

    constructor(leaf: WorkspaceLeaf, private plugin: BeastVault) {
        super(leaf);
        this.icon = 'library';
        this.navigation = false;
        this.scope = new Scope(this.app.scope);
        this.scope.register(['Mod'], 'f', (e) => {
            e.preventDefault();
            this.searchInput?.focus();
            return false;
        });
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

    async onOpen() {
        this.contentEl.empty();
        this.grid = null!;
        const controls = this.contentEl.createDiv({ cls: 'bv-fixed' });

        this.searchInput = controls.createDiv('search-input-container').createEl('input', {
            attr: {
                enterkeyhint: 'search',
                type: 'search',
                spellcheck: 'false',
                placeholder: 'Search...',
            }
        });

        if (this.filters.search) this.searchInput.value = this.filters.search;

        this.searchInput.addEventListener('input', (event) => {
            this.filters.search = (event.target as HTMLInputElement).value.trim().toLowerCase() || undefined;
            this.renderBlocks();
        });

        const items = [...this.plugin.allAdversaries(), ...this.plugin.allEnvironments()];

        const sources = [...new Set(items.map(i => i.source ?? 'homebrew'))].sort();
        const sourceDropdown = controls.createEl('select', { cls: 'dropdown' });
        sourceDropdown.createEl('option', { text: 'All Sources', value: 'all' });
        for (const source of sources) {
            sourceDropdown.createEl('option', { text: source.charAt(0).toUpperCase() + source.slice(1), value: source });
        }
        sourceDropdown.value = this.filters.source;

        sourceDropdown.addEventListener('change', (event) => {
            this.filters.source = (event.target as HTMLSelectElement).value;
            this.renderBlocks();
        });

        const types = [...new Set(items.map(i => i.type).filter(Boolean).map(t => t!.toLowerCase().split(/\s/)[0]))].sort();
        const typeDropdown = controls.createEl('select', { cls: 'dropdown' });
        typeDropdown.createEl('option', { text: 'All Types', value: 'all' });
        typeDropdown.createEl('option', { text: 'Adversaries', value: 'adversaries' });
        typeDropdown.createEl('option', { text: 'Environments', value: 'environments' });
        for (const type of types) {
            typeDropdown.createEl('option', { text: type.charAt(0).toUpperCase() + type.slice(1), value: type });
        }
        typeDropdown.value = this.filters.type;

        typeDropdown.addEventListener('change', (event) => {
            this.filters.type = (event.target as HTMLSelectElement).value;
            this.renderBlocks();
        });

        const byTier = controls.createDiv({ text: 'Tiers: ' });
        for (let i = 1; i <= 4; i++) {
            const button = byTier.createEl('button', { cls: `bv-tier-button ${this.filters.tier[i] ? '' : 'bv-inactive'}`, text: `${i}` });
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
        sortDropdown.value = this.sortBy;

        sortBy.addEventListener('change', (event) => {
            this.sortBy = (event.target as HTMLSelectElement).value as SortBy;
            this.renderBlocks();
        });

        this.renderBlocks();
        this.plugin.updateStatusBar();
    }

    renderBlocks() {
        this.grid ??= this.contentEl.createDiv('bv-library');
        this.grid.empty();
        const everything = this.everything();
        for (const [i, item] of everything.entries()) {
            const card = this.grid.createDiv({ cls: 'callout bv-statblock bv-library-item', attr: { 'data-callout': 'daggerheart-card' } });
            card.createDiv({ cls: 'callout-title bv-larger' }).createEl('b', { text: item.name });
            card.createDiv({ text: subTitle(item.tier, item.type) })
            card.createEl('p', { cls: 'bv-smaller bv-muted' }).createEl('i', { text: item.desc || '' })
            card.createDiv({ cls: 'bv-source', text: `[${item.source}]` });

            const copyBtn = card.createEl('button', {
                cls: 'clickable-icon bv-mini-copy',
                attr: { 'aria-label': 'Copy to clipboard' }
            });
            setIcon(copyBtn, 'copy');
            copyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const copy = { ...item };
                copy.id = Math.random().toString(36).slice(2);
                delete copy.source;
                delete copy.raw;
                void navigator.clipboard.writeText(`\`\`\`daggerheart\n${item.raw ? item.raw : stringifyYaml(copy)}\`\`\`\n`);
                new Notice('Copied to clipboard');
            });

            card.addEventListener('click', () => {
                if (window.getSelection()?.toString()) return;
                new AdversaryPreviewModal(this.plugin, everything, i).open();
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
    private index: number;

    constructor(private plugin: BeastVault, private items: RawAdversary[], index: number) {
        super(plugin.app);
        this.index = index;
        this.scope.register([], 'ArrowLeft', () => { this.navigate(-1); return false; });
        this.scope.register([], 'ArrowRight', () => { this.navigate(1); return false; });
        this.renderCard();
    }

    private navigate(delta: number) {
        const newIndex = this.index + delta;
        if (newIndex >= 0 && newIndex < this.items.length) {
            this.index = newIndex;
            this.renderCard();
        }
    }

    private renderCard() {
        this.contentEl.empty();
        const card = new AdversaryCard(this.contentEl, this.items[this.index], this.plugin, true);
        card.render();
    }
}
