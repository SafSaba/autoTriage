export function logEvent(_eventName: string, _eventParams?: Record<string, unknown>) {
  // No-op in standalone SUT build (decoupled from Firebase Analytics)
}
