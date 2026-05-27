"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { Toaster } from "@/components/ui/toaster";

type Props = {
  user: { name: string; email: string };
  children: ReactNode;
};

const MOBILE_BREAKPOINT = 900;

export function AdminShell({ user, children }: Props) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const pathname = usePathname();

  // Track viewport width — toggle between collapsed (desktop) and overlay (mobile).
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Close the mobile drawer on route change.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Body scroll lock while the mobile drawer is open.
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const onMenuClick = () => {
    if (isMobile) setMobileOpen((v) => !v);
    else setSidebarCollapsed((v) => !v);
  };

  return (
    <div className="shell">
      <TopBar user={user} onMenuClick={onMenuClick} />
      <div className="shell__body">
        {isMobile && mobileOpen && (
          <div
            className="sidebar__mobile-backdrop"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
        )}
        <Sidebar
          collapsed={sidebarCollapsed && !isMobile}
          mobileOpen={isMobile && mobileOpen}
        />
        <main className="main">{children}</main>
      </div>

      <footer className="footer">
        <span>© 2026 UNAMAD · Oficina de Tecnologías de la Información</span>
        <a href="#" onClick={(e) => e.preventDefault()}>
          Términos del Servicio
        </a>
        <span className="footer__sep">·</span>
        <a href="#" onClick={(e) => e.preventDefault()}>
          Política de Privacidad
        </a>
        <button className="footer__feedback">
          <Icon name="info" size={16} />
          Enviar comentarios
        </button>
      </footer>

      <Toaster />
    </div>
  );
}
