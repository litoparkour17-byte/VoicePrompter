export type VisitorPlatform = 'ios' | 'android' | 'mac' | 'linux' | 'windows' | 'other';
export type NativePromoPlatform = 'ios' | 'android' | 'mac';

export interface NativePromoPair {
    line1: string;
    line2: string;
    rotating: string[];
}

export interface NativePromo {
    platform: NativePromoPlatform;
    title: string;
    href: string;
    analyticsEvent: string;
    pairs: NativePromoPair[];
}

interface NavigatorPlatformData {
    userAgent: string;
    platform: string;
    maxTouchPoints: number;
}

const NATIVE_PROMOS: Record<NativePromoPlatform, NativePromo> = {
    ios: {
        platform: 'ios',
        title: 'Нативное приложение для iOS',
        href: 'https://voiceprompter.app/ios/',
        analyticsEvent: 'settings-banner-ios',
        pairs: [
            {
                line1: 'Прокрутка по голосу нового поколения',
                line2: 'Понимает ',
                rotating: ['паузы', 'отсебятину', 'пропуск строк', 'смену темпа']
            },
            {
                line1: 'Поверх других приложений или запись в 4K',
                line2: 'Подходит для ',
                rotating: ['Reels', 'TikTok', 'YouTube Shorts', 'стримов']
            }
        ]
    },
    android: {
        platform: 'android',
        title: 'Нативное приложение для Android',
        href: 'https://voiceprompter.app/android/',
        analyticsEvent: 'settings-banner-android',
        pairs: [
            {
                line1: 'Прокрутка по голосу нового поколения',
                line2: 'Понимает ',
                rotating: ['паузы', 'отсебятину', 'пропуск строк', 'смену темпа']
            },
            {
                line1: 'Поверх других приложений или запись в 4K',
                line2: 'Подходит для ',
                rotating: ['Reels', 'TikTok', 'YouTube Shorts', 'стримов']
            }
        ]
    },
    mac: {
        platform: 'mac',
        title: 'Нативное приложение для macOS',
        href: 'https://voiceprompter.app/mac/',
        analyticsEvent: 'settings-banner-mac',
        pairs: [
            {
                line1: 'Прокрутка по голосу нового поколения',
                line2: 'Понимает ',
                rotating: ['паузы', 'отсебятину', 'пропуск строк', 'смену темпа']
            },
            {
                line1: 'Не виден при показе экрана',
                line2: 'Подходит для ',
                rotating: ['видеозвонков', 'демо для клиентов', 'собеседований', 'презентаций']
            },
            {
                line1: 'Не виден на записи экрана',
                line2: 'Подходит для ',
                rotating: ['Loom', 'роликов на YouTube', 'обучающих видео', 'демо продукта']
            }
        ]
    }
};

export function detectVisitorPlatform(
    navigatorData: NavigatorPlatformData = navigator
): VisitorPlatform {
    const { userAgent, platform, maxTouchPoints } = navigatorData;

    if (/iPad|iPhone|iPod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1)) {
        return 'ios';
    }
    if (/Android/i.test(userAgent)) {
        return 'android';
    }
    if (/Mac/i.test(platform) || /Macintosh|Mac OS X/i.test(userAgent)) {
        return 'mac';
    }
    if (/Linux/i.test(platform) || /Linux/i.test(userAgent)) {
        return 'linux';
    }
    if (/Win/i.test(platform) || /Windows/i.test(userAgent)) {
        return 'windows';
    }
    return 'other';
}

export function getNativePromo(visitorPlatform: VisitorPlatform): NativePromo {
    if (visitorPlatform === 'ios') return NATIVE_PROMOS.ios;
    if (visitorPlatform === 'android') return NATIVE_PROMOS.android;
    return NATIVE_PROMOS.mac;
}
