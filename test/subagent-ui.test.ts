import { describe, expect, it } from "vitest";
import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { createSubagentUIContext } from "../src/subagent-ui.js";

/** Recording stub of the parent UI surface. */
function parentUI(overrides: Partial<ExtensionUIContext> = {}): ExtensionUIContext & {
	calls: Array<{ method: string; args: unknown[] }>;
} {
	const calls: Array<{ method: string; args: unknown[] }> = [];
	const record =
		(method: string, impl?: (...args: unknown[]) => unknown) =>
		(...args: unknown[]) => {
			calls.push({ method, args });
			return impl?.(...args);
		};
	const noop = () => {};
	return {
		calls,
		select: record("select", () => "choice") as ExtensionUIContext["select"],
		confirm: record("confirm", () => true) as ExtensionUIContext["confirm"],
		input: record("input", () => "typed") as ExtensionUIContext["input"],
		editor: record("editor", () => "edited") as ExtensionUIContext["editor"],
		notify: record("notify") as ExtensionUIContext["notify"],
		setStatus: noop,
		setWidget: noop,
		setFooter: noop,
		setHeader: noop,
		setTitle: noop,
		setWorkingMessage: noop,
		setWorkingVisible: noop,
		setWorkingIndicator: noop,
		setHiddenThinkingLabel: noop,
		onTerminalInput: () => () => {},
		pasteToEditor: noop,
		setEditorText: noop,
		getEditorText: () => "",
		addAutocompleteProvider: noop,
		setEditorComponent: noop,
		getEditorComponent: () => undefined,
		theme: {} as ExtensionUIContext["theme"],
		getAllThemes: () => [],
		getTheme: () => undefined,
		setTheme: () => ({ success: true }),
		getToolsExpanded: () => false,
		setToolsExpanded: noop,
		...overrides,
	} as ExtensionUIContext & { calls: Array<{ method: string; args: unknown[] }> };
}

describe("createSubagentUIContext", () => {
	it("relays dialogs with the agent-name prefix and passes results through", async () => {
		const parent = parentUI();
		const ui = createSubagentUIContext(parent, "auth-audit");

		expect(await ui.select("Pick one", ["a", "b"])).toBe("choice");
		expect(await ui.confirm("Go ahead?", "msg")).toBe(true);
		expect(await ui.input("Name?", "placeholder")).toBe("typed");
		await ui.editor("Edit this", "prefill");
		ui.notify("halfway done", "info");

		const byMethod = new Map(parent.calls.map((c) => [c.method, c.args]));
		expect(byMethod.get("select")?.[0]).toBe("[auth-audit] Pick one");
		expect(byMethod.get("confirm")?.[0]).toBe("[auth-audit] Go ahead?");
		expect(byMethod.get("input")?.[0]).toBe("[auth-audit] Name?");
		expect(byMethod.get("editor")?.[0]).toBe("[auth-audit] Edit this");
		expect(byMethod.get("notify")?.[0]).toBe("[auth-audit] halfway done");
	});

	it("relays dialog options/opts untouched", async () => {
		const parent = parentUI();
		const ui = createSubagentUIContext(parent, "Explore");
		const signal = new AbortController().signal;
		await ui.select("Q", ["x", "y"], { timeout: 500, signal });
		const args = parent.calls.find((c) => c.method === "select")!.args;
		expect(args[1]).toEqual(["x", "y"]);
		expect(args[2]).toEqual({ timeout: 500, signal });
	});

	it("never forwards host-chrome mutations to the parent", () => {
		const parent = parentUI();
		const ui = createSubagentUIContext(parent, "Plan");

		// All of these must be local no-ops — a child must not clobber the
		// parent session's widgets, chrome, editor or terminal.
		ui.setWidget("todo-list", ["hijack"]);
		ui.setStatus("key", "hijack");
		ui.setFooter(undefined as never);
		ui.setHeader(undefined as never);
		ui.setTitle("hijack");
		ui.setWorkingMessage("hijack");
		ui.pasteToEditor("hijack");
		ui.setEditorText("hijack");
		ui.setToolsExpanded(true);
		expect(ui.getEditorText()).toBe("");
		expect(() => ui.onTerminalInput(() => {})).not.toThrow();

		expect(parent.calls.filter((c) => c.method !== "getToolsExpanded")).toHaveLength(0);
	});

	it("refuses theme switching but passes theme facts through", () => {
		const parent = parentUI();
		const ui = createSubagentUIContext(parent, "Explore");
		const refused = ui.setTheme("monokai");
		expect(refused.success).toBe(false);
		expect(ui.getTheme("nope")).toBeUndefined();
		expect(ui.getAllThemes()).toEqual([]);
	});

	it("custom relays when the parent supports it and resolves undefined otherwise", async () => {
		const relaying = parentUI({
			custom: (() => Promise.resolve("custom-result")) as ExtensionUIContext["custom"],
		} as Partial<ExtensionUIContext>);
		const withRelay = createSubagentUIContext(relaying, "A");
		await expect((withRelay.custom as unknown as (...a: unknown[]) => Promise<unknown>)()).resolves.toBe("custom-result");

		const bare = parentUI() as Partial<ExtensionUIContext>;
		delete bare.custom;
		const withoutRelay = createSubagentUIContext(bare as ExtensionUIContext, "A");
		await expect(
			(withoutRelay.custom as unknown as (...a: unknown[]) => Promise<unknown>)(),
		).resolves.toBeUndefined();
	});
});
