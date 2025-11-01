import { App, PluginSettingTab, Setting } from 'obsidian';
import DaggerheartPlugin from './main';

export class SettingTab extends PluginSettingTab {
    constructor(app: App, private plugin: DaggerheartPlugin) {
        super(app, plugin);
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Default card color')
            .addColorPicker(color => color
                .setValue(this.plugin.state.settings.defaultColor)
                .onChange((value) => {
                    this.plugin.state.settings.defaultColor = value;
                    this.plugin.updateState();
                    this.plugin.renderAll();
                }));

        new Setting(containerEl)
            .setName('Show color picker on cards')
            .addToggle(toggle => toggle
                .setValue(this.plugin.state.settings.showColorPicker)
                .onChange((value) => {
                    this.plugin.state.settings.showColorPicker = value;
                    this.plugin.updateState();
                    this.plugin.renderAll();
                }));

        new Setting(containerEl)
            .setName('Show "Massive" threshold button')
            .addToggle(toggle => toggle
                .setValue(this.plugin.state.settings.showMassiveThreshold)
                .onChange((value) => {
                    this.plugin.state.settings.showMassiveThreshold = value;
                    this.plugin.updateState();
                    this.plugin.renderAll();
                }));
    }
}
