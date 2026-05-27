import type { IconName } from "./Icon";

export type SidebarChild = { id: string; label: string; href: string };
export type SidebarItem = {
  id: string;
  label: string;
  icon: IconName;
  href?: string;
  expandable?: boolean;
  dot?: boolean;
  children?: SidebarChild[];
};

export const SIDEBAR_NAV: SidebarItem[] = [
  { id: "usuarios", label: "Usuarios", icon: "users", href: "/usuarios" },
  { id: "roles", label: "Roles", icon: "shield", href: "/roles" },
  {
    id: "personal",
    label: "Personal",
    icon: "card",
    expandable: true,
    children: [
      { id: "personal-all", label: "Todos / Export SUNEDU", href: "/personal" },
      { id: "personal-cas", label: "CAS Determinado", href: "/personal/cas" },
      {
        id: "personal-indeterminados",
        label: "Indeterminados · Confianza",
        href: "/personal/indeterminados",
      },
    ],
  },
  {
    id: "maestros",
    label: "Maestros",
    icon: "folder",
    expandable: true,
    children: [{ id: "locales", label: "Sedes", href: "/maestros/locales" }],
  },
];
