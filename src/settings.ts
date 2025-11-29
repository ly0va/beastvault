import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import BeastVault from './main';

export type PluginSettings = {
    defaultColor: string;
    showColorPicker: boolean;
    showMassiveThreshold: boolean;
    numberOfPCs: number;
    libraryFolder?: string;
    ignoreDuplicateNames: boolean;
    compatibleWithFSB: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
    showColorPicker: true,
    showMassiveThreshold: false,
    defaultColor: '#8A5CF5',
    numberOfPCs: 4,
    ignoreDuplicateNames: true,
    compatibleWithFSB: false,
}

export class SettingTab extends PluginSettingTab {
    constructor(app: App, private plugin: BeastVault) {
        super(app, plugin);
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl).setName("Appearance").setHeading();

        new Setting(containerEl)
            .setName('Default color')
            .addColorPicker(color => color
                .setValue(this.plugin.state.settings.defaultColor)
                .onChange((value) => {
                    this.plugin.state.settings.defaultColor = value;
                    this.plugin.updateState();
                    this.plugin.renderAll();
                }));

        new Setting(containerEl)
            .setName('Show color picker')
            .addToggle(toggle => toggle
                .setValue(this.plugin.state.settings.showColorPicker)
                .onChange((value) => {
                    this.plugin.state.settings.showColorPicker = value;
                    this.plugin.updateState();
                    this.plugin.renderAll();
                }));

        new Setting(containerEl)
            .setName('Show the "massive" threshold button')
            .setDesc('Adds a 4th threshold button, for damage ≥ double the severe threshold')
            .addToggle(toggle => toggle
                .setValue(this.plugin.state.settings.showMassiveThreshold)
                .onChange((value) => {
                    this.plugin.state.settings.showMassiveThreshold = value;
                    this.plugin.updateState();
                    this.plugin.renderAll();
                }));

        new Setting(containerEl)
            .setName('Number of player characters')
            .setDesc('Used for battle points calculation in the status bar')
            .addSlider(slider => slider
                .setLimits(0, 10, 1)
                .setValue(this.plugin.state.settings.numberOfPCs)
                .setDynamicTooltip()
                .onChange((value) => {
                    this.plugin.state.settings.numberOfPCs = value;
                    this.plugin.updateState();
                    this.plugin.updateStatusBar();
                }));

        new Setting(containerEl).setName("Homebrew library").setHeading();

        new Setting(containerEl)
            .setName('Library folder location')
            .setDesc('Adversaries from notes, JSON and YAML files in this folder will become available in search')
            .addText(text => text
                .setPlaceholder('Example: daggerheart/homebrew')
                .setValue(this.plugin.state.settings.libraryFolder ?? '')
                .onChange(async (value) => {
                    this.plugin.state.settings.libraryFolder = value;
                    this.plugin.updateState();
                    await this.plugin.scanLibrary(false, 'conditional');
                    // TODO: add watcher?
                }))
            .addButton(button => button
                .setIcon('library')
                .setTooltip('View library')
                .onClick(async () => {
                    await this.plugin.scanLibrary(true, 'no');
                    new Notice('Library viewer under construction!');
                }));

        new Setting(containerEl)
            .setName('Ignore entries with duplicate names')
            .setDesc('If multiple adversaries share the same name, only the first one found will be used in search')
            .addToggle(toggle => toggle
                .setValue(this.plugin.state.settings.ignoreDuplicateNames)
                .onChange(async (value) => {
                    this.plugin.state.settings.ignoreDuplicateNames = value;
                    this.plugin.updateState();
                    await this.plugin.scanLibrary(false, 'no');
                }));

        new Setting(containerEl)
            .setName('Compatibility with Fantasy Statblocks')
            .setDesc('Any FSB-compatible statblocks in the notes inside the library folder will be also be available in search')
            .addToggle(toggle => toggle
                .setValue(this.plugin.state.settings.compatibleWithFSB)
                .onChange(async (value) => {
                    this.plugin.state.settings.compatibleWithFSB = value;
                    this.plugin.updateState();
                    await this.plugin.scanLibrary(false, 'no');
                }));
    }
}
