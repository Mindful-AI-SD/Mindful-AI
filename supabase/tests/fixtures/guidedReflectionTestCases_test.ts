import { guidedReflectionSchema } from "../../schema/guidedReflectionSchema.ts";

type ReflectionTestCase = {
	name: string;
	request: Record<string, unknown> & {
		userReflection: string | { "$repeat": string; count: number };
	};
	expected: {
		validation: "accept" | "reject";
		mockBehavior: string;
	};
};

const testCases = JSON.parse(
	await Deno.readTextFile(new URL("./guidedReflectionTestCases.json", import.meta.url)),
) as Record<string, ReflectionTestCase>;

function assert(condition: boolean, message: string): void {
	if (!condition) {
		throw new Error(message);
	}
}

function materializeRequest(testCase: ReflectionTestCase): Record<string, unknown> {
	const reflection = testCase.request.userReflection;
	if (typeof reflection === "string") {
		return testCase.request;
	}

	return {
		...testCase.request,
		userReflection: reflection["$repeat"].repeat(reflection.count),
	};
}

Deno.test("fixture dataset contains at least ten cases", () => {
	assert(Object.keys(testCases).length >= 10, "Expected at least ten reflection cases");
});

for (const testCase of Object.values(testCases)) {
	Deno.test(testCase.name, () => {
		const result = guidedReflectionSchema.safeParse(materializeRequest(testCase));
		const expectedToPass = testCase.expected.validation === "accept";

		assert(
			result.success === expectedToPass,
			`Expected validation to ${testCase.expected.validation}`,
		);
		assert(
			testCase.expected.mockBehavior.length > 0,
			"Expected a mock behavior for each fixture",
		);
	});
}