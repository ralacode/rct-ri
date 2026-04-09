export {};

declare global {
  interface Window {
    __TAURI__: {
      core: {
        invoke: (cmd: string, args?: any) => Promise<any>;
      };
    };
  }
}
