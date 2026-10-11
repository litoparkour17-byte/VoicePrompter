import { state } from './state';
import { AppConfig } from './types';

const SETTINGS_KEY = 'teleprompter_settings';

interface SavedSettings {
    config?: Partial<AppConfig>;
    languageSetting?: string;
}

// Restores the settings saved on this device. Call before the UI is
// initialized from state.
export function loadSettings(): void {
    let saved: SavedSettings;
    try {
        saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    } catch {
        return;
    }

    // Only known keys of the right type, so an old or damaged entry cannot break the app
    const config = state.config as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(saved.config || {})) {
        if (key in config && typeof value === typeof config[key]) {
            config[key] = value;
        }
    }

    if (typeof saved.languageSetting === 'string') {
        state.languageSetting = saved.languageSetting;
        if (saved.languageSetting !== 'auto') {
            state.selectedLanguage = saved.languageSetting;
        }
    }
}

export function saveSettings(): void {
    const saved: SavedSettings = { config: state.config, languageSetting: state.languageSetting };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(saved));
}
