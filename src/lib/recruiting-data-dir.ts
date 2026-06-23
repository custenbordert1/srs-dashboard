import path from "node:path";

export function recruitingDataDir(): string {
  const override = process.env.SRS_RECRUITING_DATA_DIR?.trim();
  return override ? path.resolve(override) : path.join(process.cwd(), ".data");
}
