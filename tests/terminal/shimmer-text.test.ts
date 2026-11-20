import assert from "node:assert/strict";
import { test } from "node:test";

import { renderShimmerText } from "../../extensions/terminal/animations/shimmer-text.ts";

const BASE = "\x1b[38;2;80;90;100m";

function firstForegroundColor(text: string): number[] {
    const match = /\x1b\[38;2;(\d+);(\d+);(\d+)m/.exec(text);
    assert.ok(match);
    return match.slice(1).map(Number);
}

test("flash brightens text twice, with a dimmer second pulse", () => {
    const render = (elapsedMs: number) => renderShimmerText("Working", BASE, 0, false, 0, {
        style: "flash",
        elapsedMs,
    });
    const base = firstForegroundColor(render(800));
    const first = firstForegroundColor(render(90));
    const second = firstForegroundColor(render(430));

    assert.ok(first[0] > second[0]);
    assert.ok(second[0] > base[0]);
});

test("default shimmer sweeps spinner text", () => {
    const first = renderShimmerText("Working...", BASE, 0, false, 0);
    const next = renderShimmerText("Working...", BASE, 0, false, 200);

    assert.notEqual(first, next);
});

test("sparkle moves quickly through the spinner word with a dim halo", () => {
    const render = (elapsedMs: number) => renderShimmerText("Working", BASE, 0, false, 0, {
        style: "sparkle",
        elapsedMs,
    });
    const glyphs = (text: string) => [...text.matchAll(/\x1b\[38;2;(\d+);(\d+);(\d+)m(.)/g)];
    const brightestIndex = (text: string) => {
        const colors = glyphs(text).map((match) => match.slice(1, 4).map(Number));
        return colors.reduce(
            (brightest, color, index) =>
                color.reduce((sum, channel) => sum + channel, 0)
                    > colors[brightest].reduce((sum, channel) => sum + channel, 0)
                    ? index
                    : brightest,
            0,
        );
    };
    const atStart = glyphs(render(0));
    assert.equal(brightestIndex(render(0)), 0);
    assert.equal(brightestIndex(render(52 * 3)), 3);
    assert.equal(brightestIndex(render(52 * 4)), 4);
    const colorScore = (match: RegExpMatchArray) => match.slice(1, 4).map(Number).reduce((sum, channel) => sum + channel, 0);
    assert.ok(colorScore(atStart[1]) > colorScore(atStart[3]));
});
