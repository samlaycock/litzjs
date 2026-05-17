export function cancelResponseBody(response: Response): void {
  try {
    void response.body?.cancel();
  } catch {
    // The stream may already be locked by another reader.
  }
}
