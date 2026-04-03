import { App, Editor, SuggestModal, Notice, MarkdownRenderChild, stringifyYaml, setIcon, MarkdownRenderer, Menu, type MarkdownPostProcessorContext } from 'obsidian';
import { roll } from '@airjp73/dice-notation';
import BeastVault from './main';
import { hexToRgb, DICE_PATTERN, processAdversary, DH_CONDITIONS, autoSuffixName } from './utils';

type Feature = {
    name?: string;
    type?: string;
    desc?: string;
    uses?: number;
    countdown?: number;
    flavor?: string;
    summon?: string | string[];
}

// Stored in library, as entered by user.
// Pasted into editor when inserted.
export type RawAdversary = {
    name?: string;
    tier?: number;
    type?: string;
    desc?: string;
    difficulty?: string | number;
    features?: Feature[];

    // these are for environments
    tone?: string;
    impulses?: string;
    adversaries?: string;

    // these are for adversaries
    hp?: number;
    stress?: number;
    thresholds?: string | number | number[];
    attack?: string | number;
    xp?: string | string[];
    motives?: string;

    weapon?: string;
    range?: string;
    damage?: string;

    // custom conditions defined on this statblock
    conditions?: string | string[];

    // these are not rendered
    source?: string;
    id?: string;
    raw?: string;
};

// Used when rendering.
// 'id' is not rendered but required to track state.
export type Adversary = Omit<RawAdversary, 'source' | 'raw'> & {
    difficulty?: string;
    features: Feature[];
    hp: number; // 0 for environments
    stress: number; // 0 for environments
    thresholds: number[];
    attack?: string;
    xp: string[];
    id: string;
}

function subTitle(tier?: number, type?: string) {
    return (tier ? `Tier ${tier} ` : '') + (type ? type : '');
}

export class AdversaryModal extends SuggestModal<RawAdversary> {
    constructor(app: App, private editor: Editor, private library: RawAdversary[]) {
        super(app);
        this.limit = 200;
    }

    getSuggestions(query: string): RawAdversary[] {
        return this.library.filter((adv: Adversary) =>
            adv.name!.toLowerCase().includes(query.toLowerCase())
        );
    }

    renderSuggestion(adv: RawAdversary, el: HTMLElement) {
        const heading = el.createDiv({ cls: 'bv-spreadout' });
        heading.createEl('b', { text: adv.name?.toUpperCase() || '' });
        heading.createSpan({ text: subTitle(adv.tier, adv.type), cls: 'bv-smaller' });
        el.createSpan({ text: adv.desc ?? '', cls: 'bv-smaller bv-muted' });
    }

    onChooseSuggestion(adv: RawAdversary, evt: MouseEvent | KeyboardEvent) {
        const copy = { ...adv };
        copy.id = Math.random().toString(36).slice(2);
        delete copy.source;
        delete copy.raw;

        // Auto-suffix for adversaries (has hp or stress), not environments
        if (adv.hp || adv.stress) {
            const content = this.editor.getValue();
            const baseName = adv.name ?? '';
            const suffixed = autoSuffixName(baseName, content);
            if (suffixed !== baseName) {
                copy.name = suffixed;
            }
        }

        let inserted: string;
        if (adv.raw) {
            // For raw (homebrew) entries, string-replace the name: line
            inserted = adv.raw;
            if (copy.name !== adv.name) {
                inserted = inserted.replace(/^(name:\s*).*$/m, `$1${copy.name}`);
            }
        } else {
            inserted = stringifyYaml(copy);
        }
        this.editor.replaceSelection(`\`\`\`daggerheart\n${inserted.trim()}\n\`\`\`\n`);
    }
}

export class AdversaryCard extends MarkdownRenderChild {
    count: number;
    filePath: string;
    public adv: Adversary;

    constructor(
        private container: HTMLElement,
        public raw: RawAdversary,
        private plugin: BeastVault,
        private ctx?: MarkdownPostProcessorContext
    ) {
        super(container);
        this.filePath = this.plugin.app.workspace.getActiveFile()?.path ?? '/';
        this.adv = processAdversary(raw, this.filePath);
        this.count = this.plugin.state.cards[this.adv.id]?.count || 1;
    }


    createTitle(card: HTMLElement) {
        const title = card.createDiv({ cls: 'callout-title bv-spreadout' });
        const nameEl = title.createEl('b', { cls: 'bv-larger bv-renameable', text: `${this.adv.name || ''}` });
        title.createEl('b', { cls: 'bv-smaller bv-padded', text: subTitle(this.adv.tier, this.adv.type) });

        nameEl.addEventListener('dblclick', () => {
            const input = createEl('input', { type: 'text', value: this.adv.name || '', cls: 'bv-rename-input' });
            nameEl.replaceWith(input);
            input.focus();
            input.select();

            const commit = () => {
                const newName = input.value.trim();
                if (newName && newName !== this.adv.name) {
                    this.renameTo(newName);
                } else {
                    // Re-render to restore the name element
                    this.render();
                }
            };

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); commit(); }
                if (e.key === 'Escape') this.render();
            });
            input.addEventListener('blur', commit);
        });
    }

    private renameTo(newName: string) {
        const sectionInfo = this.ctx?.getSectionInfo(this.container);
        const editor = this.plugin.app.workspace.activeEditor?.editor;
        if (!sectionInfo || !editor) return;

        const { lineStart, lineEnd } = sectionInfo;
        for (let i = lineStart; i <= lineEnd; i++) {
            const line = editor.getLine(i);
            if (/^name:\s/.test(line)) {
                editor.replaceRange(
                    `name: ${newName}\n`,
                    { line: i, ch: 0 },
                    { line: i + 1, ch: 0 }
                );
                break;
            }
        }
    }

    private markStressOnInstance(index: number) {
        const keys = [this.adv.id, index, 'stress'];
        const current = this.plugin.getCardState(keys as (string | number)[]) ?? 0;
        if (current >= this.adv.stress) {
            new Notice('All stress slots already marked');
            return;
        }
        this.plugin.updateCard(keys as (string | number)[], current + 1);
        this.render();

        const cardState = this.plugin.state.cards[this.adv.id] as any;
        const savedName = cardState?.[index]?.instanceName;
        const label = this.count > 1
            ? (savedName || `${this.adv.name || 'Instance'} ${index + 1}`)
            : (this.adv.name || 'Adversary');
        new Notice(`${label}: marked stress (${current + 1}/${this.adv.stress})`);
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
            const desc = content.createEl('p', { cls: "bv-smaller bv-muted bv-padded" });
            desc.createEl('i', { text: this.adv.desc });
        }

        const header = content.createEl('p', { cls: 'bv-smaller' });
        this.createHeaderEntry(header, 'Difficulty', this.adv.difficulty);

        if (this.adv.attack != null) {
            header.createEl('b', { text: 'Attack: ' });
            header.createSpan({ text: this.adv.attack, cls: 'bv-rollable bv-rollable-attack' });
            header.createEl('br');
        }

        if (this.adv.weapon || this.adv.range || this.adv.damage) {
            header.createEl('b', { text: `${this.adv.weapon || 'Weapon'}: ` })
            header.createSpan({ text: this.adv.range || '' })
            header.createSpan({ text: (this.adv.range && this.adv.damage) ? ' | ' : '' });
            this.adv.damage?.split(DICE_PATTERN).forEach(part => {
                header.createSpan({ text: part, cls: DICE_PATTERN.test(part) ? 'bv-rollable' : '' });
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
        const paragraph = content.createEl('p', { cls: 'bv-smaller' })
        paragraph.createEl('b', { text: feature.name || '' });
        paragraph.createSpan({ text: feature.type && `${feature.name}` ? ' - ' : '' });
        paragraph.createSpan({ text: feature.type || '' });
        if (feature.type || feature.name) {
            paragraph.createEl('br');
        }
        if (this.count == 1) {
            this.createStatSlots(paragraph, 'Uses', feature.uses || 0, [this.adv.id, 0, 'uses', index]);
            // For now, we only have countdowns in environments
            this.createStatSlots(paragraph, 'Countdown', feature.countdown || 0, [this.adv.id, 0, 'countdown', index]);
        }
        if (feature.desc) {
            const featureDiv = paragraph.createDiv({ cls: 'bv-feature' });
            void MarkdownRenderer.render(
                this.plugin.app,
                feature
                    .desc
                    .replace(/\b([sS])pend a [fF]ear\b/g, "<b>$1pend a Fear</b>")
                    .replace(/\b([mM])ark a [sS]tress\b/g, '<b class="bv-mark-stress">$1ark a Stress</b>')
                    .replace(DICE_PATTERN, `<span class=bv-rollable>$&</span>`),
                featureDiv,
                this.filePath,
                this
            );
        }
        // Summon buttons
        if (feature.summon) {
            const summons = Array.isArray(feature.summon) ? feature.summon : [feature.summon];
            const summonDiv = paragraph.createDiv({ cls: 'bv-summon-bar' });
            for (const summonName of summons) {
                const btn = summonDiv.createEl('button', {
                    text: `Summon: ${summonName}`,
                    cls: 'bv-summon-button',
                });
                btn.addEventListener('click', () => this.summonAdversary(summonName));
            }
        }

        if (feature.flavor) {
            paragraph.createDiv().createEl('i', { cls: 'bv-muted', text: feature.flavor });
        }
    }

    private summonAdversary(name: string) {
        const allAdv = this.plugin.allAdversaries();
        const allEnv = this.plugin.allEnvironments();
        const match = [...allAdv, ...allEnv].find(
            a => a.name?.toLowerCase() === name.toLowerCase()
        );

        if (!match) {
            new Notice(`"${name}" not found in library`);
            return;
        }

        const editor = this.plugin.app.workspace.activeEditor?.editor;
        if (!editor) {
            new Notice('No active editor');
            return;
        }

        const copy = { ...match };
        copy.id = Math.random().toString(36).slice(2);
        delete copy.source;
        delete copy.raw;

        // Apply auto-suffix if this is an adversary
        if (match.hp || match.stress) {
            const content = editor.getValue();
            const baseName = match.name ?? '';
            const suffixed = autoSuffixName(baseName, content);
            if (suffixed !== baseName) {
                copy.name = suffixed;
            }
        }

        let yaml: string;
        if (match.raw) {
            yaml = match.raw;
            if (copy.name !== match.name) {
                yaml = yaml.replace(/^(name:\s*).*$/m, `$1${copy.name}`);
            }
        } else {
            yaml = stringifyYaml(copy);
        }

        const lastLine = editor.lastLine();
        const lastLineContent = editor.getLine(lastLine);
        const insertPos = { line: lastLine, ch: lastLineContent.length };
        editor.replaceRange(`\n\n\`\`\`daggerheart\n${yaml.trim()}\n\`\`\`\n`, insertPos);
        new Notice(`Summoned ${copy.name}`);
    }

    createConditionBar(parent: HTMLElement, index: number) {
        const condBar = parent.createDiv({ cls: 'bv-conditions' });
        const cardState = this.plugin.state.cards[this.adv.id];
        const currentRaw = cardState?.[index as keyof typeof cardState];
        const current: string[] = Array.isArray((currentRaw as any)?.conditions) ? (currentRaw as any).conditions : [];

        // Build full condition list: standard + YAML-defined custom + any ad-hoc from state
        const yamlCustom = this.raw.conditions
            ? (Array.isArray(this.raw.conditions) ? this.raw.conditions : [this.raw.conditions])
            : [];
        const standardNames = DH_CONDITIONS as readonly string[];
        const allDefined = [...DH_CONDITIONS, ...yamlCustom.filter(c => !standardNames.includes(c))];
        // Also include any ad-hoc conditions that are in state but not in the defined list
        const adHoc = current.filter(c => !allDefined.includes(c));
        const allConditions = [...allDefined, ...adHoc];

        const addBadge = (condition: string) => {
            const active = current.includes(condition);
            const isCustom = !standardNames.includes(condition);
            const badge = condBar.createEl('span', {
                text: condition,
                cls: `bv-condition-badge ${active ? 'bv-condition-active' : ''} ${isCustom ? 'bv-condition-custom' : ''}`,
            });

            badge.addEventListener('click', () => {
                const isActive = badge.hasClass('bv-condition-active');
                const state = this.plugin.state.cards;
                if (!state[this.adv.id]) state[this.adv.id] = {};
                const card = state[this.adv.id] as any;
                if (!card[index]) card[index] = {};
                const inst = card[index];
                const conditions: string[] = Array.isArray(inst.conditions) ? [...inst.conditions] : [];

                if (isActive) {
                    inst.conditions = conditions.filter((c: string) => c !== condition);
                } else {
                    inst.conditions = [...conditions, condition];
                }
                this.plugin.updateState();
                badge.toggleClass('bv-condition-active', !isActive);
            });

            return badge;
        };

        for (const condition of allConditions) {
            addBadge(condition);
        }

        // "+" button for ad-hoc custom conditions
        const addBtn = condBar.createEl('span', {
            text: '+',
            cls: 'bv-condition-badge bv-condition-add',
        });
        addBtn.addEventListener('click', () => {
            const input = createEl('input', {
                type: 'text',
                cls: 'bv-condition-input',
                attr: { placeholder: 'Condition...' },
            });
            addBtn.replaceWith(input);
            input.focus();

            const commit = () => {
                const name = input.value.trim();
                if (name && !allConditions.includes(name)) {
                    const badge = addBadge(name);
                    allConditions.push(name);
                    // Auto-activate the new condition
                    badge.click();
                    input.replaceWith(addBtn);
                } else {
                    input.replaceWith(addBtn);
                }
            };

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); commit(); }
                if (e.key === 'Escape') input.replaceWith(addBtn);
            });
            input.addEventListener('blur', commit);
        });
    }

    createStatSlots(statBar: HTMLElement, name: string, stat: number, keys: (string | number)[], showControls = false) {
        const slots: HTMLInputElement[] = []
        const marked = this.plugin.getCardState(keys) ?? 0;
        if (stat > 0) {
            statBar.createSpan({ text: `${name}: ${stat} `, cls: "bv-muted" });
            for (let i = 0; i < stat; i++) {
                const slot = statBar.createEl('input', { type: 'checkbox', cls: 'bv-slot' });
                if (i < marked) {
                    slot.checked = true;
                }
                slots.push(slot);
            }

            const syncSlots = () => {
                const count = slots.reduce((sum, slot) => sum + (slot.checked ? 1 : 0), 0);
                this.plugin.updateCard(keys, count);
            };

            // Notify parent listeners (e.g. horde size) after programmatic changes
            const notifyChange = () => {
                if (slots.length > 0) slots[0].dispatchEvent(new Event('input', { bubbles: true }));
            };

            if (showControls) {
                const controls = statBar.createSpan({ cls: 'bv-slot-controls' });
                const minus = controls.createEl('button', { text: '\u2212', cls: 'bv-slot-btn', attr: { 'aria-label': `Remove 1 ${name}` } });
                const plus = controls.createEl('button', { text: '+', cls: 'bv-slot-btn', attr: { 'aria-label': `Add 1 ${name}` } });
                const clear = controls.createEl('button', { text: '\u2715', cls: 'bv-slot-btn bv-slot-btn-clear', attr: { 'aria-label': `Clear ${name}` } });

                plus.addEventListener('click', () => {
                    for (const slot of slots) {
                        if (!slot.checked) { slot.checked = true; break; }
                    }
                    syncSlots();
                    notifyChange();
                });

                minus.addEventListener('click', () => {
                    for (const slot of slots.toReversed()) {
                        if (slot.checked) { slot.checked = false; break; }
                    }
                    syncSlots();
                    notifyChange();
                });

                clear.addEventListener('click', () => {
                    for (const slot of slots) slot.checked = false;
                    syncSlots();
                    notifyChange();
                });
            }

            statBar.createEl('br');
            statBar.addEventListener('input', (event) => {
                if (!slots.contains(event.target as HTMLInputElement)) return;
                syncSlots();
            });
        }

        return slots;
    }

    createThresholdButtons(content: HTMLElement) {
        let minor, major, severe, massive;
        if (this.adv.thresholds.length > 0) {
            const thresholds = content.createEl('p', { cls: 'bv-thresholds' });
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

        // Per-instance name label when count > 1
        if (this.count > 1) {
            const cardState = this.plugin.state.cards[this.adv.id] as any;
            const savedName = cardState?.[index]?.instanceName;
            const defaultName = `${this.adv.name || 'Instance'} ${index + 1}`;
            const displayName = savedName || defaultName;

            const nameEl = statBar.createEl('b', {
                text: displayName,
                cls: 'bv-instance-name',
            });

            nameEl.addEventListener('click', () => {
                const input = createEl('input', {
                    type: 'text',
                    value: displayName,
                    cls: 'bv-instance-name-input',
                });
                nameEl.replaceWith(input);
                input.focus();
                input.select();

                const commit = () => {
                    const newName = input.value.trim();
                    if (newName && newName !== displayName) {
                        const state = this.plugin.state.cards;
                        if (!state[this.adv.id]) state[this.adv.id] = {};
                        const card = state[this.adv.id] as any;
                        if (!card[index]) card[index] = {};
                        card[index].instanceName = newName;
                        this.plugin.updateState();
                    }
                    // Re-render to show updated name
                    this.render();
                };

                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') { e.preventDefault(); commit(); }
                    if (e.key === 'Escape') this.render();
                });
                input.addEventListener('blur', commit);
            });

            statBar.createEl('br');
        }

        const [minor, major, severe, massive] = this.createThresholdButtons(statBar);
        const hpSlots = this.createStatSlots(statBar, 'HP', this.adv.hp, [this.adv.id, index, 'hp'], true);
        this.createStatSlots(statBar, 'Stress', this.adv.stress, [this.adv.id, index, 'stress'], true);

        // Condition badges for adversaries only (not environments)
        if (this.adv.hp || this.adv.stress) {
            this.createConditionBar(statBar, index);
        }

        if (this.count > 1) {
            for (const [featureIndex, feature] of this.adv.features.entries()) {
                const uses = feature.uses || 0;
                const name = feature.name || 'Unnamed feature uses';
                if (uses != 0) {
                    this.createStatSlots(statBar, name, uses, [this.adv.id, index, 'uses', featureIndex]);
                }
            }
        }

        let hordeSize: HTMLElement | null = null;
        let updateHordeSize: (() => void) | null = null;
        const match = this.adv.type?.match(/^horde\s+\((\d+)\/hp\)$/i);
        if (match && this.adv.hp > 0) {
            hordeSize = statBar.createSpan({ cls: "bv-muted" });
            updateHordeSize = () => {
                if (hordeSize == null) return;
                const size = parseInt(match[1]);
                const hp = this.plugin.getCardState([this.adv.id, index, 'hp']) ?? 0;
                const currentHP = this.adv.hp - hp;
                hordeSize.innerText = `Horde size: ${size * currentHP}`;
            };
            updateHordeSize();
            statBar.addEventListener('input', (event) => {
                if (!hpSlots.contains(event.target as HTMLInputElement)) return;
                updateHordeSize?.();
            })
        }

        const slotMarker = (x: number) => (event: MouseEvent) => {
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
            this.plugin.updateCard([this.adv.id, index, 'hp'], marked)
            updateHordeSize?.();
        };

        minor?.addEventListener('click', slotMarker(1));
        major?.addEventListener('click', slotMarker(2));
        severe?.addEventListener('click', slotMarker(3));
        massive?.addEventListener('click', slotMarker(4));
    }

    createPlusMinosButtons(card: HTMLElement, features: HTMLElement, statBlock: HTMLElement) {
        if (!this.adv.hp && !this.adv.stress) return;
        const add = card.createEl('button', {
            cls: 'bv-top-corner clickable-icon bv-invisible',
            attr: { 'aria-label': 'Increase adversary count' }
        })
        const remove = card.createEl('button', {
            cls: 'bv-top-corner clickable-icon bv-invisible',
            attr: { 'aria-label': 'Decrease adversary count' }
        })
        setIcon(add, 'plus')
        setIcon(remove, 'minus')

        // hacky but works for now
        window.setTimeout(() => {
            const editable = card.parentElement?.nextElementSibling?.classList.contains('edit-block-button');
            if (editable) {
                add.addClass('bv-lower-1');
                remove.addClass('bv-lower-2');
            } else {
                remove.addClass('bv-lower-1');
            }
            add.removeClass('bv-invisible');
            remove.removeClass('bv-invisible');
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

        for (const [index, feature] of this.adv.features.entries()) {
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
        const card = this.container.createDiv({ cls: 'callout bv-statblock', attr: { 'data-callout': 'daggerheart-card' } });
        this.createTitle(card);

        card.addEventListener('click', (event) => {
            const elt = event.target as HTMLElement;

            // "Mark a Stress" clickable action
            if (elt.classList.contains('bv-mark-stress')) {
                if (this.adv.stress <= 0) return;
                if (this.count === 1) {
                    this.markStressOnInstance(0);
                } else {
                    const menu = new Menu();
                    for (let i = 0; i < this.count; i++) {
                        const cardState = this.plugin.state.cards[this.adv.id] as any;
                        const savedName = cardState?.[i]?.instanceName;
                        const label = savedName || `${this.adv.name || 'Instance'} ${i + 1}`;
                        menu.addItem((item) => item
                            .setTitle(label)
                            .onClick(() => this.markStressOnInstance(i)));
                    }
                    menu.showAtMouseEvent(event as MouseEvent);
                }
                return;
            }

            // Dice rolling
            if (!elt.classList.contains('bv-rollable')) return;
            const dice = elt.classList.contains('bv-rollable-attack')
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
        this.createPlusMinosButtons(card, features, statBlock);

        const data = this.plugin.state.cards[this.adv.id]?.color;
        const defaultColor = data || this.plugin.state.settings.defaultColor;

        const applyColor = (color: string) => {
            card.style.setProperty('--callout-color', hexToRgb(color));
            card.style.setProperty('--checkbox-color', color)
            card.style.setProperty('--checkbox-color-hover', color)
        }

        applyColor(defaultColor);

        if (this.plugin.state.settings.showColorPicker) {
            const colorpicker = card.createEl('input', { type: 'color', value: defaultColor, cls: 'bv-bottom-corner' });
            colorpicker.addEventListener('input', () => {
                applyColor(colorpicker.value);
                this.plugin.updateCard([this.adv.id, 'color'], colorpicker.value);
            })
        }
    }
}
