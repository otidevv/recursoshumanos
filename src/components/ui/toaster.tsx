"use client";

import { Toaster as SonnerToaster } from "sonner";

/**
 * App-wide toast notifications via sonner.
 *
 * Usage from any client component:
 *   import { toast } from "sonner";
 *   toast.success("Mensaje");
 *   toast.error("Algo falló");
 *   toast.info("Aviso");
 *
 * Mounted once in the admin shell.
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      richColors
      expand
      closeButton
      toastOptions={{
        style: {
          fontFamily:
            '"Google Sans Text", "Roboto", system-ui, sans-serif',
          fontSize: 13.5,
        },
        duration: 3500,
      }}
    />
  );
}
