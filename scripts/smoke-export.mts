import { writeFileSync } from "node:fs";
import { generateSuneduXlsx } from "../src/lib/sunedu/export";

const buf = await generateSuneduXlsx([
  {
    cargoCode: 3,
    dependenciaCode: 9,
    fechaIngresoIE: new Date(2024, 2, 15),
    tipoDocumentoCode: 1,
    numeroDocumento: "12345678",
    nombres: "Juan Carlos",
    primerApellido: "PÉREZ",
    segundoApellido: "GARCÍA",
    apellidoCasada: null,
    unSoloApellido: false,
    condicionDiscapacidad: false,
    tipoDiscapacidadCode: null,
    sexoCode: 1,
    fechaNacimiento: new Date(1985, 5, 20),
    paisNacimientoCode: "9233",
    ubigeoNacimiento: "160101",
    ubigeoDomicilio: "160101",
    correoInstitucional: "jperez@unamad.edu.pe",
    correoPersonal: null,
    telefono: null,
    celular: "987654321",
    vinculos: [
      {
        regimenLaboralCode: 4,
        vinculoActualCode: 1,
        fechaInicio: new Date(2024, 2, 15),
        fechaTermino: null,
      },
    ],
    workplaces: [
      {
        otroLocal: false,
        localCode: "SL01",
        ubigeoLocal: null,
        direccion: null,
      },
    ],
  },
]);

const out = "C:/Users/PC/AppData/Local/Temp/sunedu-smoke.xlsx";
writeFileSync(out, buf);
console.log(`OK · ${buf.length} bytes → ${out}`);
