import assert from "node:assert/strict";
import test from "node:test";

import { createSpinnerTextAnimator } from "../extensions/spinner-animation.ts";

const schedule = () => () => {};
const pickVerb = () => "Thinking";

test("disabled spinner dots use one space and can be shown again", () => {
	const animator = createSpinnerTextAnimator({ schedule, pickVerb });

	assert.equal(animator.dotsSuffix(), "...");
	animator.setDotsVisible(false);
	assert.equal(animator.dotsSuffix(), " ");
	animator.setDotsVisible(true);
	assert.equal(animator.dotsSuffix(), "...");
});

test("spinner dots can start hidden", () => {
	const animator = createSpinnerTextAnimator({ schedule, pickVerb, dotsVisible: false });

	assert.equal(animator.dotsSuffix(), " ");
});
