"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
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
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  GraduationCap,
  Info,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  CARGOS,
  DEPENDENCIAS,
  TIPOS_DOCUMENTO,
  TIPOS_DISCAPACIDAD,
  SEXOS,
  REGIMENES_LABORAL,
  VINCULOS_ACTUAL,
  PERU_PAIS_CODE,
} from "@/lib/sunedu/catalogs";
import {
  PAISES,
  UBIGEOS,
  type PaisEntry,
  type UbigeoEntry,
} from "@/lib/sunedu";
import {
  CARGOS_DETALLADOS,
  CARRERAS_COMUNES,
  GRADOS_MAXIMOS,
  GRUPOS_CARRERA,
  PLAZAS_COMUNES,
} from "@/lib/unamad/catalogs";
import {
  addAdenda,
  createStaff,
  deleteStaff,
  setStaffStatus,
  updateStaff,
} from "./actions";
import type {
  ActionResult,
  LocalOption,
  PermFlags,
  StaffCeseMotivo,
  StaffCondition,
  StaffInput,
  StaffRow,
  StaffStatus,
  StaffVariant,
} from "./types";
import {
  CESE_MOTIVO_LABELS,
  CESE_STATUSES,
  STAFF_CESE_MOTIVOS,
  STAFF_STATUSES,
} from "./types";

type Props = {
  rows: StaffRow[];
  localOptions: LocalOption[];
  perms: PermFlags;
  variant: StaffVariant;
};

const VARIANT_CONFIG: Record<
  StaffVariant,
  {
    title: string;
    sub: string;
    defaultCondicion: StaffCondition | "";
  }
> = {
  all: {
    title: "Personal administrativo",
    sub: "todos los regímenes y condiciones",
    defaultCondicion: "DETERMINADO",
  },
  cas: {
    title: "Personal CAS (Determinado)",
    sub: "contratos con fecha de término y adendas",
    defaultCondicion: "DETERMINADO",
  },
  indeterminado: {
    title: "Personal CAS Indeterminado",
    sub: "sin fecha de término — personal estable",
    defaultCondicion: "INDETERMINADO",
  },
  confianza: {
    title: "Personal CAS Confianza",
    sub: "cargos de confianza — sin fecha de término",
    defaultCondicion: "CONFIANZA",
  },
};

function buildEmptyForm(variant: StaffVariant): StaffInput {
  return {
    cargoCode: 3, // Administrativos
    dependenciaCode: 9, // Rectorado
    fechaIngresoIE: "",
    tipoDocumentoCode: 1, // DNI
    numeroDocumento: "",
    nombres: "",
    primerApellido: "",
    segundoApellido: "",
    apellidoCasada: "",
    unSoloApellido: false,
    condicionDiscapacidad: false,
    tipoDiscapacidadCode: null,
    sexoCode: 1,
    fechaNacimiento: "",
    paisNacimientoCode: PERU_PAIS_CODE,
    ubigeoNacimiento: "",
    ubigeoDomicilio: "",
    correoInstitucional: "",
    correoPersonal: "",
    telefono: "",
    celular: "",
    gradoMaximo: "",
    grupoCarrera: "",
    carreraEgresado: "",
    puestoDetallado: "",
    plazaOrigen: "",
    plazaActual: "",
    status: "ACTIVO",
    fechaCese: "",
    motivoCese: "",
    documentoCese: "",
    vinculo: {
      regimenLaboralCode: 4, // CAS
      vinculoActualCode: 1,
      fechaInicio: "",
      fechaTermino: "",
      condicionContrato: VARIANT_CONFIG[variant].defaultCondicion,
      esAdenda: false,
    },
    workplace: {
      otroLocal: false,
      localId: "",
      ubigeoLocal: "",
      direccion: "",
    },
  };
}

// Orden canónico de las condiciones de contrato para la faceta "Condición".
const CONDICION_ORDER: StaffCondition[] = [
  "INDETERMINADO",
  "CONFIANZA",
  "DETERMINADO",
];

// Quita de un Set los valores que ya no existen en las opciones actuales.
// Devuelve el MISMO Set si no hubo cambios, para no disparar renders en bucle.
function pruneSet<T>(set: Set<T>, options: { value: T }[]): Set<T> {
  if (set.size === 0) return set;
  const valid = new Set(options.map((o) => o.value));
  let changed = false;
  const next = new Set<T>();
  for (const v of set) {
    if (valid.has(v)) next.add(v);
    else changed = true;
  }
  return changed ? next : set;
}

export function StaffClient({ rows, localOptions, perms, variant }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<StaffRow | null>(null);
  // Trabajador al que se le está registrando la baja (diálogo de cese rápido).
  const [ceseTarget, setCeseTarget] = useState<StaffRow | null>(null);
  // Trabajador a reactivar (confirma porque reactivar borra los datos de cese).
  const [reactivateTarget, setReactivateTarget] = useState<StaffRow | null>(
    null,
  );

  // Auto-abre el modal de edición cuando llegamos con ?openId=ID en la URL.
  // Lo usa el módulo de Calidad de Datos para enviar al user directo a editar
  // un trabajador específico. Si el ID no está en `rows` (porque está en otra
  // condición de contrato), avisamos con un toast.
  useEffect(() => {
    const openId = searchParams.get("openId");
    if (!openId) return;
    const target = rows.find((r) => r.id === openId);
    if (target) {
      setEditing(target);
    } else {
      toast.warning(
        "El trabajador solicitado no está en esta lista. Probablemente esté en otra variante (CAS / Indeterminados).",
      );
    }
    // Limpia el openId del URL para no re-abrir el modal en próximas navigaciones.
    const next = new URLSearchParams(searchParams.toString());
    next.delete("openId");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, rows, router, pathname]);

  const cfg = VARIANT_CONFIG[variant];
  const emptyForm = useMemo(() => buildEmptyForm(variant), [variant]);

  // Column visibility, persistido en localStorage por variant.
  const storageKey = `staff-cols-${variant}`;
  const [columnVisibility, setColumnVisibility] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        setColumnVisibility(JSON.parse(raw));
      } catch {
        /* ignore */
      }
    }
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (Object.keys(columnVisibility).length === 0) return;
    localStorage.setItem(storageKey, JSON.stringify(columnVisibility));
  }, [storageKey, columnVisibility]);

  const toggleColumn = (key: string, visible: boolean) =>
    setColumnVisibility((prev) => ({ ...prev, [key]: visible }));
  const resetColumns = () => {
    setColumnVisibility({});
    if (typeof window !== "undefined") localStorage.removeItem(storageKey);
  };

  // Filtro por año del contrato. null = todos los años.
  const [yearFilter, setYearFilter] = useState<number | null>(null);

  // Filtros por faceta (multi-selección). Set vacío = sin filtro (pasa todo).
  // Las opciones se derivan de los rows presentes, así nunca hay facetas vacías.
  const [estadoFilter, setEstadoFilter] = useState<Set<StaffStatus>>(new Set());
  const [cargoFilter, setCargoFilter] = useState<Set<number>>(new Set());
  const [dependenciaFilter, setDependenciaFilter] = useState<Set<number>>(
    new Set(),
  );
  // Facetas propias de la vista Indeterminados/Confianza (no se renderizan en
  // CAS, donde la condición es siempre DETERMINADO).
  const [condicionFilter, setCondicionFilter] = useState<Set<StaffCondition>>(
    new Set(),
  );
  const [regimenFilter, setRegimenFilter] = useState<Set<number>>(new Set());
  const clearAllFilters = () => {
    setEstadoFilter(new Set());
    setCargoFilter(new Set());
    setDependenciaFilter(new Set());
    setCondicionFilter(new Set());
    setRegimenFilter(new Set());
  };

  // Selección de filas (para export selectivo). Se mantiene durante toda la
  // sesión del usuario hasta que limpia manualmente o navega de variant.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleOne = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clearSelection = () => setSelectedIds(new Set());

  // Diálogo de confirmación del export
  const [confirmExport, setConfirmExport] = useState(false);

  // Resetea selección al cambiar de variant (las cuids son globales, pero
  // tener selección "fantasma" entre vistas es confuso).
  useEffect(() => {
    setSelectedIds(new Set());
    setEstadoFilter(new Set());
    setCargoFilter(new Set());
    setDependenciaFilter(new Set());
    setCondicionFilter(new Set());
    setRegimenFilter(new Set());
  }, [variant]);

  // Años disponibles en todos los trabajadores cargados (orden DESC = más
  // reciente primero, que es lo que el usuario espera ver de entrada).
  const availableYears = useMemo(() => {
    const s = new Set<number>();
    for (const r of rows) for (const y of r.availableYears) s.add(y);
    return [...s].sort((a, b) => b - a);
  }, [rows]);

  // Opciones de cada faceta derivadas de los rows cargados (solo valores que
  // realmente existen). Cargo/Dependencia ordenados alfabéticamente; Estado
  // respeta el orden canónico de STAFF_STATUSES.
  const cargoOptions = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of rows) m.set(r.cargoCode, r.cargoLabel);
    return [...m]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [rows]);
  const dependenciaOptions = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of rows) m.set(r.dependenciaCode, r.dependenciaLabel);
    return [...m]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [rows]);
  const estadoOptions = useMemo(() => {
    const present = new Set(rows.map((r) => r.status));
    return STAFF_STATUSES.filter((s) => present.has(s)).map((s) => ({
      value: s,
      label: s,
    }));
  }, [rows]);
  const condicionOptions = useMemo(() => {
    const present = new Set(
      rows
        .map((r) => r.currentCondicion)
        .filter((c): c is StaffCondition => c != null),
    );
    return CONDICION_ORDER.filter((c) => present.has(c)).map((c) => ({
      value: c,
      label: c,
    }));
  }, [rows]);
  const regimenOptions = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of rows) {
      if (r.currentRegimenLaboralCode != null) {
        m.set(
          r.currentRegimenLaboralCode,
          r.currentRegimenLaboralLabel ??
            `Régimen ${r.currentRegimenLaboralCode}`,
        );
      }
    }
    return [...m]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [rows]);

  // Selección "efectiva": ignora valores huérfanos que ya no existen en los
  // datos actuales (p. ej. tras router.refresh() que cambió los rows). Se
  // deriva en render (sin efecto/setState, patrón recomendado por React) y
  // pruneSet conserva la identidad del Set si no hay cambios, así no
  // recalculamos de más río abajo.
  const effEstadoFilter = useMemo(
    () => pruneSet(estadoFilter, estadoOptions),
    [estadoFilter, estadoOptions],
  );
  const effCargoFilter = useMemo(
    () => pruneSet(cargoFilter, cargoOptions),
    [cargoFilter, cargoOptions],
  );
  const effDependenciaFilter = useMemo(
    () => pruneSet(dependenciaFilter, dependenciaOptions),
    [dependenciaFilter, dependenciaOptions],
  );
  const effCondicionFilter = useMemo(
    () => pruneSet(condicionFilter, condicionOptions),
    [condicionFilter, condicionOptions],
  );
  const effRegimenFilter = useMemo(
    () => pruneSet(regimenFilter, regimenOptions),
    [regimenFilter, regimenOptions],
  );
  const anyFacetActive =
    effEstadoFilter.size > 0 ||
    effCargoFilter.size > 0 ||
    effDependenciaFilter.size > 0 ||
    effCondicionFilter.size > 0 ||
    effRegimenFilter.size > 0;

  // Paginación: page (1-indexed) + pageSize (0 = "Todos"). pageSize se
  // persiste en localStorage por variant; page se resetea al cambiar query.
  const pageSizeKey = `staff-page-size-${variant}`;
  const [pageSize, setPageSize] = useState<number>(50);
  const [page, setPage] = useState<number>(1);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(pageSizeKey);
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0) setPageSize(n);
    }
  }, [pageSizeKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(pageSizeKey, String(pageSize));
  }, [pageSizeKey, pageSize]);

  // Resetea a página 1 cuando cambia el filtro o pageSize.
  useEffect(() => {
    setPage(1);
  }, [
    query,
    pageSize,
    variant,
    yearFilter,
    effEstadoFilter,
    effCargoFilter,
    effDependenciaFilter,
    effCondicionFilter,
    effRegimenFilter,
  ]);

  const refresh = useCallback(
    () => startTransition(() => router.refresh()),
    [router],
  );

  const filtered = useMemo(() => {
    // 1) Filtro por año del contrato (chips encima de la tabla).
    let base = rows;
    if (yearFilter != null) {
      base = base.filter((r) => r.availableYears.includes(yearFilter));
    }

    // 2) Filtros por faceta (Estado / Cargo / Dependencia). Set vacío = pasa
    //    todo. Cada faceta es OR interno (cualquiera de los valores marcados)
    //    y AND entre facetas (deben cumplirse todas las activas).
    if (effEstadoFilter.size > 0) {
      base = base.filter((r) => effEstadoFilter.has(r.status));
    }
    if (effCargoFilter.size > 0) {
      base = base.filter((r) => effCargoFilter.has(r.cargoCode));
    }
    if (effDependenciaFilter.size > 0) {
      base = base.filter((r) => effDependenciaFilter.has(r.dependenciaCode));
    }
    if (effCondicionFilter.size > 0) {
      base = base.filter(
        (r) =>
          r.currentCondicion != null &&
          effCondicionFilter.has(r.currentCondicion),
      );
    }
    if (effRegimenFilter.size > 0) {
      base = base.filter(
        (r) =>
          r.currentRegimenLaboralCode != null &&
          effRegimenFilter.has(r.currentRegimenLaboralCode),
      );
    }

    // 3) Filtro por texto del search.
    const q = normalizeSearch(query.trim());
    if (!q) return base;
    const tokens = q.split(/\s+/).filter(Boolean);
    return base.filter((r) => {
      const haystack = normalizeSearch(
        [
          r.numeroDocumento,
          r.fullName,
          r.nombres,
          r.primerApellido,
          r.segundoApellido ?? "",
          r.cargoLabel,
          r.puestoDetallado ?? "",
          r.dependenciaLabel,
          r.plazaActual ?? "",
          r.correoInstitucional ?? "",
          r.correoPersonal ?? "",
        ].join(" "),
      );
      return tokens.every((t) => haystack.includes(t));
    });
  }, [
    rows,
    query,
    yearFilter,
    effEstadoFilter,
    effCargoFilter,
    effDependenciaFilter,
    effCondicionFilter,
    effRegimenFilter,
  ]);

  // URL de exportación — 3 modos en orden de prioridad:
  // 1) Selección manual (checkboxes) → ?ids=cuid1,cuid2,...
  // 2) Búsqueda por texto activa Y filtered ≤ 200 → ?ids= con cuids visibles
  // 3) Solo variant + year → ?variant=&year=
  const URL_IDS_LIMIT = 200;
  // El modo "filtered" (lista explícita de ids en la URL) solo se usa para la
  // búsqueda de texto, que NO puede expresarse server-side. Las facetas
  // (Estado/Cargo/Dependencia) sí viajan como params al server en modo
  // "variant", así que se aplican siempre — sin el tope de 200 ids.
  const exportMode: "selection" | "filtered" | "variant" =
    selectedIds.size > 0
      ? "selection"
      : query.trim() && filtered.length <= URL_IDS_LIMIT
        ? "filtered"
        : "variant";

  const exportIds = useMemo(() => {
    if (exportMode === "selection") return [...selectedIds];
    if (exportMode === "filtered") return filtered.map((r) => r.id);
    return [];
  }, [exportMode, selectedIds, filtered]);

  const exportCount =
    exportMode === "variant"
      ? // sin ids: el server filtra por variant/year, el count puede divergir
        // ligeramente del filtered visible si hay PASIVO/FALLECIMIENTO en
        // rows (la UI los muestra, el export los excluye). Aproximación OK.
        filtered.filter((r) => r.status === "ACTIVO" || r.status === "LICENCIA")
          .length
      : exportIds.length;

  const exportUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (exportMode !== "variant") {
      params.set("ids", exportIds.join(","));
    } else {
      if (variant !== "all") params.set("variant", variant);
      if (yearFilter != null) params.set("year", String(yearFilter));
      // Facetas aplicadas server-side cuando no exportamos por ids.
      if (effEstadoFilter.size > 0)
        params.set("estado", [...effEstadoFilter].join(","));
      if (effCargoFilter.size > 0)
        params.set("cargo", [...effCargoFilter].join(","));
      if (effDependenciaFilter.size > 0)
        params.set("dep", [...effDependenciaFilter].join(","));
      if (effCondicionFilter.size > 0)
        params.set("condicion", [...effCondicionFilter].join(","));
      if (effRegimenFilter.size > 0)
        params.set("regimen", [...effRegimenFilter].join(","));
    }
    const qs = params.toString();
    return qs ? `/api/personal/export?${qs}` : "/api/personal/export";
  }, [
    exportMode,
    exportIds,
    variant,
    yearFilter,
    effEstadoFilter,
    effCargoFilter,
    effDependenciaFilter,
    effCondicionFilter,
    effRegimenFilter,
  ]);

  // Etiqueta dinámica del botón refleja qué se va a exportar.
  const exportDescriptor = useMemo(() => {
    if (exportMode === "selection")
      return `${exportIds.length} seleccionado${exportIds.length === 1 ? "" : "s"}`;
    if (exportMode === "filtered")
      return `${exportIds.length} resultado${exportIds.length === 1 ? "" : "s"} filtrado${exportIds.length === 1 ? "" : "s"}`;
    const bits: string[] = [];
    if (variant === "cas") bits.push("CAS Determinado");
    else if (variant === "indeterminado") bits.push("CAS Indeterminado");
    else if (variant === "confianza") bits.push("CAS Confianza");
    else bits.push("Todos");
    if (yearFilter != null) bits.push(String(yearFilter));
    // Las facetas SÍ se aplican en modo variant (params server-side), así que
    // el descriptor lo refleja honestamente.
    if (anyFacetActive) bits.push("filtrado");
    return bits.join(" · ");
  }, [exportMode, exportIds.length, variant, yearFilter, anyFacetActive]);

  const exportLabel = `Exportar SUNEDU · ${exportDescriptor}`;

  // Paginación derivada (pageSize=0 significa "Todos").
  const effectiveSize = pageSize === 0 ? filtered.length || 1 : pageSize;
  const totalPages = Math.max(1, Math.ceil(filtered.length / effectiveSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = (safePage - 1) * effectiveSize;
  const to = Math.min(from + effectiveSize, filtered.length);
  const displayed = pageSize === 0 ? filtered : filtered.slice(from, to);

  // Chips de filtros activos (una entrada por faceta con selección). Se calcula
  // aquí para mantener FilterChips agnóstico del conjunto de facetas.
  const labelOf = (opts: { value: number; label: string }[], code: number) =>
    opts.find((o) => o.value === code)?.label ?? String(code);
  const filterChips: { key: string; text: string; onRemove: () => void }[] = [];
  if (effEstadoFilter.size > 0)
    filterChips.push({
      key: "estado",
      text:
        effEstadoFilter.size === 1
          ? `Estado: ${[...effEstadoFilter][0]}`
          : `Estado: ${effEstadoFilter.size}`,
      onRemove: () => setEstadoFilter(new Set()),
    });
  if (effCargoFilter.size > 0)
    filterChips.push({
      key: "cargo",
      text:
        effCargoFilter.size === 1
          ? `Cargo: ${labelOf(cargoOptions, [...effCargoFilter][0])}`
          : `Cargo: ${effCargoFilter.size}`,
      onRemove: () => setCargoFilter(new Set()),
    });
  if (effDependenciaFilter.size > 0)
    filterChips.push({
      key: "dependencia",
      text:
        effDependenciaFilter.size === 1
          ? `Dependencia: ${labelOf(dependenciaOptions, [...effDependenciaFilter][0])}`
          : `Dependencia: ${effDependenciaFilter.size}`,
      onRemove: () => setDependenciaFilter(new Set()),
    });
  if (effCondicionFilter.size > 0)
    filterChips.push({
      key: "condicion",
      text:
        effCondicionFilter.size === 1
          ? `Condición: ${[...effCondicionFilter][0]}`
          : `Condición: ${effCondicionFilter.size}`,
      onRemove: () => setCondicionFilter(new Set()),
    });
  if (effRegimenFilter.size > 0)
    filterChips.push({
      key: "regimen",
      text:
        effRegimenFilter.size === 1
          ? `Régimen: ${labelOf(regimenOptions, [...effRegimenFilter][0])}`
          : `Régimen: ${effRegimenFilter.size}`,
      onRemove: () => setRegimenFilter(new Set()),
    });

  return (
    <div className="page">
      <div className="page__tabs">
        <a
          className={`tab ${variant === "all" ? "is-active" : ""}`}
          href="/personal"
        >
          Todos
        </a>
        <a
          className={`tab ${variant === "cas" ? "is-active" : ""}`}
          href="/personal/cas"
        >
          CAS Determinado
        </a>
        <a
          className={`tab ${variant === "indeterminado" ? "is-active" : ""}`}
          href="/personal/indeterminado"
        >
          CAS Indeterminado
        </a>
        <a
          className={`tab ${variant === "confianza" ? "is-active" : ""}`}
          href="/personal/confianza"
        >
          CAS Confianza
        </a>
      </div>

      <div className="page__head">
        <div className="page__title">
          <h1>{cfg.title}</h1>
          <span className="page__sub">
            {rows.length} {variant === "all" ? "registrados" : "en esta vista"}{" "}
            · {rows.filter((r) => r.status === "ACTIVO").length} activos · {cfg.sub}
            {isPending && (
              <span style={{ marginLeft: 12, color: "var(--accent)" }}>
                · actualizando…
              </span>
            )}
          </span>
        </div>
        <div className="page__actions">
          <Button
            disabled={!perms.canWrite}
            onClick={() => setCreating(true)}
          >
            <Icon name="plus" size={16} />
            Nuevo trabajador
          </Button>
          <Button
            variant="outline"
            disabled={!perms.canExport || exportCount === 0}
            title={
              !perms.canExport
                ? "No tienes permiso para exportar"
                : exportCount === 0
                  ? "No hay trabajadores que exportar"
                  : `Vas a exportar ${exportCount} trabajadores (${exportDescriptor})`
            }
            onClick={() => setConfirmExport(true)}
          >
            <Icon name="download" size={16} />
            {exportLabel}
          </Button>
        </div>
      </div>

      <div className="filterbar" style={{ alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <input
          className="staff-search"
          placeholder="Buscar por DNI, nombre, cargo, dependencia o correo…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {availableYears.length > 1 && (
          <YearFilter
            years={availableYears}
            value={yearFilter}
            onChange={setYearFilter}
          />
        )}
        <FacetFilter
          label="Estado"
          options={estadoOptions}
          selected={effEstadoFilter}
          onChange={setEstadoFilter}
          searchable={false}
        />
        <FacetFilter
          label="Cargo"
          options={cargoOptions}
          selected={effCargoFilter}
          onChange={setCargoFilter}
        />
        <FacetFilter
          label="Dependencia"
          options={dependenciaOptions}
          selected={effDependenciaFilter}
          onChange={setDependenciaFilter}
        />
        {/* Condición solo tiene sentido donde se mezclan varias (vista Todos);
            cada vista por condición ya es de un solo valor. */}
        {variant === "all" && (
          <FacetFilter
            label="Condición"
            options={condicionOptions}
            selected={effCondicionFilter}
            onChange={setCondicionFilter}
            searchable={false}
          />
        )}
        {/* Régimen: útil en Todos + las dos vistas Indeterminado/Confianza
            (CAS Determinado conserva solo las 3 facetas base). */}
        {variant !== "cas" && (
          <FacetFilter
            label="Régimen"
            options={regimenOptions}
            selected={effRegimenFilter}
            onChange={setRegimenFilter}
          />
        )}
        <ColumnVisibilityMenu
          cols={COLUMNS_BY_VARIANT[variant]}
          visibility={columnVisibility}
          variant={variant}
          onToggle={toggleColumn}
          onReset={resetColumns}
        />
      </div>

      {anyFacetActive && (
        <FilterChips
          chips={filterChips}
          resultCount={filtered.length}
          totalCount={rows.length}
          onClearAll={clearAllFilters}
        />
      )}

      {selectedIds.size > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "10px 14px",
            marginBottom: 8,
            background: "var(--accent-soft)",
            border: "1px solid var(--accent)",
            borderRadius: 8,
            fontSize: 13,
            color: "var(--accent-strong)",
            flexWrap: "wrap",
          }}
        >
          <span>
            <b>{selectedIds.size}</b> trabajador
            {selectedIds.size === 1 ? "" : "es"} seleccionado
            {selectedIds.size === 1 ? "" : "s"}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              size="sm"
              variant="outline"
              onClick={clearSelection}
            >
              Limpiar selección
            </Button>
            <Button
              size="sm"
              disabled={!perms.canExport}
              onClick={() => setConfirmExport(true)}
            >
              <Icon name="download" size={14} />
              Exportar seleccionados
            </Button>
          </div>
        </div>
      )}

      <div className="tablewrap density-regular">
        <div className="tablewrap__scroll">
          <StaffTable
            variant={variant}
            rows={displayed}
            query={query}
            columnVisibility={columnVisibility}
            canWrite={perms.canWrite}
            selectedIds={selectedIds}
            onToggleOne={toggleOne}
            onToggleAll={(visibleRows, select) =>
              setSelectedIds((prev) => {
                const next = new Set(prev);
                for (const r of visibleRows) {
                  if (select) next.add(r.id);
                  else next.delete(r.id);
                }
                return next;
              })
            }
            onEdit={(s) => setEditing(s)}
            onToggleActive={async (s) => {
              // Dar de baja (ACTIVO → PASIVO) exige registrar fecha + motivo de
              // cese: abrimos el diálogo en vez de cambiar en silencio.
              if (s.status === "ACTIVO") {
                setCeseTarget(s);
                return;
              }
              // Reactivar (→ ACTIVO) limpia los datos de cese. Si hay una baja
              // registrada, confirmamos antes para no perderla en silencio.
              if (s.fechaCese) {
                setReactivateTarget(s);
                return;
              }
              const res = await setStaffStatus(s.id, "ACTIVO");
              if (res.ok) {
                toast.success("Trabajador reactivado");
                refresh();
              } else {
                toast.error(res.error);
              }
            }}
            onDelete={(s) => setConfirmDelete(s)}
          />
        </div>
        <Pagination
          totalRows={filtered.length}
          totalAll={rows.length}
          page={safePage}
          pageSize={pageSize}
          totalPages={totalPages}
          from={from}
          to={to}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {(creating || editing) && (
        <StaffFormModal
          // Key prop fuerza remount → useState(initial) captura nuevos values
          // y reseteamos DniStatus + lastLookupRef al cambiar de trabajador.
          key={editing?.id ?? "new"}
          initial={editing ? rowToInput(editing, emptyForm) : emptyForm}
          mode={editing ? "edit" : "create"}
          editingId={editing?.id ?? null}
          editingRow={editing}
          localOptions={localOptions}
          variant={variant}
          onAfterAdenda={() => refresh()}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSubmit={async (form, id) => {
            const res = id ? await updateStaff(id, form) : await createStaff(form);
            if (res.ok) {
              toast.success(
                id ? "Trabajador actualizado" : "Trabajador creado",
              );
              setCreating(false);
              setEditing(null);
              refresh();
            }
            return res;
          }}
        />
      )}

      {ceseTarget && (
        <CeseDialog
          row={ceseTarget}
          onClose={() => setCeseTarget(null)}
          onDone={() => {
            setCeseTarget(null);
            refresh();
          }}
        />
      )}

      <AlertDialog
        open={!!reactivateTarget}
        onOpenChange={(open) => !open && setReactivateTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Reactivar a {reactivateTarget?.fullName}
            </AlertDialogTitle>
            <AlertDialogDescription style={{ marginTop: 8 }}>
              El trabajador volverá a <b>ACTIVO</b>. Se <b>borrará la baja
              registrada</b> (fecha de cese, motivo y documento) y esta acción no
              se puede deshacer.
              {reactivateTarget?.motivoCese && (
                <span
                  style={{
                    display: "block",
                    marginTop: 10,
                    padding: "8px 10px",
                    background: "var(--bg-soft)",
                    borderRadius: 6,
                    fontSize: 12,
                    color: "var(--text-muted)",
                  }}
                >
                  Baja actual: <b>{CESE_MOTIVO_LABELS[reactivateTarget.motivoCese]}</b>
                  {reactivateTarget.fechaCese
                    ? ` · ${fmtDate(reactivateTarget.fechaCese)}`
                    : ""}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!reactivateTarget) return;
                const res = await setStaffStatus(reactivateTarget.id, "ACTIVO");
                if (res.ok) {
                  toast.success("Trabajador reactivado");
                  refresh();
                } else {
                  toast.error(res.error);
                }
                setReactivateTarget(null);
              }}
            >
              Reactivar y borrar baja
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmExport}
        onOpenChange={setConfirmExport}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
              <span
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: "var(--accent-soft)",
                  color: "var(--accent-strong)",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                }}
              >
                <Icon name="download" size={20} />
              </span>
              <div style={{ flex: 1 }}>
                <AlertDialogTitle>
                  Exportar {exportCount} trabajador
                  {exportCount === 1 ? "" : "es"} a SUNEDU
                </AlertDialogTitle>
                <AlertDialogDescription style={{ marginTop: 8 }}>
                  Se va a generar el xlsx oficial de SUNEDU SIU con los
                  trabajadores que estás filtrando ahora.
                </AlertDialogDescription>
                <div
                  style={{
                    marginTop: 12,
                    padding: "10px 12px",
                    background: "var(--bg-soft)",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "var(--text-muted)",
                    lineHeight: 1.7,
                  }}
                >
                  <b style={{ color: "var(--text)" }}>Resumen:</b>
                  <br />
                  • <b>{exportCount}</b> trabajadores incluidos
                  <br />
                  • Filtro:{" "}
                  <b style={{ color: "var(--accent-strong)" }}>
                    {exportDescriptor}
                  </b>
                  <br />
                  • Solo se incluye personal con estado <b>ACTIVO</b> o{" "}
                  <b>LICENCIA</b> (PASIVO y FALLECIMIENTO se excluyen).
                </div>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                // Trigger download programáticamente para preservar el
                // file-save dialog del navegador.
                const a = document.createElement("a");
                a.href = exportUrl;
                a.rel = "noopener";
                document.body.appendChild(a);
                a.click();
                a.remove();
                setConfirmExport(false);
                toast.success(
                  `Descargando xlsx con ${exportCount} trabajadores…`,
                );
              }}
            >
              <Icon name="download" size={14} />
              Descargar xlsx
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
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
                  background: "#fee2e2",
                  color: "#b91c1c",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                }}
              >
                <Icon name="trash" size={20} />
              </span>
              <div style={{ flex: 1 }}>
                <AlertDialogTitle>
                  Eliminar a {confirmDelete?.fullName}
                </AlertDialogTitle>
                <AlertDialogDescription style={{ marginTop: 6 }}>
                  Esta acción es <b>irreversible</b>. Se eliminarán todos los
                  vínculos laborales y lugares de trabajo asociados a este
                  trabajador.
                </AlertDialogDescription>
                {confirmDelete && confirmDelete.adendasCount > 0 && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: "8px 10px",
                      background: "var(--bg-soft)",
                      borderRadius: 6,
                      fontSize: 12,
                      color: "var(--text-muted)",
                    }}
                  >
                    📎 Se eliminarán también{" "}
                    <b>{confirmDelete.adendasCount}</b> adenda
                    {confirmDelete.adendasCount > 1 ? "s" : ""} y el contrato
                    original.
                  </div>
                )}
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (!confirmDelete) return;
                const res = await deleteStaff(confirmDelete.id);
                if (res.ok) {
                  toast.success("Trabajador eliminado");
                  refresh();
                } else {
                  toast.error(res.error);
                }
                setConfirmDelete(null);
              }}
            >
              Eliminar definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Legacy ConfirmDelete kept commented for reference — removed */}

      <style jsx>{`
        .staff-search {
          width: 100%;
          max-width: 520px;
          height: 36px;
          padding: 0 12px;
          border: 1px solid var(--border-strong);
          border-radius: 8px;
          background: var(--surface);
          font: inherit;
          font-size: 13.5px;
        }
        .staff-search:focus {
          outline: 0;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-soft);
        }
      `}</style>
    </div>
  );
}

function rowToInput(row: StaffRow, emptyForm: StaffInput): StaffInput {
  return {
    cargoCode: row.cargoCode,
    dependenciaCode: row.dependenciaCode,
    fechaIngresoIE: row.fechaIngresoIE.slice(0, 10),
    tipoDocumentoCode: row.tipoDocumentoCode,
    numeroDocumento: row.numeroDocumento,
    nombres: row.nombres,
    primerApellido: row.primerApellido,
    segundoApellido: row.segundoApellido ?? "",
    apellidoCasada: row.apellidoCasada ?? "",
    unSoloApellido: row.unSoloApellido,
    condicionDiscapacidad: row.condicionDiscapacidad,
    tipoDiscapacidadCode: row.tipoDiscapacidadCode,
    sexoCode: row.sexoCode,
    fechaNacimiento: row.fechaNacimiento.slice(0, 10),
    paisNacimientoCode: row.paisNacimientoCode,
    ubigeoNacimiento: row.ubigeoNacimiento ?? "",
    ubigeoDomicilio: row.ubigeoDomicilio,
    correoInstitucional: row.correoInstitucional ?? "",
    correoPersonal: row.correoPersonal ?? "",
    telefono: row.telefono ?? "",
    celular: row.celular ?? "",
    gradoMaximo: row.gradoMaximo ?? "",
    grupoCarrera: row.grupoCarrera ?? "",
    carreraEgresado: row.carreraEgresado ?? "",
    puestoDetallado: row.puestoDetallado ?? "",
    plazaOrigen: row.plazaOrigen ?? "",
    plazaActual: row.plazaActual ?? "",
    status: row.status,
    fechaCese: row.fechaCese ? row.fechaCese.slice(0, 10) : "",
    motivoCese: row.motivoCese ?? "",
    documentoCese: row.documentoCese ?? "",
    // En edit, las secciones vínculo/workplace están ocultas y el server las
    // ignora — usamos los defaults del variant para mantener el tipo.
    vinculo: emptyForm.vinculo,
    workplace: emptyForm.workplace,
  };
}

// ─────────────────────────── Cese rápido (baja desde la tabla) ───────────────────────────

/** Diálogo para registrar la baja de un trabajador (ACTIVO → PASIVO) desde el
 *  botón rápido de la tabla. Captura fecha + motivo + documento y llama a
 *  setStaffStatus con esos datos. La baja desde el modal de edición usa los
 *  mismos campos dentro del formulario. */
function CeseDialog({
  row,
  onClose,
  onDone,
}: {
  row: StaffRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [fecha, setFecha] = useState("");
  const [motivo, setMotivo] = useState<StaffCeseMotivo | "">("");
  const [documento, setDocumento] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!fecha || !motivo) {
      toast.error("Completa la fecha y el motivo del cese.");
      return;
    }
    setSubmitting(true);
    const res = await setStaffStatus(row.id, "PASIVO", {
      fechaCese: fecha,
      motivoCese: motivo,
      documentoCese: documento,
    });
    setSubmitting(false);
    if (res.ok) {
      toast.success(`${row.fullName} dado de baja (PASIVO)`);
      onDone();
    } else {
      toast.error(res.error);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal__head">
          <h2>Registrar baja</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <Icon name="close" size={18} />
          </Button>
        </div>
        <div className="modal__body">
          <p
            style={{
              fontSize: 13,
              color: "var(--text-muted)",
              marginBottom: 14,
            }}
          >
            Vas a dar de baja a <b style={{ color: "var(--text)" }}>{row.fullName}</b>.
            El trabajador pasará a <b>PASIVO</b>. Registra cuándo y por qué.
          </p>
          <Row>
            <FieldDate
              label="Fecha de cese *"
              value={fecha}
              onChange={setFecha}
            />
            <FieldSelect
              label="Motivo del cese *"
              value={motivo || ""}
              options={[
                { value: "", label: "— seleccionar —" },
                ...STAFF_CESE_MOTIVOS.map((m) => ({
                  value: m,
                  label: CESE_MOTIVO_LABELS[m],
                })),
              ]}
              onChange={(v) => setMotivo(v as StaffCeseMotivo | "")}
              isString
            />
          </Row>
          <FieldText
            label="Documento de cese (resolución / carta de renuncia)"
            value={documento}
            onChange={setDocumento}
            maxLength={300}
          />
        </div>
        <div className="modal__foot">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={submit} disabled={submitting}>
            {submitting ? "Guardando…" : "Dar de baja"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── Form Modal ───────────────────────────

function StaffFormModal({
  initial,
  mode,
  editingId,
  editingRow,
  localOptions,
  variant,
  onAfterAdenda,
  onClose,
  onSubmit,
}: {
  initial: StaffInput;
  mode: "create" | "edit";
  editingId: string | null;
  editingRow: StaffRow | null;
  localOptions: LocalOption[];
  variant: StaffVariant;
  onAfterAdenda: () => void;
  onClose: () => void;
  onSubmit: (
    form: StaffInput,
    id: string | null,
  ) => Promise<ActionResult<{ id: string } | void>>;
}) {
  const [form, setForm] = useState(initial);
  const [submitting, setSubmitting] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<string, string>>
  >({});

  const [dniStatus, setDniStatus] = useState<DniStatus>({ kind: "idle" });
  const [daaStatus, setDaaStatus] = useState<DaaStatus>({ kind: "idle" });
  const lastLookupRef = useRef<string>("");

  const set = <K extends keyof StaffInput>(k: K, v: StaffInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const setV = <K extends keyof StaffInput["vinculo"]>(
    k: K,
    v: StaffInput["vinculo"][K],
  ) => setForm((f) => ({ ...f, vinculo: { ...f.vinculo, [k]: v } }));
  const setW = <K extends keyof StaffInput["workplace"]>(
    k: K,
    v: StaffInput["workplace"][K],
  ) => setForm((f) => ({ ...f, workplace: { ...f.workplace, [k]: v } }));

  // Auto-fill desde RENIEC cuando el usuario tipea 8 dígitos en el DNI.
  // Solo en modo "create" y cuando el tipo de documento es DNI (code 1).
  // Debounce 400ms + AbortController para cancelar si cambia antes de responder.
  useEffect(() => {
    if (mode !== "create") return;
    if (form.tipoDocumentoCode !== 1) {
      setDniStatus({ kind: "idle" });
      setDaaStatus({ kind: "idle" });
      return;
    }
    const dni = form.numeroDocumento.trim();
    if (!/^\d{8}$/.test(dni)) {
      setDniStatus({ kind: "idle" });
      setDaaStatus({ kind: "idle" });
      return;
    }
    if (lastLookupRef.current === dni) return;

    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setDniStatus({ kind: "loading" });
      setDaaStatus({ kind: "loading" });

      // RENIEC + DAA en paralelo — no se bloquean entre sí. DAA solo aporta
      // carrera/facultad, así que su fallo no debe estropear el lookup de
      // nombres/fecha/sexo de RENIEC.
      const [reniecResult, daaResult] = await Promise.allSettled([
        fetch(`/api/dni/${dni}`, { signal: ctrl.signal }).then((r) => r.json()),
        fetch(`/api/daa/${dni}`, { signal: ctrl.signal }).then((r) => r.json()),
      ]);
      if (ctrl.signal.aborted) return;

      // ── RENIEC ─────────────────────────────────────────────────────
      const reniecBody =
        reniecResult.status === "fulfilled"
          ? (reniecResult.value as
              | {
                  ok: true;
                  data: {
                    nombres: string;
                    primerApellido: string;
                    segundoApellido: string;
                    fechaNacimiento: string | null;
                    sexoCode: 1 | 2 | null;
                    ubigeoNacimiento: string | null;
                  };
                }
              | { ok: false; error: string })
          : null;
      if (reniecBody && reniecBody.ok) {
        // Solo cacheamos DNIs exitosos. Fallos NO se cachean → si el usuario
        // re-tipea el mismo DNI (ej. después de un timeout transitorio),
        // se reintenta la consulta.
        lastLookupRef.current = dni;
        const d = reniecBody.data;
        // No pisar campos que el usuario YA tipeó manualmente — RENIEC solo
        // rellena lo que está vacío + lo que el usuario claramente no tocó.
        setForm((f) => ({
          ...f,
          nombres: f.nombres.trim() ? f.nombres : d.nombres,
          primerApellido: f.primerApellido.trim()
            ? f.primerApellido
            : d.primerApellido,
          segundoApellido: f.segundoApellido.trim()
            ? f.segundoApellido
            : d.segundoApellido,
          unSoloApellido:
            d.segundoApellido && !f.segundoApellido.trim()
              ? false
              : f.unSoloApellido,
          fechaNacimiento: f.fechaNacimiento || (d.fechaNacimiento ?? ""),
          sexoCode: f.sexoCode || (d.sexoCode ?? 1),
          ubigeoNacimiento:
            f.ubigeoNacimiento || (d.ubigeoNacimiento ?? ""),
        }));
        setDniStatus({
          kind: "ok",
          fullName: [d.primerApellido, d.segundoApellido, d.nombres]
            .filter(Boolean)
            .join(" "),
          partial: !d.ubigeoNacimiento,
        });
      } else if (reniecBody && !reniecBody.ok) {
        setDniStatus({ kind: "fail", message: reniecBody.error });
      } else if (reniecResult.status === "rejected") {
        const err = reniecResult.reason;
        setDniStatus({
          kind: "fail",
          message: err instanceof Error ? err.message : "Error de red.",
        });
      }

      // ── DAA ────────────────────────────────────────────────────────
      const daaBody =
        daaResult.status === "fulfilled"
          ? (daaResult.value as
              | {
                  ok: true;
                  data: {
                    carrera: string;
                    facultad: string;
                    emailInstitucional: string | null;
                    emailPersonal: string | null;
                  };
                }
              | { ok: false; error: string })
          : null;
      if (daaBody && daaBody.ok) {
        const d = daaBody.data;
        setForm((f) => ({
          ...f,
          // Solo prellenar si está vacío. Carrera del DAA usa formato
          // "INGENIERÍA DE SISTEMAS E INFORMÁTICA" — exactamente lo que SUNEDU
          // y el reporte CAS esperan.
          carreraEgresado: f.carreraEgresado.trim() ? f.carreraEgresado : d.carrera,
          correoInstitucional:
            f.correoInstitucional.trim()
              ? f.correoInstitucional
              : d.emailInstitucional ?? f.correoInstitucional,
          correoPersonal:
            f.correoPersonal.trim()
              ? f.correoPersonal
              : d.emailPersonal ?? f.correoPersonal,
        }));
        setDaaStatus({
          kind: "ok",
          carrera: d.carrera,
          facultad: d.facultad,
        });
      } else if (daaBody && !daaBody.ok) {
        setDaaStatus({ kind: "fail", message: daaBody.error });
      } else if (daaResult.status === "rejected") {
        setDaaStatus({ kind: "fail", message: "DAA no respondió." });
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [form.numeroDocumento, form.tipoDocumentoCode, mode]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setTopError(null);
    setFieldErrors({});
    const res = await onSubmit(form, editingId);
    if (!res.ok) {
      setTopError(res.error);
      if (res.fieldErrors) setFieldErrors(res.fieldErrors);
    }
    setSubmitting(false);
  };

  const isPeru = form.paisNacimientoCode === PERU_PAIS_CODE;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form className="modal" onSubmit={submit} style={{ maxWidth: 840 }}>
        <div className="modal__head">
          <h2>
            {mode === "create" ? "Nuevo trabajador" : "Editar trabajador"}
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <Icon name="close" size={18} />
          </Button>
        </div>

        <div className="modal__body">
          {topError && <ErrorBanner>{topError}</ErrorBanner>}

          <SectionTitle>Datos generales</SectionTitle>
          <Row>
            <FieldSelect
              label="Tipo de documento *"
              value={form.tipoDocumentoCode}
              options={TIPOS_DOCUMENTO.map((t) => ({
                value: t.code,
                label: t.label,
              }))}
              onChange={(v) => set("tipoDocumentoCode", v)}
              error={fieldErrors.tipoDocumentoCode}
            />
            <FieldText
              label={
                form.tipoDocumentoCode === 1 && mode === "create"
                  ? "Número de DNI * (autocompleta con RENIEC al ingresar 8 dígitos)"
                  : "Número de documento *"
              }
              value={form.numeroDocumento}
              onChange={(v) => set("numeroDocumento", v)}
              error={fieldErrors.numeroDocumento}
              maxLength={20}
            />
          </Row>

          <DniStatusLine status={dniStatus} />
          <DaaStatusLine status={daaStatus} />

          <FieldText
            label="Nombres *"
            value={form.nombres}
            onChange={(v) => set("nombres", v)}
            error={fieldErrors.nombres}
            maxLength={80}
          />

          <Row3>
            <FieldText
              label="Primer apellido *"
              value={form.primerApellido}
              onChange={(v) => set("primerApellido", v)}
              error={fieldErrors.primerApellido}
              maxLength={80}
            />
            <FieldText
              label="Segundo apellido"
              value={form.segundoApellido}
              onChange={(v) => set("segundoApellido", v)}
              error={fieldErrors.segundoApellido}
              maxLength={80}
              disabled={form.unSoloApellido}
            />
            <FieldText
              label="Apellido casada"
              value={form.apellidoCasada}
              onChange={(v) => set("apellidoCasada", v)}
              maxLength={80}
            />
          </Row3>

          {/* Voltear nombres ↔ apellidos. Útil cuando el import asumió el
              orden incorrecto (sin coma separadora en el xlsx fuente). */}
          <div style={{ marginTop: -8, marginBottom: 12 }}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setForm((f) => {
                  const newNombres = [f.primerApellido, f.segundoApellido]
                    .filter(Boolean)
                    .join(" ")
                    .trim();
                  const parts = f.nombres.trim().split(/\s+/).filter(Boolean);
                  return {
                    ...f,
                    nombres: newNombres,
                    primerApellido: parts[0] ?? "",
                    segundoApellido: parts.slice(1).join(" "),
                    unSoloApellido: parts.length <= 1,
                  };
                });
                toast.success("Nombres y apellidos volteados");
              }}
              title="Útil si el orden fue parseado al revés (NOMBRES en lugar de APELLIDOS y viceversa)"
              style={{ fontSize: 12 }}
            >
              <Icon name="external" size={14} />
              Voltear apellidos ↔ nombres
            </Button>
          </div>

          <Row>
            <FieldCheckbox
              label="Tiene un solo apellido (sin segundo apellido)"
              checked={form.unSoloApellido}
              onChange={(v) =>
                setForm((f) => ({
                  ...f,
                  unSoloApellido: v,
                  segundoApellido: v ? "" : f.segundoApellido,
                }))
              }
            />
            <FieldSelect
              label="Sexo *"
              value={form.sexoCode}
              options={SEXOS.map((s) => ({ value: s.code, label: s.label }))}
              onChange={(v) => set("sexoCode", v)}
            />
          </Row>

          <Row>
            <FieldDate
              label="Fecha de nacimiento *"
              value={form.fechaNacimiento}
              onChange={(v) => set("fechaNacimiento", v)}
              error={fieldErrors.fechaNacimiento}
            />
            <FieldCheckbox
              label="Condición de discapacidad"
              checked={form.condicionDiscapacidad}
              onChange={(v) =>
                setForm((f) => ({
                  ...f,
                  condicionDiscapacidad: v,
                  tipoDiscapacidadCode: v ? f.tipoDiscapacidadCode : null,
                }))
              }
            />
          </Row>

          {form.condicionDiscapacidad && (
            <FieldSelect
              label="Tipo de discapacidad *"
              value={form.tipoDiscapacidadCode ?? 0}
              options={[
                { value: 0, label: "— seleccionar —" },
                ...TIPOS_DISCAPACIDAD.map((t) => ({
                  value: t.code,
                  label: t.label,
                })),
              ]}
              onChange={(v) => set("tipoDiscapacidadCode", v || null)}
              error={fieldErrors.tipoDiscapacidadCode}
            />
          )}

          <SectionTitle>Procedencia y domicilio</SectionTitle>
          <PaisField
            label="País de nacimiento *"
            value={form.paisNacimientoCode}
            onChange={(v) => set("paisNacimientoCode", v)}
            error={fieldErrors.paisNacimientoCode}
          />
          {isPeru && (
            <UbigeoField
              label="Ubigeo de nacimiento *"
              value={form.ubigeoNacimiento}
              onChange={(v) => set("ubigeoNacimiento", v)}
              error={fieldErrors.ubigeoNacimiento}
            />
          )}
          <UbigeoField
            label="Ubigeo de domicilio *"
            value={form.ubigeoDomicilio}
            onChange={(v) => set("ubigeoDomicilio", v)}
            error={fieldErrors.ubigeoDomicilio}
          />

          <SectionTitle>Contacto</SectionTitle>
          <Row>
            <FieldText
              label="Correo institucional"
              value={form.correoInstitucional}
              onChange={(v) => set("correoInstitucional", v)}
              error={fieldErrors.correoInstitucional}
              maxLength={120}
              type="email"
            />
            <FieldText
              label="Correo personal"
              value={form.correoPersonal}
              onChange={(v) => set("correoPersonal", v)}
              error={fieldErrors.correoPersonal}
              maxLength={120}
              type="email"
            />
          </Row>
          <Row>
            <FieldText
              label="Teléfono"
              value={form.telefono}
              onChange={(v) => set("telefono", v)}
              maxLength={20}
            />
            <FieldText
              label="Celular"
              value={form.celular}
              onChange={(v) => set("celular", v)}
              maxLength={20}
            />
          </Row>

          <SectionTitle>Cargo en la institución</SectionTitle>
          <Row>
            <FieldSelect
              label="Cargo *"
              value={form.cargoCode}
              options={CARGOS.map((c) => ({ value: c.code, label: c.label }))}
              onChange={(v) => set("cargoCode", v)}
            />
            <FieldSelect
              label="Dependencia *"
              value={form.dependenciaCode}
              options={DEPENDENCIAS.map((d) => ({
                value: d.code,
                label: d.label,
              }))}
              onChange={(v) => set("dependenciaCode", v)}
            />
          </Row>
          <FieldDate
            label="Fecha de ingreso a la institución *"
            value={form.fechaIngresoIE}
            onChange={(v) => set("fechaIngresoIE", v)}
            error={fieldErrors.fechaIngresoIE}
          />

          <SectionTitle>Datos UNAMAD (no se exportan a SUNEDU)</SectionTitle>
          <Row3>
            <FieldDatalist
              label="Grado máximo"
              value={form.gradoMaximo}
              onChange={(v) => set("gradoMaximo", v)}
              suggestions={GRADOS_MAXIMOS}
              listId="dl-grado-maximo"
              maxLength={60}
              placeholder="BACHILLER, TECNICO, …"
            />
            <FieldDatalist
              label="Grupo de carrera"
              value={form.grupoCarrera}
              onChange={(v) => set("grupoCarrera", v)}
              suggestions={GRUPOS_CARRERA}
              listId="dl-grupo-carrera"
              maxLength={60}
              placeholder="ADMINISTRACION, INGENIERIA, …"
            />
            <FieldDatalist
              label="Carrera egresado"
              value={form.carreraEgresado}
              onChange={(v) => set("carreraEgresado", v)}
              suggestions={CARRERAS_COMUNES}
              listId="dl-carrera"
              maxLength={120}
              placeholder="CONTABILIDAD Y FINANZAS, …"
            />
          </Row3>
          <FieldDatalist
            label={
              variant === "cas"
                ? "Cargo detallado"
                : "Puesto detallado"
            }
            value={form.puestoDetallado}
            onChange={(v) => set("puestoDetallado", v)}
            suggestions={CARGOS_DETALLADOS}
            listId="dl-cargo-detallado"
            maxLength={120}
            placeholder="ASISTENTE ADMINISTRATIVO, …"
          />
          <Row>
            <FieldDatalist
              label="Plaza de origen"
              value={form.plazaOrigen}
              onChange={(v) => set("plazaOrigen", v)}
              suggestions={PLAZAS_COMUNES}
              listId="dl-plaza-origen"
              maxLength={120}
              placeholder="UNIDAD DE SERVICIOS GENERALES, …"
            />
            <FieldDatalist
              label={
                variant === "cas"
                  ? "Plaza actual / Rotaciones"
                  : "Plaza actual"
              }
              value={form.plazaActual}
              onChange={(v) => set("plazaActual", v)}
              suggestions={PLAZAS_COMUNES}
              listId="dl-plaza-actual"
              maxLength={120}
              placeholder="UNIDAD DE SERVICIOS GENERALES, …"
            />
          </Row>
          <FieldSelect
            label="Estado del trabajador *"
            value={form.status}
            options={STAFF_STATUSES.map((s) => ({ value: s, label: s }))}
            onChange={(v) => set("status", v as StaffStatus)}
            isString
          />

          {/* Datos de cese: requeridos cuando el trabajador queda en baja. */}
          {(CESE_STATUSES as readonly string[]).includes(form.status) && (
            <>
              <SectionTitle>Baja / Cese</SectionTitle>
              <Row>
                <FieldDate
                  label="Fecha de cese *"
                  value={form.fechaCese}
                  onChange={(v) => set("fechaCese", v)}
                  error={fieldErrors.fechaCese}
                />
                <FieldSelect
                  label="Motivo del cese *"
                  value={form.motivoCese || ""}
                  options={[
                    { value: "", label: "— seleccionar —" },
                    ...STAFF_CESE_MOTIVOS.map((m) => ({
                      value: m,
                      label: CESE_MOTIVO_LABELS[m],
                    })),
                  ]}
                  onChange={(v) =>
                    set("motivoCese", v as StaffCeseMotivo | "")
                  }
                  error={fieldErrors.motivoCese}
                  isString
                />
              </Row>
              <FieldText
                label="Documento de cese (resolución / carta de renuncia)"
                value={form.documentoCese}
                onChange={(v) => set("documentoCese", v)}
                maxLength={300}
              />
            </>
          )}

          {mode === "create" && (
            <>
              <SectionTitle>
                {variant === "cas"
                  ? "Contrato CAS Determinado"
                  : variant === "indeterminado"
                    ? "Vínculo CAS Indeterminado"
                    : variant === "confianza"
                      ? "Vínculo CAS Confianza"
                      : "Vínculo laboral inicial"}
              </SectionTitle>
              <Row>
                <FieldSelect
                  label="Condición del contrato *"
                  value={form.vinculo.condicionContrato || "DETERMINADO"}
                  options={[
                    { value: "DETERMINADO", label: "CAS Determinado (con fecha de término)" },
                    { value: "INDETERMINADO", label: "Indeterminado (estable)" },
                    { value: "CONFIANZA", label: "Confianza" },
                  ]}
                  onChange={(v) =>
                    setV("condicionContrato", v as StaffCondition)
                  }
                  error={fieldErrors["vinculo.condicionContrato"]}
                  isString
                />
                <FieldCheckbox
                  label="Es adenda de un vínculo previo"
                  checked={form.vinculo.esAdenda}
                  onChange={(v) => setV("esAdenda", v)}
                />
              </Row>
              <Row>
                <FieldSelect
                  label="Régimen laboral *"
                  value={form.vinculo.regimenLaboralCode}
                  options={REGIMENES_LABORAL.map((r) => ({
                    value: r.code,
                    label: r.label,
                  }))}
                  onChange={(v) => setV("regimenLaboralCode", v)}
                  error={fieldErrors["vinculo.regimenLaboralCode"]}
                />
                <FieldSelect
                  label="¿Es el vínculo actual? *"
                  value={form.vinculo.vinculoActualCode}
                  options={VINCULOS_ACTUAL.map((v) => ({
                    value: v.code,
                    label: v.label,
                  }))}
                  onChange={(v) => setV("vinculoActualCode", v)}
                  error={fieldErrors["vinculo.vinculoActualCode"]}
                />
              </Row>
              <Row>
                <FieldDate
                  label="Fecha inicio *"
                  value={form.vinculo.fechaInicio}
                  onChange={(v) => setV("fechaInicio", v)}
                  error={fieldErrors["vinculo.fechaInicio"]}
                />
                <FieldDate
                  label={
                    form.vinculo.vinculoActualCode === 1
                      ? "Fecha término (opcional)"
                      : "Fecha término *"
                  }
                  value={form.vinculo.fechaTermino}
                  onChange={(v) => setV("fechaTermino", v)}
                  error={fieldErrors["vinculo.fechaTermino"]}
                />
              </Row>

              <SectionTitle>Lugar de trabajo inicial</SectionTitle>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: "pointer",
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border-strong)",
                    background: !form.workplace.otroLocal
                      ? "var(--accent-soft)"
                      : "transparent",
                    color: !form.workplace.otroLocal
                      ? "var(--accent-strong)"
                      : "var(--text)",
                    flex: "1 1 200px",
                  }}
                >
                  <input
                    type="radio"
                    checked={!form.workplace.otroLocal}
                    onChange={() => setW("otroLocal", false)}
                  />
                  Sede UNAMAD
                </label>
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: "pointer",
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border-strong)",
                    background: form.workplace.otroLocal
                      ? "var(--accent-soft)"
                      : "transparent",
                    color: form.workplace.otroLocal
                      ? "var(--accent-strong)"
                      : "var(--text)",
                    flex: "1 1 200px",
                  }}
                >
                  <input
                    type="radio"
                    checked={form.workplace.otroLocal}
                    onChange={() => setW("otroLocal", true)}
                  />
                  Otro local
                </label>
              </div>

              {!form.workplace.otroLocal ? (
                <FieldSelect
                  label="Sede *"
                  value={form.workplace.localId}
                  options={[
                    { value: "", label: "— seleccionar —" },
                    ...localOptions.map((l) => ({
                      value: l.id,
                      label: `${l.code} — ${l.name}`,
                    })),
                  ]}
                  onChange={(v) => setW("localId", String(v))}
                  error={fieldErrors["workplace.localId"]}
                  isString
                />
              ) : (
                <>
                  <UbigeoField
                    label="Ubigeo del local *"
                    value={form.workplace.ubigeoLocal}
                    onChange={(v) => setW("ubigeoLocal", v)}
                    error={fieldErrors["workplace.ubigeoLocal"]}
                  />
                  <FieldText
                    label="Dirección *"
                    value={form.workplace.direccion}
                    onChange={(v) => setW("direccion", v)}
                    error={fieldErrors["workplace.direccion"]}
                    maxLength={200}
                  />
                </>
              )}
            </>
          )}

          {mode === "edit" && variant === "cas" && editingRow && (
            <AdendasSection
              row={editingRow}
              onAfterAdd={onAfterAdenda}
            />
          )}

          {mode === "edit" && variant !== "cas" && (
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: 12,
                marginTop: 12,
              }}
            >
              Los lugares de trabajo y vínculos adicionales se gestionan desde
              el detalle del trabajador (próximamente).
            </p>
          )}
        </div>

        <div className="modal__foot">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={submitting}
          >
            {submitting ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────── Small UI helpers ───────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        fontSize: 12,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: "var(--text-muted)",
        fontWeight: 600,
        marginTop: 24,
        marginBottom: 12,
        paddingBottom: 6,
        borderBottom: "1px solid var(--border)",
      }}
    >
      {children}
    </h3>
  );
}

// Auto-fit grids: 2 (or 3) columns when there's room, single column when the
// modal narrows on mobile — no media query needed.
function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 16,
        alignItems: "flex-start",
      }}
    >
      {children}
    </div>
  );
}
function Row3({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 16,
        alignItems: "flex-start",
      }}
    >
      {children}
    </div>
  );
}

function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#fee2e2",
        color: "#991b1b",
        padding: "10px 12px",
        borderRadius: 8,
        marginBottom: 14,
        fontSize: 13,
      }}
    >
      {children}
    </div>
  );
}

function FieldText({
  label,
  value,
  onChange,
  error,
  maxLength,
  type = "text",
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  maxLength?: number;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div className="field">
      <label className="field__label">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        disabled={disabled}
      />
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}

function FieldDate({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  return (
    <div className="field">
      <label className="field__label">{label}</label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}

/** Combobox shadcn (Popover + cmdk Command) con búsqueda, navegación por
 *  teclado y soporte para valor custom. El usuario puede escoger de la lista
 *  o tipear su propio valor (caso de cargo/plaza nueva no listada).
 *  Mantiene la API previa de FieldDatalist para no tocar los call sites. */
function FieldDatalist({
  label,
  value,
  onChange,
  suggestions,
  listId,
  maxLength,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suggestions: readonly string[];
  listId: string;
  maxLength?: number;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Si el usuario tipea algo no en la lista, lo ofrecemos como "valor custom".
  const trimmed = search.trim().toUpperCase();
  const hasExactMatch = suggestions.some(
    (s) => s.toUpperCase() === trimmed,
  );
  const showCustomOption =
    trimmed.length > 0 && !hasExactMatch && trimmed.length <= (maxLength ?? 200);

  return (
    <div className="field">
      <label className="field__label" id={listId + "-label"}>
        {label}
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-labelledby={listId + "-label"}
            className={cn(
              "flex items-center justify-between gap-2 w-full",
              "border border-[color:var(--border-strong)] rounded-md px-3 h-10",
              "bg-[color:var(--surface)] text-[color:var(--text)] text-sm",
              "cursor-pointer hover:border-[color:var(--text-muted)]",
              "focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:border-transparent",
            )}
            style={{ textTransform: "uppercase" }}
          >
            <span
              className={cn(
                "truncate",
                !value && "text-[color:var(--text-faint)] normal-case",
              )}
            >
              {value || placeholder || "— seleccionar —"}
            </span>
            <ChevronsUpDown
              className="h-4 w-4 shrink-0 opacity-50"
              aria-hidden="true"
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
        >
          <Command shouldFilter={true}>
            <CommandInput
              placeholder="Buscar..."
              value={search}
              onValueChange={setSearch}
              maxLength={maxLength}
            />
            <CommandList>
              {!showCustomOption && (
                <CommandEmpty>Sin coincidencias.</CommandEmpty>
              )}
              <CommandGroup heading={`${suggestions.length} opciones canónicas`}>
                {suggestions.map((s) => (
                  <CommandItem
                    key={s}
                    value={s}
                    onSelect={(v) => {
                      onChange(v.toUpperCase());
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    <Check
                      className={cn(
                        "h-4 w-4",
                        value === s ? "opacity-100" : "opacity-0",
                      )}
                      style={{ color: "var(--accent-strong)" }}
                      aria-hidden="true"
                    />
                    <span style={{ textTransform: "uppercase" }}>{s}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
              {showCustomOption && (
                <CommandGroup heading="Valor personalizado">
                  <CommandItem
                    value={"__custom__" + trimmed}
                    onSelect={() => {
                      onChange(trimmed);
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    <span
                      className="inline-flex h-4 w-4 items-center justify-center text-xs"
                      style={{ color: "var(--accent-strong)" }}
                      aria-hidden="true"
                    >
                      +
                    </span>
                    <span>
                      Usar &quot;<b>{trimmed}</b>&quot; como valor personalizado
                    </span>
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function FieldSelect<T extends number | string>({
  label,
  value,
  options,
  onChange,
  error,
  isString,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  error?: string;
  isString?: boolean;
}) {
  return (
    <div className="field">
      <label className="field__label">{label}</label>
      <select
        value={String(value)}
        onChange={(e) =>
          onChange(
            (isString ? e.target.value : Number(e.target.value)) as T,
          )
        }
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}

function FieldCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        marginTop: 24,
        fontSize: 13.5,
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

// ─────────────────────────── Year filter chips ───────────────────────────

function YearFilter({
  years,
  value,
  onChange,
}: {
  years: number[];
  value: number | null;
  onChange: (y: number | null) => void;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 12.5,
        color: "var(--text-muted)",
      }}
    >
      <span style={{ marginRight: 4 }}>Año:</span>
      <Button
        size="sm"
        variant={value === null ? "default" : "outline"}
        onClick={() => onChange(null)}
        aria-pressed={value === null}
      >
        Todos
      </Button>
      {years.map((y) => (
        <Button
          key={y}
          size="sm"
          variant={value === y ? "default" : "outline"}
          onClick={() => onChange(y)}
          aria-pressed={value === y}
        >
          {y}
        </Button>
      ))}
    </div>
  );
}

// ─────────────────────────── Faceted filters (Estado / Cargo / Dependencia) ───────────────────────────

/** Dropdown de filtro multi-selección. Reutiliza el patrón Popover + cmdk
 *  Command (búsqueda + navegación por teclado) de FieldDatalist, pero con
 *  checkboxes: seleccionar un ítem NO cierra el popover, para marcar varios.
 *  Set vacío = sin filtro. El trigger muestra un badge con el conteo activo. */
function FacetFilter<T extends string | number>({
  label,
  options,
  selected,
  onChange,
  searchable = true,
}: {
  label: string;
  options: { value: T; label: string }[];
  selected: Set<T>;
  onChange: (next: Set<T>) => void;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const count = selected.size;
  const toggle = (v: T) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(next);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={count > 0 ? "default" : "outline"}
          size="sm"
          type="button"
          aria-expanded={open}
          aria-label={
            count > 0
              ? `${label}: ${count} seleccionado${count === 1 ? "" : "s"}`
              : label
          }
        >
          {label}
          {count > 0 && (
            <span
              style={{
                marginLeft: 2,
                minWidth: 18,
                height: 18,
                padding: "0 5px",
                borderRadius: 9,
                background: "var(--surface)",
                color: "var(--text)",
                fontSize: 11,
                fontWeight: 700,
                display: "inline-grid",
                placeItems: "center",
              }}
            >
              {count}
            </span>
          )}
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          {searchable && (
            <CommandInput placeholder={`Buscar ${label.toLowerCase()}…`} />
          )}
          <CommandList>
            <CommandEmpty>Sin coincidencias.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={String(o.value)}
                  value={o.label}
                  onSelect={() => toggle(o.value)}
                >
                  <Checkbox
                    checked={selected.has(o.value)}
                    className="pointer-events-none"
                    aria-hidden="true"
                  />
                  <span className="truncate">{o.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {count > 0 && (
            <div style={{ borderTop: "1px solid var(--border)", padding: 4 }}>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => onChange(new Set())}
              >
                Limpiar {label.toLowerCase()}
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Chips de filtros activos debajo de la barra. Recibe la lista ya calculada
 *  (agnóstico del conjunto de facetas). El ✕ de cada chip limpia esa faceta.
 *  A la derecha, el conteo de resultados vs total. */
function FilterChips({
  chips,
  resultCount,
  totalCount,
  onClearAll,
}: {
  chips: { key: string; text: string; onRemove: () => void }[];
  resultCount: number;
  totalCount: number;
  onClearAll: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        margin: "0 0 8px",
        fontSize: 12.5,
        color: "var(--text-muted)",
      }}
    >
      <span style={{ fontWeight: 600 }}>Filtros:</span>
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.onRemove}
          title="Quitar filtro"
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-1"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 8px",
            borderRadius: 999,
            border: "1px solid var(--accent)",
            background: "var(--accent-soft)",
            color: "var(--accent-strong)",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {c.text}
          <span aria-hidden="true">✕</span>
        </button>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-1"
        style={{
          background: "none",
          border: "none",
          color: "var(--text-muted)",
          textDecoration: "underline",
          cursor: "pointer",
          fontSize: 12,
          padding: "2px 4px",
        }}
      >
        Limpiar todo
      </button>
      <span style={{ marginLeft: "auto" }}>
        <b style={{ color: "var(--text)" }}>{resultCount}</b> de {totalCount}
      </span>
    </div>
  );
}

// ─────────────────────────── Column visibility dropdown ───────────────────────────

function ColumnVisibilityMenu({
  cols,
  visibility,
  variant,
  onToggle,
  onReset,
}: {
  cols: { key: string; label: string }[];
  visibility: Record<string, boolean>;
  variant: StaffVariant;
  onToggle: (key: string, visible: boolean) => void;
  onReset: () => void;
}) {
  const hiddenCount = cols.filter(
    (c) => !REQUIRED_COLS.has(c.key) && !isVisible(visibility, c.key, variant),
  ).length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" type="button">
          <Icon name="settings" size={14} />
          Columnas{hiddenCount > 0 && ` (${hiddenCount} ocultas)`}
          <Icon name="chevron-down" size={14} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[420px] overflow-y-auto">
        <DropdownMenuLabel>Mostrar / ocultar columnas</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {cols.map((c) => {
          const required = REQUIRED_COLS.has(c.key);
          const visible = isVisible(visibility, c.key, variant);
          return (
            <DropdownMenuCheckboxItem
              key={c.key}
              checked={visible}
              disabled={required}
              onCheckedChange={(v) => onToggle(c.key, v)}
            >
              {c.label}
              {required && (
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 10,
                    color: "var(--text-faint)",
                  }}
                >
                  (obligatoria)
                </span>
              )}
            </DropdownMenuCheckboxItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onReset}>
          <Icon name="check" size={14} />
          Restaurar predeterminadas
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─────────────────────────── Pagination ───────────────────────────

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

function Pagination({
  totalRows,
  totalAll,
  page,
  pageSize,
  totalPages,
  from,
  to,
  onPageChange,
  onPageSizeChange,
}: {
  totalRows: number;
  totalAll: number;
  page: number;
  pageSize: number;
  totalPages: number;
  from: number;
  to: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (n: number) => void;
}) {
  const showingFrom = totalRows === 0 ? 0 : from + 1;
  const showingTo = to;
  const isAll = pageSize === 0;

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t"
      style={{
        borderColor: "var(--border)",
        background: "var(--bg-soft)",
        fontSize: 13,
        color: "var(--text-muted)",
      }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span>Filas por página:</span>
        {PAGE_SIZE_OPTIONS.map((n) => (
          <Button
            key={n}
            size="sm"
            variant={pageSize === n ? "default" : "outline"}
            onClick={() => onPageSizeChange(n)}
            aria-pressed={pageSize === n}
          >
            {n}
          </Button>
        ))}
        <Button
          size="sm"
          variant={isAll ? "default" : "outline"}
          onClick={() => onPageSizeChange(0)}
          aria-pressed={isAll}
        >
          Todos
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <span style={{ color: "var(--text)" }}>
          <b>
            {showingFrom}-{showingTo}
          </b>{" "}
          de <b>{totalRows}</b>
          {totalRows !== totalAll && (
            <span style={{ color: "var(--text-muted)" }}>
              {" "}
              (filtrados de {totalAll})
            </span>
          )}
        </span>
        {!isAll && totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              aria-label="Primera página"
              title="Primera página"
              disabled={page === 1}
              onClick={() => onPageChange(1)}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Página anterior"
              title="Página anterior"
              disabled={page === 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span style={{ minWidth: 96, textAlign: "center" }}>
              Página <b style={{ color: "var(--text)" }}>{page}</b> de{" "}
              <b style={{ color: "var(--text)" }}>{totalPages}</b>
            </span>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Página siguiente"
              title="Página siguiente"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Última página"
              title="Última página"
              disabled={page >= totalPages}
              onClick={() => onPageChange(totalPages)}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── StaffTable (variant-aware) ───────────────────────────

type StaffColumn = {
  key: string;
  label: string;
  width?: number;
  nowrap?: boolean;
  align?: "left" | "right" | "center";
  render: (s: StaffRow, index: number) => React.ReactNode;
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  // Usamos componentes UTC para evitar shifts por TZ del browser. Las fechas
  // en SUNEDU son date-only (sin hora), así que mostramos exactamente el
  // Y/M/D guardado, sin reinterpretación TZ.
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function fmtSexo(code: number): string {
  return code === 1 ? "M" : code === 2 ? "F" : "—";
}

function dash(value: string | null | undefined): string {
  return value && value.trim() ? value : "—";
}

function EstadoBadge({ status }: { status: StaffStatus }) {
  const cls =
    status === "ACTIVO"
      ? "badge badge--green"
      : status === "LICENCIA"
        ? "badge badge--amber"
        : status === "FALLECIMIENTO"
          ? "badge badge--red"
          : "badge badge--neutral";
  return <span className={cls}>{status}</span>;
}

// Columnas comunes que aparecen tanto en CAS como en Indeterminados
const COL_NRO: StaffColumn = {
  key: "nro",
  label: "N°",
  width: 44,
  align: "center",
  render: (_s, i) => (
    <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{i + 1}</span>
  ),
};

const COL_ESTADO: StaffColumn = {
  key: "estado",
  label: "Estado",
  width: 100,
  render: (s) => <EstadoBadge status={s.status} />,
};

const COL_NOMBRE: StaffColumn = {
  key: "nombre",
  label: "Nombre",
  nowrap: false,
  render: (s) => (
    <div style={{ fontWeight: 500, minWidth: 180 }}>{s.fullName}</div>
  ),
};

const COL_DNI: StaffColumn = {
  key: "dni",
  label: "DNI",
  width: 100,
  nowrap: true,
  render: (s) => (
    <code style={{ fontSize: 13, color: "var(--text)" }}>
      {s.numeroDocumento}
    </code>
  ),
};

const COL_GRADO: StaffColumn = {
  key: "gradoMaximo",
  label: "Grado máximo",
  render: (s) => (
    <span className="dtable__muted">{dash(s.gradoMaximo)}</span>
  ),
};

const COL_GRUPO: StaffColumn = {
  key: "grupoCarrera",
  label: "Grupo carrera",
  render: (s) => (
    <span className="dtable__muted">{dash(s.grupoCarrera)}</span>
  ),
};

const COL_CARRERA: StaffColumn = {
  key: "carrera",
  label: "Carrera",
  render: (s) => (
    <span className="dtable__muted">{dash(s.carreraEgresado)}</span>
  ),
};

const COL_SEXO: StaffColumn = {
  key: "sexo",
  label: "Sexo",
  width: 60,
  align: "center",
  render: (s) => <span>{fmtSexo(s.sexoCode)}</span>,
};

const COL_CARGO: StaffColumn = {
  key: "cargo",
  label: "Cargo",
  render: (s) => (
    <div>
      <div>{dash(s.puestoDetallado)}</div>
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
        {s.cargoLabel}
      </div>
    </div>
  ),
};

const COL_CONDICION: StaffColumn = {
  key: "condicion",
  label: "Condición",
  width: 140,
  render: (s) => <CondicionBadge condicion={s.currentCondicion} />,
};

const COL_REGIMEN: StaffColumn = {
  key: "regimen",
  label: "Régimen laboral",
  render: (s) => (
    <span className="dtable__muted">{dash(s.currentRegimenLaboralLabel)}</span>
  ),
};

const COL_PLAZA_ORIGEN: StaffColumn = {
  key: "plazaOrigen",
  label: "Plaza de origen",
  render: (s) => <span className="dtable__muted">{dash(s.plazaOrigen)}</span>,
};

const COL_PLAZA_ACTUAL: StaffColumn = {
  key: "plazaActual",
  label: "Plaza actual",
  render: (s) => <span className="dtable__muted">{dash(s.plazaActual)}</span>,
};

const COL_PLAZA_ACTUAL_ROT: StaffColumn = {
  ...COL_PLAZA_ACTUAL,
  label: "Plaza actual / rotaciones",
};

const COL_CELULAR: StaffColumn = {
  key: "celular",
  label: "Celular",
  nowrap: true,
  render: (s) => <span className="dtable__muted">{dash(s.celular)}</span>,
};

const COL_CORREO_INST: StaffColumn = {
  key: "correoInst",
  label: "Correo institucional",
  render: (s) => (
    <span className="dtable__muted">{dash(s.correoInstitucional)}</span>
  ),
};

const COL_CORREO: StaffColumn = {
  key: "correoPersonal",
  label: "Correo",
  render: (s) => <span className="dtable__muted">{dash(s.correoPersonal)}</span>,
};

const COL_UBIGEO: StaffColumn = {
  key: "ubigeo",
  label: "Ubigeo",
  width: 90,
  render: (s) => (
    <code style={{ fontSize: 12, color: "var(--text-muted)" }}>
      {dash(s.ubigeoNacimiento || s.ubigeoDomicilio)}
    </code>
  ),
};

const COL_CUMPLE: StaffColumn = {
  key: "cumple",
  label: "Cumpleaños",
  width: 110,
  nowrap: true,
  render: (s) => (
    <span className="dtable__muted">{fmtDate(s.fechaNacimiento)}</span>
  ),
};

const COL_YEAR: StaffColumn = {
  key: "year",
  label: "Año",
  width: 70,
  align: "center",
  nowrap: true,
  render: (s) => {
    if (s.currentYear == null) return <span className="dtable__muted">—</span>;
    const multiYear = s.availableYears.length > 1;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontWeight: 600 }}>{s.currentYear}</span>
        {multiYear && (
          <span
            style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600 }}
            title={`Contratos en: ${s.availableYears.join(", ")}`}
          >
            +{s.availableYears.length - 1} año{s.availableYears.length > 2 ? "s" : ""}
          </span>
        )}
      </div>
    );
  },
};

const COL_INICIO: StaffColumn = {
  key: "contractInicio",
  label: "Inicio (vigente)",
  width: 110,
  nowrap: true,
  render: (s) => <span>{fmtDate(s.contractInicio)}</span>,
};

const COL_TERMINO: StaffColumn = {
  key: "contractTermino",
  label: "Término (vigente)",
  width: 110,
  nowrap: true,
  render: (s) => <span>{fmtDate(s.contractTermino)}</span>,
};

const COL_ADENDA: StaffColumn = {
  key: "adenda",
  label: "Adenda",
  width: 200,
  nowrap: true,
  render: (s) => {
    if (s.adendasCount === 0) {
      return <span className="dtable__muted">—</span>;
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 12 }}>
          {fmtDate(s.latestAdendaInicio)} → {fmtDate(s.latestAdendaTermino)}
        </span>
        <span
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            fontWeight: 600,
          }}
        >
          {s.adendasCount === 1
            ? "1 adenda"
            : `${s.adendasCount} adendas · última vigente`}
        </span>
      </div>
    );
  },
};

// Definición de columnas por variant (sin la columna de acciones, que se añade
// siempre al final).
const COLUMNS_BY_VARIANT: Record<StaffVariant, StaffColumn[]> = {
  cas: [
    COL_NRO,
    COL_ESTADO,
    COL_NOMBRE,
    COL_DNI,
    COL_YEAR,
    COL_GRADO,
    COL_GRUPO,
    { ...COL_CARRERA, label: "Carreras egresadas UNAMAD" },
    COL_SEXO,
    COL_CONDICION,
    COL_REGIMEN,
    COL_CARGO,
    COL_PLAZA_ORIGEN,
    COL_PLAZA_ACTUAL_ROT,
    COL_CELULAR,
    COL_CORREO_INST,
    COL_CORREO,
    COL_UBIGEO,
    COL_CUMPLE,
    COL_INICIO,
    COL_TERMINO,
    COL_ADENDA,
  ],
  indeterminado: [
    COL_NRO,
    COL_ESTADO,
    COL_NOMBRE,
    COL_CUMPLE,
    COL_DNI,
    COL_GRADO,
    COL_GRUPO,
    COL_CARRERA,
    COL_SEXO,
    COL_CARGO,
    COL_CONDICION,
    COL_REGIMEN,
    COL_PLAZA_ORIGEN,
    COL_PLAZA_ACTUAL,
    COL_CORREO,
    COL_CELULAR,
  ],
  confianza: [
    COL_NRO,
    COL_ESTADO,
    COL_NOMBRE,
    COL_CUMPLE,
    COL_DNI,
    COL_GRADO,
    COL_GRUPO,
    COL_CARRERA,
    COL_SEXO,
    COL_CARGO,
    COL_CONDICION,
    COL_REGIMEN,
    COL_PLAZA_ORIGEN,
    COL_PLAZA_ACTUAL,
    COL_CORREO,
    COL_CELULAR,
  ],
  all: [
    COL_NRO,
    COL_ESTADO,
    COL_NOMBRE,
    COL_DNI,
    COL_CARGO,
    COL_CONDICION,
    COL_REGIMEN,
    {
      key: "ingreso",
      label: "Ingreso",
      width: 110,
      nowrap: true,
      render: (s) => fmtDate(s.fechaIngresoIE),
    },
  ],
};

// Columnas que NUNCA se pueden ocultar (siempre visibles)
const REQUIRED_COLS = new Set<string>(["nombre"]);

// Indeterminado y Confianza comparten columnas y ocultan el mismo set por
// defecto. Visibles: N°, Estado, Nombre, DNI, Cargo, Condición, Régimen.
const INDET_CONF_HIDDEN = [
  "cumple",
  "gradoMaximo",
  "grupoCarrera",
  "carrera",
  "sexo",
  "plazaOrigen",
  "plazaActual",
  "correoPersonal",
  "celular",
];

// Columnas ocultas de fábrica por variant. El usuario las puede reactivar desde
// el menú "Columnas"; "Restaurar predeterminadas" vuelve a este estado. Una
// elección explícita del usuario (persistida en localStorage) siempre gana
// sobre este default.
const DEFAULT_HIDDEN_BY_VARIANT: Record<StaffVariant, Set<string>> = {
  // CAS: dejamos 9 columnas núcleo visibles (N°, Estado, Nombre, DNI, Año,
  // Cargo, Condición, Inicio, Término) y ocultamos las 13 restantes.
  cas: new Set<string>([
    "gradoMaximo",
    "grupoCarrera",
    "carrera",
    "sexo",
    "regimen",
    "plazaOrigen",
    "plazaActual",
    "celular",
    "correoInst",
    "correoPersonal",
    "ubigeo",
    "cumple",
    "adenda",
  ]),
  indeterminado: new Set<string>(INDET_CONF_HIDDEN),
  confianza: new Set<string>(INDET_CONF_HIDDEN),
  all: new Set<string>(),
};

function isVisible(
  visibility: Record<string, boolean>,
  key: string,
  variant: StaffVariant,
): boolean {
  if (REQUIRED_COLS.has(key)) return true;
  // Una elección explícita del usuario (true/false guardado) gana siempre.
  if (key in visibility) return visibility[key];
  // Sin elección previa: visible salvo que esté oculta por defecto en el variant.
  return !DEFAULT_HIDDEN_BY_VARIANT[variant].has(key);
}

function StaffTable({
  variant,
  rows,
  query,
  columnVisibility,
  canWrite,
  selectedIds,
  onToggleOne,
  onToggleAll,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  variant: StaffVariant;
  rows: StaffRow[];
  query: string;
  columnVisibility: Record<string, boolean>;
  canWrite: boolean;
  selectedIds: Set<string>;
  onToggleOne: (id: string) => void;
  onToggleAll: (rows: StaffRow[], select: boolean) => void;
  onEdit: (s: StaffRow) => void;
  onToggleActive: (s: StaffRow) => void;
  onDelete: (s: StaffRow) => void;
}) {
  const allCols = COLUMNS_BY_VARIANT[variant];
  const cols = allCols.filter((c) => isVisible(columnVisibility, c.key, variant));
  const totalCols = cols.length + 2; // + select + acción

  const selectedOnPage = rows.filter((r) => selectedIds.has(r.id)).length;
  const allSelected = rows.length > 0 && selectedOnPage === rows.length;
  const masterState: boolean | "indeterminate" = allSelected
    ? true
    : selectedOnPage > 0
      ? "indeterminate"
      : false;

  return (
    <table className="dtable">
      <thead>
        <tr>
          <th style={{ width: 38, padding: "0 0 0 12px" }}>
            <Checkbox
              checked={masterState}
              onCheckedChange={(v) => onToggleAll(rows, v === true)}
              aria-label={
                allSelected
                  ? "Deseleccionar todos en esta página"
                  : "Seleccionar todos en esta página"
              }
            />
          </th>
          {cols.map((c) => (
            <th
              key={c.key}
              style={{
                width: c.width,
                textAlign: c.align ?? "left",
                whiteSpace: c.nowrap ? "nowrap" : undefined,
              }}
            >
              {c.label}
            </th>
          ))}
          <th className="dtable__settings"> </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s, i) => {
          const isChecked = selectedIds.has(s.id);
          return (
          <tr
            key={s.id}
            style={
              isChecked
                ? { background: "var(--accent-softer)" }
                : undefined
            }
          >
            <td
              data-label="Seleccionar"
              style={{ width: 38, padding: "0 0 0 12px" }}
            >
              <Checkbox
                checked={isChecked}
                onCheckedChange={() => onToggleOne(s.id)}
                aria-label={`Seleccionar ${s.fullName}`}
              />
            </td>
            {cols.map((c) => (
              <td
                key={c.key}
                data-label={c.label}
                style={{
                  textAlign: c.align ?? "left",
                  whiteSpace: c.nowrap ? "nowrap" : undefined,
                }}
              >
                {c.render(s, i)}
              </td>
            ))}
            <td
              className="dtable__settings"
              style={{ whiteSpace: "nowrap" }}
            >
              <Button
                variant="ghost"
                size="icon"
                aria-label="Editar"
                title="Editar"
                disabled={!canWrite}
                onClick={() => onEdit(s)}
              >
                <Icon name="user" size={16} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={
                  s.status === "ACTIVO"
                    ? "Marcar PASIVO"
                    : "Reactivar (ACTIVO)"
                }
                title={
                  s.status === "ACTIVO"
                    ? "Marcar PASIVO (estados especiales en el modal)"
                    : "Reactivar — pasar a ACTIVO"
                }
                disabled={!canWrite}
                onClick={() => onToggleActive(s)}
              >
                <Icon name="lock" size={16} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Eliminar"
                title="Eliminar"
                disabled={!canWrite}
                onClick={() => onDelete(s)}
                className="text-[#dc2626] hover:bg-[#fee2e2] hover:text-[#b91c1c]"
              >
                <Icon name="trash" size={16} />
              </Button>
            </td>
          </tr>
          );
        })}
        {rows.length === 0 && (
          <tr className="dtable__empty">
            <td colSpan={totalCols}>
              <div className="empty">
                <Icon name="users" size={32} />
                <h3>Sin trabajadores</h3>
                <p>
                  {query
                    ? "Ningún resultado para tu búsqueda."
                    : "Aún no hay personal registrado. Crea el primero con \"Nuevo trabajador\"."}
                </p>
              </div>
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

// ─────────────────────────── Adendas section (CAS · edit modal) ───────────────────────────

function AdendasSection({
  row,
  onAfterAdd,
}: {
  row: StaffRow;
  onAfterAdd: () => void;
}) {
  const [inicio, setInicio] = useState("");
  const [termino, setTermino] = useState("");
  const [adding, setAdding] = useState(false);

  const submit = async () => {
    if (!inicio || !termino) {
      toast.error("Completa ambas fechas.");
      return;
    }
    setAdding(true);
    const res = await addAdenda(row.id, inicio, termino);
    if (res.ok) {
      toast.success("Adenda añadida.");
      setInicio("");
      setTermino("");
      onAfterAdd();
    } else {
      toast.error(res.error);
    }
    setAdding(false);
  };

  return (
    <>
      <SectionTitle>Adendas del contrato ({row.adendasCount})</SectionTitle>
      <p
        style={{
          fontSize: 12,
          color: "var(--text-muted)",
          marginTop: -8,
          marginBottom: 12,
          lineHeight: 1.5,
        }}
      >
        Cada vez que el jefe evalúa el desempeño y se renueva el contrato CAS,
        se registra una nueva adenda con su fecha de inicio y término. La
        última se marca como vigente automáticamente.
      </p>

      {row.adendas.length === 0 ? (
        <p
          style={{
            fontSize: 13,
            color: "var(--text-muted)",
            padding: 12,
            background: "var(--bg-soft)",
            borderRadius: 8,
            textAlign: "center",
          }}
        >
          Este trabajador no tiene un contrato CAS inicial registrado. Antes
          de añadir adendas debe existir el contrato original — crea uno
          nuevo trabajador desde cero.
        </p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: "0 0 16px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {row.adendas.map((v, i) => {
            const isLast = i === row.adendas.length - 1;
            const label = v.esAdenda
              ? `Adenda ${row.adendas.slice(0, i + 1).filter((x) => x.esAdenda).length}`
              : "Contrato original";
            return (
              <li
                key={v.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  background: isLast
                    ? "var(--accent-soft)"
                    : "var(--bg-soft)",
                  borderRadius: 8,
                  border: isLast
                    ? "1px solid var(--accent)"
                    : "1px solid var(--border)",
                }}
              >
                <span
                  style={{
                    minWidth: 130,
                    fontSize: 12.5,
                    fontWeight: 600,
                    // accent-strong (5.62:1) en lugar de accent (3.92:1) sobre soft
                    color: isLast ? "var(--accent-strong)" : "var(--text)",
                  }}
                >
                  {label}
                  {isLast && (
                    <span
                      style={{ marginLeft: 6, fontSize: 10, fontWeight: 700 }}
                    >
                      VIGENTE
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 13 }}>
                  {fmtDate(v.fechaInicio)} → {fmtDate(v.fechaTermino)}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div
        style={{
          padding: 12,
          background: "var(--bg-soft)",
          borderRadius: 8,
          border: "1px dashed var(--border-strong)",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--text-muted)",
            marginBottom: 8,
          }}
        >
          Añadir nueva adenda
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr auto",
            gap: 8,
            alignItems: "end",
          }}
        >
          <div>
            <label style={{ fontSize: 11, color: "var(--text-muted)" }}>
              Inicio
            </label>
            <input
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid var(--border-strong)",
                borderRadius: 6,
                fontSize: 13,
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--text-muted)" }}>
              Término
            </label>
            <input
              type="date"
              value={termino}
              onChange={(e) => setTermino(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid var(--border-strong)",
                borderRadius: 6,
                fontSize: 13,
              }}
            />
          </div>
          <Button
            type="button"
            size="sm"
            onClick={submit}
            disabled={adding || !inicio || !termino}
          >
            <Icon name="plus" size={14} />
            {adding ? "Añadiendo…" : "Añadir"}
          </Button>
        </div>
      </div>
    </>
  );
}

function CondicionBadge({
  condicion,
}: {
  condicion: StaffCondition | null;
}) {
  if (!condicion) {
    return <span className="badge badge--neutral">Sin condición</span>;
  }
  const cls =
    condicion === "DETERMINADO"
      ? "badge badge--amber"
      : condicion === "INDETERMINADO"
        ? "badge badge--green"
        : "badge badge--red";
  const label =
    condicion === "DETERMINADO"
      ? "CAS Determinado"
      : condicion === "INDETERMINADO"
        ? "Indeterminado"
        : "Confianza";
  return <span className={cls}>{label}</span>;
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <small
      style={{
        color: "#b91c1c",
        fontSize: 12,
        marginTop: 4,
        display: "block",
      }}
    >
      {children}
    </small>
  );
}

// ─────────────────────────── DNI lookup status ───────────────────────────

type DniStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; fullName: string; partial: boolean }
  | { kind: "fail"; message: string };

type DaaStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; carrera: string; facultad: string }
  | { kind: "fail"; message: string };

function DniStatusLine({ status }: { status: DniStatus }) {
  if (status.kind === "idle") return null;

  const base: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 8,
    fontSize: 13,
    marginTop: -4,
    marginBottom: 12,
  };

  if (status.kind === "loading") {
    return (
      <div
        style={{
          ...base,
          background: "var(--accent-softer)",
          // accent-strong (5.62:1) en vez de accent (3.92:1) sobre softer
          color: "var(--accent-strong)",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 14,
            height: 14,
            borderRadius: "50%",
            border: "2px solid var(--accent-soft)",
            borderTopColor: "var(--accent-strong)",
            display: "inline-block",
            animation: "dni-spin 0.7s linear infinite",
          }}
        />
        <span>Consultando RENIEC…</span>
        <style jsx>{`
          @keyframes dni-spin {
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </div>
    );
  }

  if (status.kind === "ok") {
    return (
      <div
        style={{
          ...base,
          background: "#d1fae5",
          color: "#065f46",
        }}
      >
        <Check size={14} aria-hidden="true" />
        <span>
          <b>{status.fullName}</b> — datos completados desde RENIEC
          {status.partial && (
            <span style={{ opacity: 0.85 }}>
              {" "}
              (el ubigeo de nacimiento no está en el catálogo INEI; completa
              manualmente)
            </span>
          )}
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        ...base,
        background: "#fef3c7",
        color: "#92400e",
      }}
    >
      <AlertTriangle size={14} aria-hidden="true" />
      <span>{status.message} Continúa llenando los datos manualmente.</span>
    </div>
  );
}

// ─────────────── DAA (Dirección de Asuntos Académicos) status ───────────────

function DaaStatusLine({ status }: { status: DaaStatus }) {
  // En "idle" o "loading" no mostramos nada: el spinner de RENIEC ya cubre la
  // espera. Solo destacamos cuando hay un hit DAA (auto-fill de carrera) o
  // cuando falló por una razón útil para el usuario (no es egresado UNAMAD).
  if (status.kind === "idle" || status.kind === "loading") return null;

  const base: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 8,
    fontSize: 13,
    marginTop: -4,
    marginBottom: 12,
  };

  if (status.kind === "ok") {
    return (
      <div style={{ ...base, background: "#dbeafe", color: "#1e3a8a" }}>
        <GraduationCap size={14} aria-hidden="true" />
        <span>
          Egresado UNAMAD detectado — carrera: <b>{status.carrera}</b>
          {status.facultad && (
            <>
              {" "}
              · Facultad: <b>{status.facultad}</b>
            </>
          )}
        </span>
      </div>
    );
  }

  // status.kind === "fail" — sólo informativo, sin "warning" amarillo: es
  // normal que personal externo no aparezca en DAA.
  return (
    <div style={{ ...base, background: "#f1f5f9", color: "#475569" }}>
      <Info size={14} aria-hidden="true" />
      <span>{status.message}</span>
    </div>
  );
}

// ─────────────────────────── País combobox ───────────────────────────

function PaisField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (code: string) => void;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = useMemo(
    () => PAISES.find((p) => p.code === value) ?? null,
    [value],
  );

  const matches = useMemo(() => {
    const q = normalizeSearch(search.trim());
    if (!q) return PAISES.slice(0, 30);
    const tokens = q.split(/\s+/).filter(Boolean);
    const out: PaisEntry[] = [];
    for (const p of PAISES) {
      const t = normalizeSearch(`${p.label} ${p.code}`);
      if (tokens.every((tok) => t.includes(tok))) {
        out.push(p);
        if (out.length >= 50) break;
      }
    }
    return out;
  }, [search]);

  return (
    <div className="field">
      <label className="field__label">{label}</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "flex items-center justify-between gap-2 w-full",
              "border border-[color:var(--border-strong)] rounded-md px-3 h-10",
              "bg-[color:var(--surface)] text-[color:var(--text)] text-sm",
              "cursor-pointer hover:border-[color:var(--text-muted)]",
              "focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:border-transparent",
            )}
          >
            <span
              className={cn(
                "truncate text-left",
                !selected && "text-[color:var(--text-faint)]",
              )}
            >
              {selected
                ? `${selected.label} (${selected.code})`
                : "— seleccionar país —"}
            </span>
            <ChevronsUpDown
              className="h-4 w-4 shrink-0 opacity-50"
              aria-hidden="true"
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Buscar país…"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              {matches.length === 0 && (
                <CommandEmpty>
                  Sin resultados para &quot;{search}&quot;.
                </CommandEmpty>
              )}
              {matches.length > 0 && (
                <CommandGroup
                  heading={
                    search
                      ? `${matches.length} resultado${matches.length === 1 ? "" : "s"}`
                      : "191 países (escribe para filtrar)"
                  }
                >
                  {matches.map((p) => (
                    <CommandItem
                      key={p.code}
                      value={p.code}
                      onSelect={() => {
                        onChange(p.code);
                        setOpen(false);
                        setSearch("");
                      }}
                    >
                      <Check
                        className={cn(
                          "h-4 w-4 shrink-0",
                          value === p.code ? "opacity-100" : "opacity-0",
                        )}
                        style={{ color: "var(--accent-strong)" }}
                        aria-hidden="true"
                      />
                      <div className="flex-1 min-w-0">
                        <div style={{ fontWeight: 500 }}>{p.label}</div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text-muted)",
                          }}
                        >
                          {p.code}
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}

// ─────────────────────────── Ubigeo combobox ───────────────────────────

/** Normaliza para búsqueda accent-insensitive: "Áncash" → "ancash". */
function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function UbigeoField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (code: string) => void;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = useMemo(
    () => UBIGEOS.find((u) => u.code === value) ?? null,
    [value],
  );

  // Pre-filtro manual: normaliza tildes, soporta búsqueda multi-palabra,
  // cap a 60 resultados (suficiente para mostrar todos los distritos de
  // cualquier departamento, los más grandes tienen ~30).
  const matches = useMemo(() => {
    const q = normalizeSearch(search.trim());
    if (!q) return UBIGEOS.slice(0, 30);
    const tokens = q.split(/\s+/).filter(Boolean);
    const out: UbigeoEntry[] = [];
    for (const u of UBIGEOS) {
      const t = normalizeSearch(
        `${u.departamento} ${u.provincia} ${u.distrito} ${u.code}`,
      );
      // Cada token debe aparecer en t (AND match) — permite "madre dios" y
      // "madre de dios" igualmente, y combina "tambopata madre".
      if (tokens.every((tok) => t.includes(tok))) {
        out.push(u);
        if (out.length >= 60) break;
      }
    }
    return out;
  }, [search]);

  return (
    <div className="field">
      <label className="field__label">{label}</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "flex items-center justify-between gap-2 w-full",
              "border border-[color:var(--border-strong)] rounded-md px-3 h-10",
              "bg-[color:var(--surface)] text-[color:var(--text)] text-sm",
              "cursor-pointer hover:border-[color:var(--text-muted)]",
              "focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:border-transparent",
            )}
          >
            <span
              className={cn(
                "truncate text-left",
                !selected && "text-[color:var(--text-faint)]",
              )}
            >
              {selected
                ? `${selected.departamento} / ${selected.provincia} / ${selected.distrito} (${selected.code})`
                : "— seleccionar departamento / provincia / distrito —"}
            </span>
            <ChevronsUpDown
              className="h-4 w-4 shrink-0 opacity-50"
              aria-hidden="true"
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Buscar departamento, provincia o distrito…"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              {matches.length === 0 && (
                <CommandEmpty>
                  Sin resultados para &quot;{search}&quot;.
                </CommandEmpty>
              )}
              {matches.length > 0 && (
                <CommandGroup
                  heading={
                    search
                      ? `${matches.length} resultado${matches.length === 1 ? "" : "s"}`
                      : "Empieza a escribir para buscar (mostrando primeros 30)"
                  }
                >
                  {matches.map((u) => (
                    <CommandItem
                      key={u.code}
                      value={u.code}
                      onSelect={() => {
                        onChange(u.code);
                        setOpen(false);
                        setSearch("");
                      }}
                    >
                      <Check
                        className={cn(
                          "h-4 w-4 shrink-0",
                          value === u.code ? "opacity-100" : "opacity-0",
                        )}
                        style={{ color: "var(--accent-strong)" }}
                        aria-hidden="true"
                      />
                      <div className="flex-1 min-w-0">
                        <div style={{ fontWeight: 500 }}>
                          {u.departamento} / {u.provincia} / {u.distrito}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text-muted)",
                          }}
                        >
                          {u.code}
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}

// Combo primitives
function ComboTrigger({
  onClick,
  text,
}: {
  onClick: () => void;
  text: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        border: "1px solid var(--border-strong)",
        borderRadius: 8,
        padding: "10px 12px",
        background: "var(--surface)",
        fontSize: 14,
        cursor: "pointer",
      }}
    >
      {text}
    </button>
  );
}
function ComboPopover({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        marginTop: 4,
        left: 0,
        right: 0,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        boxShadow: "var(--shadow-lg)",
        zIndex: 100,
        maxHeight: 320,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}
function ComboSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Filtrar…"
      style={{
        margin: 8,
        padding: "8px 10px",
        border: "1px solid var(--border-strong)",
        borderRadius: 6,
        fontSize: 13,
        outline: "none",
      }}
    />
  );
}
function ComboOption({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        padding: "8px 12px",
        border: 0,
        background: selected ? "var(--accent-soft)" : "transparent",
        textAlign: "left",
        cursor: "pointer",
        fontSize: 13,
      }}
    >
      {children}
    </button>
  );
}

// Legacy ConfirmDelete eliminado — ahora se usa AlertDialog de shadcn.
