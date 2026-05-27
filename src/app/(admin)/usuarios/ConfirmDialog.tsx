"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "@/components/admin/Icon";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Props = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "info";
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
};

/** Confirmación destructiva basada en shadcn AlertDialog.
 *  Conserva la misma API que el componente original para no romper callers. */
export function ConfirmDialog({
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  tone = "danger",
  busy = false,
  onConfirm,
  onClose,
}: Props) {
  const [working, setWorking] = useState(false);

  const handle = async () => {
    if (working || busy) return;
    setWorking(true);
    try {
      await onConfirm();
    } finally {
      setWorking(false);
    }
  };

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !working && !busy) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 14,
            }}
          >
            <span
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background:
                  tone === "info" ? "var(--accent-soft)" : "#fee2e2",
                color: tone === "info" ? "var(--accent)" : "#b91c1c",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <Icon
                name={tone === "info" ? "info" : "trash"}
                size={20}
              />
            </span>
            <div style={{ flex: 1 }}>
              <AlertDialogTitle>{title}</AlertDialogTitle>
              {description && (
                <AlertDialogDescription style={{ marginTop: 6 }}>
                  {description}
                </AlertDialogDescription>
              )}
            </div>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={working || busy}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={tone === "danger" ? "destructive" : "default"}
            disabled={working || busy}
            onClick={(e) => {
              // Evita que Radix cierre el dialog antes de que termine la
              // promesa; cerramos manualmente al final.
              e.preventDefault();
              void handle();
            }}
          >
            {working ? "Procesando…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
