import type { CSSProperties } from "react";

export type AppUpdateAlertPosition =
  | "bottom-right"
  | "bottom-left"
  | "top-right"
  | "top-left"
  | "bottom"
  | "top";

/** Where each fixed position sits. Shared by `<AppUpdateAlert>` and `<AppUpdateStack>`. */
export const POSITION: Record<AppUpdateAlertPosition, CSSProperties> = {
  "bottom-right": { bottom: 16, right: 16 },
  "bottom-left": { bottom: 16, left: 16 },
  "top-right": { top: 16, right: 16 },
  "top-left": { top: 16, left: 16 },
  bottom: { bottom: 16, left: "50%", transform: "translateX(-50%)" },
  top: { top: 16, left: "50%", transform: "translateX(-50%)" },
};
