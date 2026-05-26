"use client";

import { useCallback, useState } from "react";

export type DmToastMessage = {
  id: string;
  text: string;
  tone?: "success" | "info";
};

export function useDmToast() {
  const [toast, setToast] = useState<DmToastMessage | null>(null);

  const showToast = useCallback((text: string, tone: DmToastMessage["tone"] = "success") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToast({ id, text, tone });
    window.setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 3200);
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  return { toast, showToast, dismissToast };
}
