export type LocalRow = {
  id: string;
  code: string;
  name: string;
  sedeFilial: string;
  ubigeoCode: string;
  ubigeoLabel: string;
  direccion: string;
  tipoAutorizacion: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LocalInput = {
  code: string;
  name: string;
  sedeFilial: string;
  ubigeoCode: string;
  direccion: string;
  tipoAutorizacion: string;
};

export type PermFlags = {
  canRead: boolean;
  canWrite: boolean;
};

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<string, string>>;
    };
