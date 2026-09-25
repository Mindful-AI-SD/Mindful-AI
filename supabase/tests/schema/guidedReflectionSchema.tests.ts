import { guidedReflectionSchema } from "../../schema/guidedReflectionSchema.ts";

const validFixture = {
	activityId: "550e8400-e29b-41d4-a716-446655440000",
	activityContext: "A breathing exercise about noticing physical sensations.",
	userReflection: "I noticed my breathing slow down.",
	intentions: [
		"Pause before reacting",
		"Notice my breathing",
		"Respond thoughtfully",
	],
};

const emptyReflectionFixture = {
	...validFixture,
	userReflection: "   ",
};

const oversizedReflectionFixture = {
	...validFixture,
	userReflection: "x".repeat(2001),
};

const missingIntentionsFixture = {
	activityId: validFixture.activityId,
	activityContext: validFixture.activityContext,
	userReflection: validFixture.userReflection,
};

const unexpectedFieldFixture = {
	...validFixture,
	unexpectedField: true,
};

function assert(condition: boolean, message: string): void {
	if (!condition) {
		throw new Error(message);
	}
}

Deno.test("accepts a valid guided reflection fixture", () => {
	const result = guidedReflectionSchema.safeParse(validFixture);

	assert(result.success, "The valid fixture should be accepted");
});

Deno.test("rejects empty reflection text", () => {
	const result = guidedReflectionSchema.safeParse(emptyReflectionFixture);

	assert(!result.success, "Empty reflection text should be rejected");
	if (!result.success) {
		assert(
			result.error.issues.some(
				(issue) => issue.path[0] === "userReflection",
			),
			"The error should identify userReflection",
		);
	}
});

Deno.test("rejects oversized reflection text", () => {
	const result = guidedReflectionSchema.safeParse(oversizedReflectionFixture);

	assert(!result.success, "Oversized reflection text should be rejected");
	if (!result.success) {
		assert(
			result.error.issues.some(
				(issue) => issue.path[0] === "userReflection" && issue.code === "too_big",
			),
			"The error should identify an oversized userReflection",
		);
	}
});

Deno.test("rejects missing intentions", () => {
	const result = guidedReflectionSchema.safeParse(missingIntentionsFixture);

	assert(!result.success, "Missing intentions should be rejected");
	if (!result.success) {
		assert(
			result.error.issues.some((issue) => issue.path[0] === "intentions"),
			"The error should identify intentions",
		);
	}
});

Deno.test("rejects unexpected fields", () => {
	const result = guidedReflectionSchema.safeParse(unexpectedFieldFixture);

	assert(!result.success, "Unexpected fields should be rejected");
	if (!result.success) {
		assert(
			result.error.issues.some(
				(issue) => issue.code === "unrecognized_keys",
			),
			"The error should identify an unexpected field",
		);
	}
});
