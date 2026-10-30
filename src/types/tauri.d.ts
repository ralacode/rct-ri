export {};

declare global {
  interface Window {
    __TAURI__?: {
      core: {
        invoke: (cmd: string, args?: any) => Promise<any>;
      };
      window?: {
        getCurrentWindow: () => {
          setTitle: (title: string) => Promise<void>;
        };
      };
    };
    __rctShellNavInit?: boolean;
    __rctNavCurrentInit?: boolean;
  }
}
