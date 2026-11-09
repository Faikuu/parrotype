import { createContext, useContext } from 'react';

/** Shows a short polite message in the admin live region. Outside a provider it does nothing. */
export type ToastFn = (message: string) => void;

export const ToastContext = createContext<ToastFn>(() => undefined);

export function useToast(): ToastFn {
  return useContext(ToastContext);
}
