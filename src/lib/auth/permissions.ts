// Single source of truth for all permission keys in the app.
// Used by the seed AND by ui/server-side checks.
//
// Cada categoría DEBE corresponder a un módulo real (UI o API).
// - "Usuarios"   → /usuarios
// - "Roles"      → /roles
// - "Incidentes" → API /api/v1/incidents (admin UI pendiente)
// - "Personal"   → /personal (SUNEDU SIU · carga masiva administrativos)
// - "Sedes"      → /maestros/locales

export type PermissionDef = {
  key: string;
  name: string;
  description: string;
  category: string;
};

export const PERMISSIONS: PermissionDef[] = [
  {
    key: "users.read",
    name: "Ver usuarios",
    description: "Listar y consultar usuarios del sistema",
    category: "Usuarios",
  },
  {
    key: "users.write",
    name: "Gestionar usuarios",
    description: "Crear, editar y eliminar usuarios",
    category: "Usuarios",
  },
  {
    key: "users.assign-roles",
    name: "Asignar roles",
    description: "Cambiar los roles asignados a un usuario",
    category: "Usuarios",
  },
  {
    key: "roles.read",
    name: "Ver roles",
    description: "Consultar roles y permisos",
    category: "Roles",
  },
  {
    key: "roles.write",
    name: "Gestionar roles",
    description: "Crear, editar y eliminar roles personalizados",
    category: "Roles",
  },
  {
    key: "incidents.create",
    name: "Reportar incidentes",
    description: "Crear un nuevo reporte de incidente",
    category: "Incidentes",
  },
  {
    key: "incidents.read",
    name: "Ver todos los incidentes",
    description: "Consultar la bandeja de incidentes (admin)",
    category: "Incidentes",
  },
  {
    key: "incidents.read:own",
    name: "Ver mis incidentes",
    description: "Consultar solo los incidentes que el usuario reportó",
    category: "Incidentes",
  },
  {
    key: "incidents.write",
    name: "Gestionar incidentes",
    description: "Asignar, comentar y cambiar estado de incidentes",
    category: "Incidentes",
  },
  {
    key: "incidents.delete",
    name: "Eliminar incidentes",
    description: "Eliminar incidentes (solo casos excepcionales)",
    category: "Incidentes",
  },
  {
    key: "staff.read",
    name: "Ver personal",
    description:
      "Listar y consultar los registros del personal administrativo (SUNEDU)",
    category: "Personal",
  },
  {
    key: "staff.write",
    name: "Gestionar personal",
    description: "Crear, editar, suspender y eliminar registros del personal",
    category: "Personal",
  },
  {
    key: "staff.export",
    name: "Exportar Excel SUNEDU",
    description:
      "Generar el archivo xlsx con el formato SIU de carga masiva de SUNEDU",
    category: "Personal",
  },
  {
    key: "locales.read",
    name: "Ver sedes",
    description: "Consultar las sedes/locales registrados de la institución",
    category: "Sedes",
  },
  {
    key: "locales.write",
    name: "Gestionar sedes",
    description: "Crear, editar y dar de baja sedes/locales de la institución",
    category: "Sedes",
  },
];

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export const ROLE_DEFS = [
  {
    key: "superadmin",
    name: "Superadministrador",
    description: "Acceso total al sistema. No editable.",
    system: true,
    permissions: PERMISSIONS.map((p) => p.key),
  },
  {
    key: "admin",
    name: "Administrador",
    description:
      "Gestiona usuarios, roles, incidentes y el módulo de personal SUNEDU.",
    system: true,
    permissions: [
      "users.read",
      "users.write",
      "users.assign-roles",
      "roles.read",
      "incidents.read",
      "incidents.write",
      "incidents.create",
      "incidents.read:own",
      "staff.read",
      "staff.write",
      "staff.export",
      "locales.read",
      "locales.write",
    ],
  },
  {
    key: "editor",
    name: "Gestor de incidentes",
    description:
      "Triage y seguimiento de la bandeja de incidentes; puede consultar usuarios.",
    system: true,
    permissions: [
      "users.read",
      "incidents.read",
      "incidents.write",
      "incidents.create",
      "incidents.read:own",
    ],
  },
  {
    key: "viewer",
    name: "Consulta",
    description:
      "Solo lectura sobre usuarios, roles, incidentes, personal y sedes.",
    system: true,
    permissions: [
      "users.read",
      "roles.read",
      "incidents.read",
      "staff.read",
      "locales.read",
    ],
  },
  {
    key: "reporter",
    name: "Reportante",
    description:
      "Usuario final que puede crear y consultar sus propios reportes de incidente.",
    system: true,
    permissions: ["incidents.create", "incidents.read:own"],
  },
] as const;
