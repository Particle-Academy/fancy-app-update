/**
 * @particle-academy/fancy-app-update
 *
 * Framework-agnostic "a new version is available — refresh" detection for any
 * React app. No Inertia, no PHP, no specific backend.
 *
 *   - useAppUpdate(options)  the headless detector (custom check / version
 *                            compare / ETag poll)
 *   - <AppUpdateAlert>       a self-contained, customizable refresh prompt
 *
 * For an Inertia + Laravel app, `@particle-academy/fancy-inertia` builds on this
 * with a zero-config Inertia asset-version default + a react-fancy-styled prompt.
 */
export { useAppUpdate } from "./useAppUpdate";
export type { UseAppUpdateOptions, AppUpdate } from "./useAppUpdate";

export { AppUpdateAlert } from "./AppUpdateAlert";
export type { AppUpdateAlertProps, AppUpdateAlertPosition } from "./AppUpdateAlert";
