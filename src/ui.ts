import { App, Editor, SuggestModal, Notice, MarkdownRenderChild, stringifyYaml, setIcon, MarkdownRenderer } from 'obsidian';
import { roll } from '@airjp73/dice-notation';
import BeastVault from './main';
import { hexToRgb, DICE_PATTERN, subTitle } from './utils';

type Feature = {
    name?: string;
    type?: string;
    desc?: string;
    uses?: number;
    countdown?: number;
    flavor?: string;
}

export type Adversary = {
    name?: string;
    tier?: number;
    type?: string;
    difficulty?: string;
    desc?: string;
    features: Feature[];

    // these are for environments
    tone?: string;
    impulses?: string;
    adversaries?: string;

    // these are for adversaries
    hp: number;
    stress: number;
    thresholds: number[];
    attack?: string;
    xp: string[];
    motives?: string;

    weapon?: string;
    range?: string;
    damage?: string;

    // these are not rendered
    source?: string;
    id: string;
};

export class AdversaryModal extends SuggestModal<Adversary> {
    constructor(app: App, private editor: Editor, private library: Adversary[]) {
        super(app);
        this.limit = 200;
    }

    getSuggestions(query: string): Adversary[] {
        return this.library.filter((adv: Adversary) =>
            adv.name!.toLowerCase().includes(query.toLowerCase())
        );
    }

    renderSuggestion(adv: Adversary, el: HTMLElement) {
        const heading = el.createDiv({ cls: 'spreadout' });
        heading.createEl('b', { text: adv.name?.toUpperCase() || '' });
        heading.createSpan({ text: subTitle(adv.tier, adv.type), cls: 'smaller' });
        el.createSpan({ text: adv.desc || '', cls: 'smaller muted' });
    }

    onChooseSuggestion(adv: Adversary, evt: MouseEvent | KeyboardEvent) {
        adv.id = Math.random().toString(36).slice(2);
        delete adv.source;
        this.editor.replaceSelection(`\`\`\`daggerheart\n${stringifyYaml(adv)}\`\`\`\n`);
    }
}

export class AdversaryCard extends MarkdownRenderChild {
    count: number;

    constructor(
        private container: HTMLElement,
        public adv: Adversary,
        private plugin: BeastVault,
        private preview: boolean = false
    ) {
        super(container);
        this.count = this.plugin.state.cards[this.adv.id]?.count || 1;
    }


    createTitle(card: HTMLElement) {
        const title = card.createDiv({ cls: 'callout-title spreadout' });
        title.createEl('b', { cls: 'larger', text: `${this.adv.name || ''}` });
        title.createEl('b', { cls: 'smaller padded', text: subTitle(this.adv.tier, this.adv.type) });
    }

    createHeaderEntry(header: HTMLElement, name: string, entry: string | string[] | undefined) {
        const isEmpty = Array.isArray(entry) ? entry.length == 0 : entry == null || entry == '';
        if (isEmpty) return;
        header.createEl('b', { text: `${name}: ` });
        header.createSpan({ text: Array.isArray(entry) ? entry.join(', ') : entry });
        header.createEl('br');
    }

    createHeader(content: HTMLElement) {
        if (this.adv.desc) {
            const desc = content.createEl('p', { cls: "smaller muted padded" });
            desc.createEl('i', { text: this.adv.desc });
        }

        const header = content.createEl('p', { cls: 'smaller' });
        this.createHeaderEntry(header, 'Difficulty', this.adv.difficulty);

        if (this.adv.attack != null) {
            header.createEl('b', { text: 'Attack: ' });
            header.createSpan({ text: this.adv.attack, cls: 'rollable rollable-attack' });
            header.createEl('br');
        }

        if (this.adv.weapon || this.adv.range || this.adv.damage) {
            header.createEl('b', { text: `${this.adv.weapon || 'Weapon'}: ` })
            header.createSpan(this.adv.range || '')
            header.createSpan((this.adv.range && this.adv.damage) ? ' | ' : '');
            this.adv.damage?.split(DICE_PATTERN).forEach(part => {
                header.createSpan({ text: part, cls: DICE_PATTERN.test(part) ? 'rollable' : '' });
            });
            header.createEl('br');
        }
        this.createHeaderEntry(header, 'Experience', this.adv.xp);
        this.createHeaderEntry(header, 'Motives & Tactics', this.adv.motives);
        this.createHeaderEntry(header, 'Tone & Feel', this.adv.tone);
        this.createHeaderEntry(header, 'Impulses', this.adv.impulses);
        this.createHeaderEntry(header, 'Potential Adversaries', this.adv.adversaries);
    }

    createFeature(content: HTMLElement, index: number, feature: Feature) {
        const paragraph = content.createEl('p', { cls: 'smaller' })
        paragraph.createEl('b', { text: feature.name || '' });
        paragraph.createSpan({ text: feature.type && `${feature.name}` ? ' - ' : '' });
        paragraph.createSpan({ text: feature.type || '' });
        feature.type || feature.name ? paragraph.createEl('br') : '';
        if (this.count == 1) {
            this.createStatSlots(paragraph, 'Uses', feature.uses || 0, [this.adv.id, 0, 'uses', index]);
            // For now, we only have countdowns in environments
            this.createStatSlots(paragraph, 'Countdown', feature.countdown || 0, [this.adv.id, 0, 'countdown', index]);
        }
        if (feature.desc) {
            const featureDiv = paragraph.createDiv();
            MarkdownRenderer.render(
                this.plugin.app,
                feature
                    .desc
                    .replace(/\b([sS])pend a [fF]ear\b/g, "<b>$1pend a Fear</b>")
                    .replace(/\b([mM])ark a [sS]tress\b/g, "<b>$1ark a Stress</b>")
                    .replace(DICE_PATTERN, `<span class=rollable>$&</span>`),
                featureDiv,
                this.plugin.app.workspace.getActiveFile()?.path ?? '/',
                this
            ).then(() => {
                // Using innerHTML like this is safe since we're only replacing tags
                featureDiv.innerHTML = featureDiv.innerHTML
                    .replace(/<p.*?>/g, "<span class=block>")
                    .replace(/<\/p>/g, "</span>");
            });
        }
        if (feature.flavor) {
            paragraph.createEl('i', { cls: 'muted block', text: feature.flavor });
        }
    }

    createStatSlots(statBar: HTMLElement, name: string, stat: number, keys: (string | number)[]) {
        const slots: HTMLInputElement[] = []
        const marked = this.plugin.getCardState(keys) ?? 0;
        if (stat > 0) {
            statBar.createSpan({ text: `${name}: ${stat} `, cls: "muted" });
            for (let i = 0; i < stat; i++) {
                const slot = statBar.createEl('input', { type: 'checkbox', cls: 'daggerheart-slot' });
                if (i < marked) {
                    slot.checked = true;
                }
                slots.push(slot);
            }
            statBar.createEl('br');
            if (!this.preview) {
                statBar.addEventListener('input', (event) => {
                    if (!slots.contains(event.target as HTMLInputElement)) return;
                    let marked = slots.reduce((sum, slot) => sum + (slot.checked ? 1 : 0), 0);
                    this.plugin.updateCard(keys, marked)
                });
            }
        }

        return slots;
    }

    createThresholdButtons(content: HTMLElement) {
        let minor, major, severe, massive;
        if (this.adv.thresholds.length > 0) {
            const thresholds = content.createEl('p', { cls: 'daggerheart-thresholds' });
            minor = thresholds.createEl('button', { text: 'MINOR' });
            thresholds.createSpan({ text: ` ${this.adv.thresholds[0]} ` });
            major = thresholds.createEl('button', { text: 'MAJOR' });
            if (this.adv.thresholds.length > 1) {
                thresholds.createSpan({ text: ` ${this.adv.thresholds[1]} ` });
                severe = thresholds.createEl('button', { text: 'SEVERE' });
                if (this.plugin.state.settings.showMassiveThreshold) {
                    thresholds.createSpan({ text: ` ${this.adv.thresholds?.[2] || 2 * this.adv.thresholds[1]} ` });
                    massive = thresholds.createEl('button', { text: 'MASSIVE' });
                }
            }
        }
        return [minor, major, severe, massive];
    }

    createStatBar(content: HTMLElement, index: number) {
        const statBar = content.createEl('p');
        const [minor, major, severe, massive] = this.createThresholdButtons(statBar);
        const hpSlots = this.createStatSlots(statBar, 'HP', this.adv.hp, [this.adv.id, index, 'hp']);
        this.createStatSlots(statBar, 'Stress', this.adv.stress, [this.adv.id, index, 'stress']);

        if (this.count > 1) {
            for (const [featureIndex, feature] of this.adv.features.entries()) {
                const uses = feature.uses || 0;
                const name = feature.name || 'Unnamed feature uses';
                if (uses != 0) {
                    this.createStatSlots(statBar, name, uses, [this.adv.id, index, 'uses', featureIndex]);
                }
            }
        }

        let hordeSize: any;
        const match = this.adv.type?.match(/^horde\s+\((\d+)\/hp\)$/i);
        if (match && this.adv.hp > 0) {
            hordeSize = statBar.createSpan({ cls: "muted" });
            hordeSize.update = () => {
                const size = parseInt(match[1]);
                const hp = this.plugin.getCardState([this.adv.id, index, 'hp']) ?? 0;
                const currentHP = this.adv.hp - hp;
                hordeSize!.innerText = `Horde size: ${size * currentHP}`;
            };
            hordeSize.update();
            statBar.addEventListener('input', (event) => {
                if (!hpSlots.contains(event.target as HTMLInputElement)) return;
                hordeSize?.update();
            })
        }

        const slotMarker = (x: number) => (event: any) => {
            const slots = event.altKey ? hpSlots.toReversed() : hpSlots;
            let toMark = x;
            let marked = 0;

            for (const slot of slots) {
                if (slot.checked == event.altKey && toMark > 0) {
                    slot.checked = !slot.checked;
                    toMark--
                }
                if (slot.checked) marked++;
            }
            if (!this.preview) {
                this.plugin.updateCard([this.adv.id, index, 'hp'], marked)
            }
            hordeSize?.update();
        };

        minor?.addEventListener('click', slotMarker(1));
        major?.addEventListener('click', slotMarker(2));
        severe?.addEventListener('click', slotMarker(3));
        massive?.addEventListener('click', slotMarker(4));
    }

    createCopyButton(card: HTMLElement) {
        const copy = card.createEl('button', {
            cls: 'clickable-icon daggerheart-count',
            attr: { 'aria-label': 'Copy to clipboard' }
        })
        setIcon(copy, 'copy');
        copy.addEventListener('click', () => {
            // TODO: for library, add `raw` field to paste them as they were entered
            const adv: Partial<Adversary> = { ...this.adv };
            adv.id = Math.random().toString(36).slice(2);
            if (adv.thresholds?.length == 0) {
                delete adv.thresholds;
            } else {
                adv.thresholds = adv.thresholds?.join('/') as any;
            }
            if (adv.xp?.length == 0) {
                delete adv.xp;
            } else {
                adv.xp = adv.xp?.join(', ') as any;
            }
            if (adv.hp == 0) delete adv.hp;
            if (adv.stress == 0) delete adv.stress;
            if (adv.features?.length == 0) delete adv.features;
            delete adv.source;

            navigator.clipboard.writeText(`\`\`\`daggerheart\n${stringifyYaml(adv)}\`\`\`\n`)
            new Notice('Adversary copied to clipboard');
        })
    }

    createPlusMinusButtons(card: HTMLElement, features: HTMLElement, statBlock: HTMLElement) {
        if (!this.adv.hp && !this.adv.stress) return;
        const add = card.createEl('button', {
            cls: 'daggerheart-count clickable-icon invisible',
            attr: { 'aria-label': 'Increase adversary count' }
        })
        const remove = card.createEl('button', {
            cls: 'daggerheart-count clickable-icon invisible',
            attr: { 'aria-label': 'Decrease adversary count' }
        })
        setIcon(add, 'plus')
        setIcon(remove, 'minus')

        // hacky but works for now
        setTimeout(() => {
            const editable = card.parentElement?.nextElementSibling?.classList.contains('edit-block-button');
            if (editable) {
                add.addClass('daggerheart-count-lower');
                remove.addClass('daggerheart-count-even-lower');
            } else {
                remove.addClass('daggerheart-count-lower');
            }
            add.removeClass('invisible');
            remove.removeClass('invisible');
        }, 5);

        const rerender = () => {
            features.empty();
            statBlock.empty();
            this.createFeaturesAndStats(features, statBlock);
            this.plugin.updateStatusBar();
        };

        add.addEventListener('click', () => {
            this.count += 1;
            this.plugin.updateCard([this.adv.id, 'count'], this.count);
            rerender();
        });

        remove.addEventListener('click', () => {
            if (this.count > 1) {
                this.count -= 1;
                this.plugin.updateCard([this.adv.id, 'count'], this.count);
                rerender();
            }
        });
    }

    createFeaturesAndStats(features: HTMLElement, statBlock: HTMLElement) {
        const anyStats = this.adv.hp || this.adv.stress || this.adv.thresholds.length;
        if (this.adv.features.length > 0 || anyStats) {
            features.createEl('hr');
        }

        for (const [index, feature] of this.adv.features!.entries()) {
            this.createFeature(features, index, feature);
        }

        if (this.adv.features.length > 0 && anyStats) {
            features.createEl('hr')
        }

        for (let index = 0; index < this.count; index++) {
            if (index != 0) statBlock.createEl('hr');
            this.createStatBar(statBlock, index);
        }
    }

    render() {
        this.container.empty();
        const card = this.container.createDiv({ cls: 'callout daggerheart', attr: { 'data-callout': 'daggerheart-card' } });
        this.createTitle(card);

        card.addEventListener('click', (event) => {
            const elt = event.target as HTMLElement;
            if (!elt.classList.contains('rollable')) return;
            const dice = elt.classList.contains('rollable-attack')
                ? `1d20${this.adv.attack == '0' ? '' : this.adv.attack}`
                : elt.innerText;
            const fragment = document.createDocumentFragment();
            fragment.createEl('code', { text: `${dice} = ${roll(dice).result}` });
            new Notice(fragment);
        });

        const content = card.createDiv({ cls: 'callout-content' });
        const header = content.createDiv();
        const features = content.createDiv();
        const statBlock = content.createDiv();

        this.createHeader(header);
        this.createFeaturesAndStats(features, statBlock);
        if (this.preview) {
            this.createCopyButton(card);
        } else {
            this.createPlusMinusButtons(card, features, statBlock);
        }

        const data = this.plugin.state.cards[this.adv.id]?.color;
        const defaultColor = data || this.plugin.state.settings.defaultColor;

        const applyColor = (color: string) => {
            card.style.setProperty('--callout-color', hexToRgb(color));
            card.style.setProperty('--checkbox-color', color)
            card.style.setProperty('--checkbox-color-hover', color)
        }

        applyColor(defaultColor);

        if (this.plugin.state.settings.showColorPicker && !this.preview) {
            const colorpicker = card.createEl('input', { type: 'color', value: defaultColor, cls: 'corner' });
            colorpicker.addEventListener('input', () => {
                applyColor(colorpicker.value);
                this.plugin.updateCard([this.adv.id, 'color'], colorpicker.value);
            })
        }
    }
}
