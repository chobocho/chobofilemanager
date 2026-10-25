// The text to show for a failure: an Error's message (Go errors arrive as
// strings or as Error objects from the Wails bridge), or the value itself.
export function errText(e: unknown): string {
    return String((e as {message?: unknown} | null | undefined)?.message ?? e);
}
