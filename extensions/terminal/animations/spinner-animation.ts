/**
 * Combined text animation for the spinner working line: a typewriter that
 * switches verbs every so often, with optional animated dots. While the
 * typewriter is clearing/typing, the dots step aside and re-spawn once the new
 * verb is fully on screen.
 */

import { DotsAnimator } from "./spin-dots.ts";
import { TypewriterAnimator } from "./typewriter.ts";
import type { SpawnScheduler } from "./spin-dots.ts";

export interface SpinnerTextAnimator {
    /** Display the first verb immediately and start the enabled animation loops. */
    start(initialVerb: string): void;
    /** Cancel animation loops; the displayed text goes back to the caller. */
    stop(): void;
    /**
     * While true, the working line shows tool descriptions instead of the
     * verb: switching pauses until tools finish; enabled dots can keep moving.
     */
    setToolActive(active: boolean): void;
    /** Enable or disable the animated dot suffix. */
    setDotsEnabled(enabled: boolean): void;
    /** Show or hide the dot suffix entirely. */
    setDotsVisible(visible: boolean): void;
    /** True while the verb is fading out or typing in. */
    isAnimating(): boolean;
    /** Fade amount for the outgoing verb, from 0 to 1. */
    fadeAmount(): number;
    /** The verb text to render right now (may be fading out or typing in). */
    displayedText(): string;
    /** The trailing dots to render right now. */
    dotsSuffix(): string;
}

export function createSpinnerTextAnimator(options: {
    schedule: SpawnScheduler;
    pickVerb: (previous: string) => string;
    onChange?: () => void;
    animatedDots?: boolean;
    dotsVisible?: boolean;
}): SpinnerTextAnimator {
    const dots = new DotsAnimator(options.schedule, Math.random, options.onChange);
    let dotsEnabled = options.animatedDots === true;
    let dotsVisible = options.dotsVisible !== false;
    const typewriter = new TypewriterAnimator(
        options.schedule,
        Math.random,
        options.onChange,
        (phase) => {
            // Dots hide during the fade and retyping, then re-spawn fresh.
            if (phase !== "stable") {
                dots.stop();
            } else if (phase === "stable" && dotsEnabled && dotsVisible) {
                dots.start();
            }
        },
        { pickNext: options.pickVerb },
    );
    return {
        start(initialVerb: string): void {
            typewriter.start(initialVerb);
            if (dotsEnabled && dotsVisible) dots.start();
        },
        stop(): void {
            typewriter.stop();
            dots.stop();
        },
        setToolActive(active: boolean): void {
            typewriter.setToolActive(active);
        },
        setDotsEnabled(enabled: boolean): void {
            if (dotsEnabled === enabled) return;
            dotsEnabled = enabled;
            if (enabled && dotsVisible && !typewriter.isAnimating) dots.start();
            else dots.stop();
        },
        setDotsVisible(visible: boolean): void {
            if (dotsVisible === visible) return;
            dotsVisible = visible;
            if (!visible) dots.stop();
            else if (dotsEnabled && !typewriter.isAnimating) dots.start();
        },
        isAnimating(): boolean {
            return typewriter.isAnimating;
        },
        fadeAmount(): number {
            return typewriter.fadeAmount;
        },
        displayedText(): string {
            return typewriter.displayedText;
        },
        dotsSuffix(): string {
            if (!dotsVisible) return " ";
            if (!dotsEnabled) return "...";
            return typewriter.isAnimating ? "" : dots.suffix;
        },
    };
}
