declare module "ws" {
  export type RawData = string | Buffer | ArrayBuffer | Buffer[];

  export default class WebSocket {
    constructor(
      url: string | URL,
      options?: {
        headers?: Record<string, string>;
      },
    );

    send(data: string): void;
    close(): void;
    on(event: "message", listener: (data: RawData) => void): this;
    once(event: "open", listener: () => void): this;
    once(event: "error", listener: (error: Error) => void): this;
  }
}
