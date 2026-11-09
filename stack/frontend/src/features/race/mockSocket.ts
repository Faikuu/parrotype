/** A WebSocket stand-in for tests. Tests drive it: open(), receive(), drop(). */
export class MockSocket {
  static instances: MockSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;

  static reset(): void {
    MockSocket.instances = [];
  }

  readyState: number = MockSocket.CONNECTING;
  readonly sent: string[] = [];
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  constructor(readonly url: string) {
    MockSocket.instances.push(this);
  }

  send(data: string): void {
    if (this.readyState !== MockSocket.OPEN) throw new Error('send on a closed mock');
    this.sent.push(data);
  }

  close(): void {
    this.readyState = MockSocket.CLOSED;
  }

  /** The server accepted the upgrade. */
  open(): void {
    this.readyState = MockSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  /** A JSON server message. */
  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent);
  }

  /** A raw frame, for malformed input. */
  receiveRaw(data: string): void {
    this.onmessage?.({ data } as MessageEvent);
  }

  /** The connection dropped (or the server closed it with `code`). */
  drop(code = 1006): void {
    if (this.readyState === MockSocket.CLOSED) return;
    this.readyState = MockSocket.CLOSED;
    this.onclose?.({ code, reason: '' } as CloseEvent);
  }

  sentMessages(): Array<Record<string, unknown>> {
    return this.sent.map((s) => JSON.parse(s) as Record<string, unknown>);
  }
}
