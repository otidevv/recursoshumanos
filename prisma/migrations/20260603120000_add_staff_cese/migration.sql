-- CreateEnum
CREATE TYPE "StaffCeseMotivo" AS ENUM ('RENUNCIA', 'FIN_CONTRATO', 'DESTITUCION_DESPIDO', 'JUBILACION', 'ABANDONO', 'FALLECIMIENTO', 'OTRO');

-- AlterTable
ALTER TABLE "AdministrativeStaff" ADD COLUMN     "fechaCese" TIMESTAMP(3),
ADD COLUMN     "motivoCese" "StaffCeseMotivo",
ADD COLUMN     "documentoCese" TEXT;
