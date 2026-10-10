-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "flags" TEXT[] DEFAULT ARRAY[]::TEXT[];
