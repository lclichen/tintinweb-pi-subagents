/**
 * Subagent UI relay — routes a child agent's user-facing dialogs to the
 * PARENT session's UI context, prefixed with the agent name.
 *
 * Why: child sessions are created headless via the SDK; without a uiContext
 * the SDK silently substitutes a no-op context whose select/input return
 * undefined and confirm returns false. Ask-user-question style tools then
 * "succeed" against a phantom decline and the child keeps building on false
 * premises — worse than hanging. When the spawning session HAS an interactive
 * UI (pi-web RPC channel, pi CLI TUI), relaying dialogs through it makes the
 * question actually reach the human; when it does not, the child keeps the
 * honest no-op declines and the prompt (see prompts.ts) teaches it to state
 * assumptions and surface questions in its final report instead.
 *
 * Safety: only dialogs (select/confirm/input/editor/custom) and notify are
 * relayed. Everything host-surface-shaped — widgets, footer/header, editor,
 * status bar, themes, terminal input — is a no-op: a child must never
 * clobber the parent session's UI keys or host chrome.
 */
import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";

/**
 * Build the child-side UI context. `parentUI` must be the spawning
 * session's live UI context; dialogs get a `[agentName]` prefix so the user
 * can tell WHO is asking.
 */
export function createSubagentUIContext(parentUI: ExtensionUIContext, agentName: string): ExtensionUIContext {
	const prefix = `[${agentName}] `;
	return {
		select: (title, options, opts) => parentUI.select(prefix + title, options, opts),
		confirm: (title, message, opts) => parentUI.confirm(prefix + title, message, opts),
		input: (title, placeholder, opts) => parentUI.input(prefix + title, placeholder, opts),
		editor: (title, prefill) => parentUI.editor(prefix + title, prefill),
		notify: (message, type) => parentUI.notify(prefix + message, type),
		// Custom components capture host-side TUI objects; relaying the factory
		// across hosts is best-effort via the parent (no-op when unsupported).
		custom: ((factory: never, options?: never) =>
			typeof parentUI.custom === "function"
				? parentUI.custom(factory as never, options)
				: (Promise.resolve(undefined) as never)) as ExtensionUIContext["custom"],

		// Terminal/editor surface belongs to the parent session.
		onTerminalInput: () => () => {},
		pasteToEditor: () => {},
		setEditorText: () => {},
		getEditorText: () => "",
		addAutocompleteProvider: () => {},
		setEditorComponent: () => {},
		getEditorComponent: () => undefined,

		// Host chrome is the parent's; children never touch it.
		setStatus: () => {},
		setWorkingMessage: () => {},
		setWorkingVisible: () => {},
		setWorkingIndicator: () => {},
		setHiddenThinkingLabel: () => {},
		setWidget: () => {},
		setFooter: () => {},
		setHeader: () => {},
		setTitle: () => {},
		setToolsExpanded: () => {},

		// Read-only host facts pass through (harmless, keeps extensions that
		// style their text happy); mutations (theme switching) are refused.
		theme: parentUI.theme,
		getAllThemes: () => parentUI.getAllThemes(),
		getTheme: (name) => parentUI.getTheme(name),
		setTheme: () => ({ success: false, error: "subagents cannot switch the host theme" }),
		getToolsExpanded: () => parentUI.getToolsExpanded(),
	};
}
