import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { PERMISSIONS, ROLE_DEFS } from "../src/lib/auth/permissions";
import ubigeosJson from "../src/lib/sunedu/ubigeos.json";
import localesIniciales from "../src/lib/sunedu/locales-iniciales.json";

type UbigeoRow = { code: string; departamento: string; provincia: string; distrito: string };
type LocalInicial = {
  code: string;
  sedeFilial: string;
  departamento: string;
  provincia: string;
  distrito: string;
  direccion: string;
  tipoAutorizacion: string;
};

// CONADIS-oriented categories for accessibility incidents.
const INCIDENT_CATEGORIES: Array<{
  key: string;
  name: string;
  description: string;
  icon: string;
  order: number;
}> = [
  {
    key: "ramps",
    name: "Rampas y accesos",
    description: "Falta de rampas, pendiente excesiva, mal estado.",
    icon: "ramp",
    order: 10,
  },
  {
    key: "restrooms",
    name: "Servicios higiénicos accesibles",
    description: "Baños no accesibles, falta de barras, espacio insuficiente.",
    icon: "restroom",
    order: 20,
  },
  {
    key: "signage",
    name: "Señalización",
    description: "Falta de señalización Braille, contraste o lectura fácil.",
    icon: "signage",
    order: 30,
  },
  {
    key: "audio",
    name: "Audio y comunicación",
    description: "Falta de bucle magnético, intérprete de señas o subtítulos.",
    icon: "audio",
    order: 40,
  },
  {
    key: "transport",
    name: "Transporte y estacionamiento",
    description: "Estacionamiento reservado mal usado, paradas no accesibles.",
    icon: "transport",
    order: 50,
  },
  {
    key: "digital",
    name: "Servicios digitales",
    description: "Sitios web o sistemas no accesibles, formularios no usables.",
    icon: "digital",
    order: 60,
  },
  {
    key: "discrimination",
    name: "Trato discriminatorio",
    description:
      "Denuncia de trato inadecuado o discriminación por discapacidad.",
    icon: "discrimination",
    order: 70,
  },
  {
    key: "other",
    name: "Otros",
    description: "Cualquier otra barrera o incidente no listado arriba.",
    icon: "other",
    order: 999,
  },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  console.log("→ Sincronizando permisos…");
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      update: { name: p.name, description: p.description, category: p.category },
      create: p,
    });
  }

  console.log("→ Sincronizando roles…");
  const permByKey = new Map(
    (await prisma.permission.findMany()).map((p) => [p.key, p.id]),
  );

  for (const role of ROLE_DEFS) {
    const dbRole = await prisma.role.upsert({
      where: { key: role.key },
      update: {
        name: role.name,
        description: role.description,
        system: role.system,
      },
      create: {
        key: role.key,
        name: role.name,
        description: role.description,
        system: role.system,
      },
    });

    // Replace role-permission links to match definition
    await prisma.rolePermission.deleteMany({ where: { roleId: dbRole.id } });
    for (const permKey of role.permissions) {
      const permId = permByKey.get(permKey);
      if (!permId) {
        console.warn(`  ⚠ permiso "${permKey}" no encontrado, saltando`);
        continue;
      }
      await prisma.rolePermission.create({
        data: { roleId: dbRole.id, permissionId: permId },
      });
    }
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL?.toLowerCase();
  const adminName = process.env.SEED_ADMIN_NAME ?? "Administrador";
  const adminPass = process.env.SEED_ADMIN_PASSWORD;

  if (!adminEmail || !adminPass) {
    console.log(
      "→ SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD no definidos; omitiendo usuario.",
    );
  } else {
    console.log(`→ Asegurando usuario admin ${adminEmail}…`);
    const superadminRole = await prisma.role.findUnique({
      where: { key: "superadmin" },
    });
    if (!superadminRole) throw new Error("superadmin role missing after seed");

    const passwordHash = await hashPassword(adminPass);
    const user = await prisma.user.upsert({
      where: { email: adminEmail },
      update: { name: adminName, active: true },
      create: { email: adminEmail, name: adminName, passwordHash, active: true },
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: superadminRole.id } },
      update: {},
      create: { userId: user.id, roleId: superadminRole.id },
    });

    console.log(`✓ admin listo: ${adminEmail}`);
  }

  console.log("→ Sincronizando categorías de incidentes…");
  for (const c of INCIDENT_CATEGORIES) {
    await prisma.incidentCategory.upsert({
      where: { key: c.key },
      update: {
        name: c.name,
        description: c.description,
        icon: c.icon,
        order: c.order,
        active: true,
      },
      create: { ...c, active: true },
    });
  }
  console.log(`✓ ${INCIDENT_CATEGORIES.length} categorías listas.`);

  // ── Sedes UNAMAD (SUNEDU MAESTRO LOCAL) ─────────────────────────────────
  console.log("→ Sincronizando sedes UNAMAD…");
  const ubigeos = ubigeosJson as UbigeoRow[];
  const ubigeoKey = (d: string, p: string, di: string) =>
    `${d}|${p}|${di}`.toLowerCase();
  const ubigeoByLocation = new Map(
    ubigeos.map((u) => [
      ubigeoKey(u.departamento, u.provincia, u.distrito),
      u.code,
    ]),
  );

  const friendlyName = (l: LocalInicial) =>
    `Sede ${l.distrito} — ${l.direccion.split(/\s{2,}|[,·]/)[0]}`;

  for (const l of localesIniciales as LocalInicial[]) {
    const ubigeoCode = ubigeoByLocation.get(
      ubigeoKey(l.departamento, l.provincia, l.distrito),
    );
    if (!ubigeoCode) {
      console.warn(
        `  ⚠ ubigeo no encontrado para ${l.code} (${l.distrito}), saltando`,
      );
      continue;
    }
    await prisma.universityLocal.upsert({
      where: { code: l.code },
      update: {
        name: friendlyName(l),
        sedeFilial: l.sedeFilial,
        ubigeoCode,
        direccion: l.direccion,
        tipoAutorizacion: l.tipoAutorizacion,
        active: true,
      },
      create: {
        code: l.code,
        name: friendlyName(l),
        sedeFilial: l.sedeFilial,
        ubigeoCode,
        direccion: l.direccion,
        tipoAutorizacion: l.tipoAutorizacion,
      },
    });
  }
  console.log(`✓ ${(localesIniciales as LocalInicial[]).length} sedes listas.`);

  console.log("✓ Seed completado.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
