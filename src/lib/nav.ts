import { navigate } from "astro:transitions/client";

export function go(path: string) {
  void navigate(path);
}
