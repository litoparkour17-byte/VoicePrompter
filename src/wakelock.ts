// Keeps the screen on while the prompter is open. Without it a phone dims and
// locks after half a minute without touches, in the middle of a take.

let wanted = false;
let sentinel: any = null;

async function acquire(): Promise<void> {
    const wakeLock = (navigator as any).wakeLock;
    if (!wakeLock || sentinel || document.visibilityState !== 'visible') return;
    try {
        sentinel = await wakeLock.request('screen');
        sentinel.addEventListener('release', () => {
            sentinel = null;
        });
        if (!wanted) release();
    } catch (error) {
        // Refused, e.g. in Low Power Mode. The prompter works without it.
        console.log('Screen wake lock unavailable:', error);
    }
}

function release(): void {
    if (sentinel) {
        sentinel.release().catch(() => { });
        sentinel = null;
    }
}

export function keepScreenAwake(on: boolean): void {
    wanted = on;
    if (on) {
        acquire();
    } else {
        release();
    }
}

// The browser drops the lock whenever the page is hidden.
document.addEventListener('visibilitychange', () => {
    if (wanted) acquire();
});
