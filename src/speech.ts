import { state } from './state';
import { els } from './elements';
import { updateMicUI, updateHighlight, scrollToCurrent, advancePastSkipped, restartScript, navigateParagraphs } from './render';
import { ScriptWord } from './types';
import { tokenize, Token } from './match/normalize';
import { indexScript, tokenAtWord, wordAtToken, ScriptIndex } from './match/script';
import { Tracker } from './match/tracker';
import { findCommand, VoiceCommand } from './match/commands';

// The script being followed and the tracker built for it.
interface Following {
    words: ScriptWord[];
    lang: string;
    index: ScriptIndex;
    tracker: Tracker;
    wordIndex: number; // state.currentIndex as the tracker left it
}

let following: Following | null = null;

// The transcript as last delivered, tokenized
let lastHeard: Token[] = [];

let speechBlocked = false;

// Voice command arming to prevent duplicate triggers
let commandArmed = true;
let lastCommandAt = -Infinity;
// iOS Safari may deliver the same words again shortly after; one "назад" must not go back twice
const COMMAND_REPEAT_MS = 1500;

// Arc / silent-fail detection
let isFirstStart = true;
let gotResultOnFirstStart = false;

const SPEECH_ERRORS: Record<string, string> = {
    'not-allowed': 'Нет доступа к микрофону. Разрешите его для этого сайта в настройках браузера.',
    'service-not-allowed': 'Распознавание речи на устройстве выключено. На iPhone включите диктовку: Настройки → Основные → Клавиатура.',
    'audio-capture': 'Микрофон не найден.',
    'network': 'Распознавание речи не достучалось до сервера. Проверьте интернет.',
    'language-not-supported': 'На этом устройстве распознавание речи не поддерживает выбранный язык.'
};

function showBrowserWarning() {
    els.browserWarning.classList.remove('hidden');
}

let speechErrorTimer: ReturnType<typeof setTimeout> | null = null;
function showSpeechError(error: string) {
    const message = SPEECH_ERRORS[error];
    if (!message) return;
    els.speechErrorText.textContent = message;
    els.speechErrorToast.classList.remove('hidden');
    if (speechErrorTimer) clearTimeout(speechErrorTimer);
    speechErrorTimer = setTimeout(() => els.speechErrorToast.classList.add('hidden'), 8000);
}

// Apple does not give speech recognition to pages opened from the Home Screen
// as a web app; the same page works in a Safari tab.
function isHomeScreenAppOnIOS(): boolean {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 2);
    const isPWA = (window.navigator as any).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    return isIOS && isPWA;
}

// The line at the top of the prompter that shows what was heard (?debug=1)
function showHeard(text: string) {
    if (localStorage.getItem('debug-heard') !== '1') return;
    els.heardDebug.classList.remove('hidden');
    els.heardDebug.textContent = text;
}

export function initSpeech(): void {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
        // No API at all — Firefox, older browsers
        showBrowserWarning();
        return;
    }

    state.recognition = new SpeechRecognition();
    state.recognition.continuous = true;
    state.recognition.interimResults = true;
    state.recognition.lang = state.selectedLanguage;

    state.recognition.onresult = (event: any) => {
        // Mark that we got real results on first start (rules out Arc silent fail)
        if (isFirstStart) {
            gotResultOnFirstStart = true;
        }

        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript + ' ';
        }

        // Uses all results (interim + final) for responsiveness
        handleTranscript(transcript);
    };

    state.recognition.onerror = (e: any) => {
        console.log('error:', e.error, e.message);
        showHeard(`ошибка: ${e.error}`);

        if (isHomeScreenAppOnIOS() && (e.error === 'service-not-allowed' || e.error === 'not-allowed')) {
            isFirstStart = false;
            speechBlocked = true;
            els.ipadPwaWarning.classList.remove('hidden');
            state.isListening = false;
            updateMicUI(false);
            return;
        }
        showSpeechError(e.error);

        // Arc / silent-fail detection: error fires immediately on first start with no results
        if (isFirstStart && !gotResultOnFirstStart) {
            isFirstStart = false;
            if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture' || e.error === 'aborted') {
                // These are legitimate errors that don't mean the browser lacks support
                // 'aborted' happens on Safari iOS when the permission dialog interrupts the first recognition start
            } else {
                showBrowserWarning();
            }
            state.isListening = false;
            updateMicUI(false);
            return;
        }

        if (e.error === 'aborted') {
            speechBlocked = true;

            if (isHomeScreenAppOnIOS()) {
                els.ipadPwaWarning.classList.remove('hidden');
            }

            state.isListening = false;
            updateMicUI(false);
            return;
        }
    };

    state.recognition.onend = () => {
        console.log('ended');

        // Arc / silent-fail detection: ended immediately on first start with no results and no error
        if (isFirstStart && !gotResultOnFirstStart) {
            isFirstStart = false;
            showBrowserWarning();
            state.isListening = false;
            updateMicUI(false);
            return;
        }
        isFirstStart = false;

        if (speechBlocked) return;
        if (state.isListening) {

            try {
                state.recognition.start();
            } catch (error) {
                console.error('Failed to restart speech recognition:', error);
            }
        } else {
            updateMicUI(false);
        }
    };
}

export function startListening(): void {
    if (!state.recognition) return;
    state.isListening = true;
    following?.tracker.forget();
    lastHeard = [];
    commandArmed = true;

    speechBlocked = false;
    try {
        state.recognition.start();
        updateMicUI(true);
    } catch (error) {
        console.error('Failed to start speech recognition:', error);
        state.isListening = false;
        updateMicUI(false);
    }
}

export function stopListening(): void {
    if (!state.recognition) return;
    state.isListening = false;

    try {
        state.recognition.stop();
        updateMicUI(false);
    } catch (error) {
        console.error('Failed to stop speech recognition:', error);
    }
}

// Returns the tracker for the script on screen, positioned at the current word.
function followScript(): Following {
    if (!following || following.words !== state.scriptWords || following.lang !== state.selectedLanguage) {
        const index = indexScript(state.scriptWords, state.selectedLanguage);
        const tracker = new Tracker(index.tokens, state.config.lookaheadWords);
        // What was said before this script appeared is not part of reading it
        tracker.feed(lastHeard);
        following = { words: state.scriptWords, lang: state.selectedLanguage, index, tracker, wordIndex: -1 };
    }
    if (following.wordIndex !== state.currentIndex) {
        // Moved by a tap, a button, a voice command or auto-scroll
        following.tracker.jumpTo(tokenAtWord(following.index, state.currentIndex));
        following.wordIndex = state.currentIndex;
    }
    following.tracker.near = state.config.lookaheadWords;
    return following;
}

function runCommand(command: VoiceCommand) {
    console.log(`[VoiceCommand] TRIGGER: ${command}`);
    if (command === 'start') {
        restartScript();
    } else if (command === 'finish') {
        state.currentIndex = Math.max(0, state.scriptWords.length - 1);
        updateHighlight();
        scrollToCurrent();
    } else if (command === 'next') {
        navigateParagraphs('forward', 1);
    } else if (command === 'back') {
        navigateParagraphs('back', 1);
    }
}

// Takes the transcript heard so far: runs a voice command if it ends with
// one, otherwise moves the script to where the reader is.
export function handleTranscript(transcript: string): void {
    const script = followScript();
    const heard = tokenize(transcript, state.selectedLanguage);
    lastHeard = heard;
    showHeard(transcript.trim().split(/\s+/).slice(-8).join(' '));

    if (state.config.voiceCommandsEnabled) {
        // Conflict resolution: look around the current position (back 4, forward 12)
        const pos = script.tracker.pos;
        const nearby = script.index.tokens.slice(Math.max(0, pos - 4), pos + 12);
        const command = findCommand(heard, nearby);
        if (!command) {
            commandArmed = true;
        } else {
            if (commandArmed && performance.now() - lastCommandAt > COMMAND_REPEAT_MS) {
                commandArmed = false;
                lastCommandAt = performance.now();
                // The words up to the command are spent too
                script.tracker.feed(heard);
                script.wordIndex = -1;
                runCommand(command);
            }
            return; // Stop processing to prevent the command from being read as script text
        }
    }

    if (script.tracker.feed(heard)) {
        state.currentIndex = wordAtToken(script.index, script.tracker.pos);
        advancePastSkipped();
        script.wordIndex = state.currentIndex;
        updateHighlight();
        scrollToCurrent();
    }
}
