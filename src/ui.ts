import { App, Editor, SuggestModal, Notice, MarkdownRenderChild, stringifyYaml } from 'obsidian';
import { roll } from '@airjp73/dice-notation';
import { marked } from 'marked';
import DaggerheartPlugin from './main';
import { hexToRgb, DICE_PATTERN } from './utils';

type Feature = {
    name?: string;
    type?: string;
    desc?: string;
    uses?: number;
    flavor?: string;
    // tokens?: number;
    // cost?
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

    hp: number;
    stress: number;
    thresholds: number[];
    attack?: string;
    xp: string[];
    motives?: string;
    desc?: string;
    source?: string;
    features: Feature[]
    count: number;
    id: string;
    // syncProperties?: boolean
};

export class AdversaryModal extends SuggestModal<Adversary> {
    constructor(app: App, private editor: Editor, private library: Adversary[]) {
        super(app);
    }

    getSuggestions(query: string): Adversary[] {
        return this.library.filter((adv: Adversary) =>
            adv.name!.toLowerCase().includes(query.toLowerCase())
        );
    }

    renderSuggestion(adv: Adversary, el: HTMLElement) {
        el.createEl('div', { text: adv.name });
        el.createEl('small', { text: `Tier ${adv.tier} ${adv.type}` });
    }

    onChooseSuggestion(adv: Adversary, evt: MouseEvent | KeyboardEvent) {
        this.editor.replaceSelection(`\`\`\`daggerheart\n${stringifyYaml(adv)}\n\`\`\`\n`);
    }
}

export class AdversaryCard extends MarkdownRenderChild {
    constructor(
        private container: HTMLElement,
        public adv: Adversary,
        private plugin: DaggerheartPlugin
    ) {
        super(container);
    }

    createTitle(card: HTMLElement) {
        const title = card.createDiv({ cls: 'callout-title spreadout' });
        const mainTitle = title.createEl('b', { cls: 'larger', text: `${this.adv.name || ''}` });
        const subTitle = title.createEl('b', { cls: 'smaller' });
        subTitle.innerHTML += this.adv.tier ? `Tier ${this.adv.tier} ` : '';
        subTitle.innerHTML += this.adv.type ? this.adv.type : '';
        subTitle.innerHTML += '&nbsp;&nbsp;&nbsp'; // to accomodate the </> button
    }

    createHeader(content: HTMLElement) {
        if (this.adv.desc) {
            content.createEl('p', { cls: "smaller muted" }).createEl('i', { text: this.adv.desc });
        }

        const header = content.createEl('p', { cls: 'smaller' });
        header.innerHTML += this.adv.difficulty ? `<b>Difficulty:</b> ${this.adv.difficulty}<br>` : '';

        if (this.adv.attack != null) {
            header.innerHTML += `<b>Attack:</b> `
            header.createEl('span', { text: this.adv.attack, cls: 'rollable rollable-attack' });
            header.createEl('br');
        }

        if (this.adv.weapon || this.adv.range || this.adv.damage) {
            header.innerHTML += `<b>${this.adv.weapon || 'Weapon'}:</b> `
            header.innerHTML += `${this.adv.range || ''}`
            header.innerHTML += (this.adv.range && this.adv.damage) ? ' | ' : '';
            header.innerHTML += this.adv.damage?.replace(DICE_PATTERN, '<span class=rollable>$&</span>') || '';
            header.createEl('br');
        }
        header.innerHTML += this.adv.xp.length > 0 ? `<b>Experience:</b> ${this.adv.xp.join(', ')}<br>` : '';
        header.innerHTML += this.adv.motives ? `<b>Motives &amp; Tactics:</b> ${this.adv.motives}<br>` : '';
        header.innerHTML += this.adv.tone ? `<b>Tone &amp Feel:</b> ${this.adv.tone}<br>` : '';
        header.innerHTML += this.adv.impulses ? `<b>Impulses:</b> ${this.adv.impulses}<br>` : '';
        header.innerHTML += this.adv.adversaries ? `<b>Potential Adversaries:</b> ${this.adv.adversaries}<br>` : '';
    }

    createFeature(content: HTMLElement, index: number, feature: Feature) {
        const paragraph = content.createEl('p', { cls: 'smaller' })
        paragraph.innerHTML += feature.name ? `<b>${feature.name}</b>` : '';
        paragraph.innerHTML += feature.type && feature.name ? ` - ` : '';
        paragraph.innerHTML += feature.type ? `${feature.type}` : '';
        paragraph.innerHTML += feature.type || feature.name ? `<br>` : '';
        if (this.adv.count == 1) {
            this.createStatSlots(paragraph, 'Uses', feature.uses || 0, [this.adv.id, 'stats', 0, 'uses', index]);
        }
        if (feature.desc) {
            let desc = marked.parse(feature.desc, { async: false })
                .replace(/<p>|<\/p>/g, "")
                .replace(/\b([sS])pend a [fF]ear\b/g, "<b>$1pend a Fear</b>")
                .replace(/\b([mM])ark a [sS]tress\b/g, "<b>$1ark a Stress</b>")
                .replace(DICE_PATTERN, `<span class=rollable>$&</span>`)
            paragraph.createEl('span').innerHTML = desc;
        }
        if (feature.flavor) {
            const flavor = paragraph.createEl('i', { cls: 'muted', text: feature.flavor });
            flavor.style.display = 'block';
        }
    }

    createStatSlots(statBar: HTMLElement, name: string, stat: number, keys: (string | number)[]) {
        const slots: HTMLInputElement[] = []
        const marked = this.plugin.getCardState(keys) ?? 0;
        if (stat > 0) {
            statBar.createEl('span', { text: `${name}: ${stat} `, cls: "muted" });
            for (let i = 0; i < stat; i++) {
                const slot = statBar.createEl('input', { type: 'checkbox', cls: 'daggerheart-slot' });
                if (i < marked) {
                    slot.checked = true;
                }
                slots.push(slot);
            }
            statBar.createEl('br');
            statBar.addEventListener('input', (event) => {
                if (!slots.contains(event.target as HTMLInputElement)) return;
                let marked = slots.reduce((sum, slot) => sum + (slot.checked ? 1 : 0), 0);
                this.plugin.updateCard(keys, marked)
            });
        }

        return slots;
    }

    createThresholdButtons(content: HTMLElement) {
        let minor, major, severe, massive;
        if (this.adv.thresholds.length > 0) {
            const thresholds = content.createEl('p', { cls: 'daggerheart-thresholds' });
            minor = thresholds.createEl('button', { text: 'MINOR' });
            thresholds.createEl('span', { text: ` ${this.adv.thresholds[0]} ` });
            major = thresholds.createEl('button', { text: 'MAJOR' });
            if (this.adv.thresholds.length > 1) {
                thresholds.createEl('span', { text: ` ${this.adv.thresholds[1]} ` });
                severe = thresholds.createEl('button', { text: 'SEVERE' });
                if (this.plugin.state.settings.showMassiveThreshold) {
                    thresholds.createEl('span', { text: ` ${this.adv.thresholds?.[2] || 2 * this.adv.thresholds[1]} ` });
                    massive = thresholds.createEl('button', { text: 'MASSIVE' });
                }
            }
        }
        return [minor, major, severe, massive];
    }

    createStatBar(content: HTMLElement, index: number) {
        const statBar = content.createEl('p');
        const [minor, major, severe, massive] = this.createThresholdButtons(statBar);
        const hpSlots = this.createStatSlots(statBar, 'HP', this.adv.hp, [this.adv.id, 'stats', index, 'hp']);
        this.createStatSlots(statBar, 'Stress', this.adv.stress, [this.adv.id, 'stats', index, 'stress']);

        if (this.adv.count > 1) {
            for (const [featureIndex, feature] of this.adv.features.entries()) {
                const uses = feature.uses || 0;
                const name = feature.name || 'Unnamed feature uses';
                if (uses != 0) {
                    this.createStatSlots(statBar, name, uses, [this.adv.id, 'stats', index, 'uses', featureIndex]);
                }
            }
        }

        let hordeSize: any;
        const match = this.adv.type?.match(/^horde\s+\((\d+)\/hp\)$/i);
        if (match && this.adv.hp > 0) {
            hordeSize = statBar.createEl('span', { cls: "muted" });
            hordeSize.update = () => {
                const size = parseInt(match[1]);
                const hp = this.plugin.getCardState([this.adv.id, 'stats', index, 'hp']) ?? 0;
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
            this.plugin.updateCard([this.adv.id, 'stats', index, 'hp'], marked)
            hordeSize?.update();
        };

        minor?.addEventListener('click', slotMarker(1));
        major?.addEventListener('click', slotMarker(2));
        severe?.addEventListener('click', slotMarker(3));
        massive?.addEventListener('click', slotMarker(4));
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
            new Notice(`${dice} = ${roll(dice).result}`);
        });

        const content = card.createDiv({ cls: 'callout-content' });
        this.createHeader(content);

        const anyStats = this.adv.hp || this.adv.stress || this.adv.thresholds;
        if (this.adv.features!.length > 0 || anyStats) {
            content.createEl('hr');
        }

        for (const [index, feature] of this.adv.features!.entries()) {
            this.createFeature(content, index, feature);
        }

        if (this.adv.features!.length > 0 && anyStats) {
            content.createEl('hr')
        }

        for (let index = 0; index < this.adv.count!; index++) {
            if (index != 0) content.createEl('hr');
            this.createStatBar(content, index);
        }

        const data = this.plugin.state.cards?.[this.adv.id]?.color;
        const defaultColor = data || this.plugin.state.settings.defaultColor;

        const applyColor = (color: string) => {
            card.style.setProperty('--callout-color', hexToRgb(color));
            card.style.setProperty('--checkbox-color', color)
            card.style.setProperty('--checkbox-color-hover', color)
        }

        applyColor(defaultColor);

        if (this.plugin.state.settings.showColorPicker) {
            const colorpicker = card.createEl('input', { type: 'color', value: defaultColor, cls: 'corner' });
            colorpicker.addEventListener('input', () => {
                applyColor(colorpicker.value);
                this.plugin.updateCard([this.adv.id, 'color'], colorpicker.value);
            })
        }
    }
}
