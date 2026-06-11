import { hashPassword } from "@/lib/auth/password";
import type { DashboardUser, UserPublic, UserRole } from "@/lib/auth/types";
import { toPublicUser } from "@/lib/auth/session";
import { ensureUsersSeeded, findUserById } from "@/lib/auth/user-store";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { UserProfileSummary } from "@/lib/production-readiness/types";

const DATA_DIR = path.join(process.cwd(), ".data");
const USERS_PATH = path.join(DATA_DIR, "users.json");

async function readUsersFile() {
  await ensureUsersSeeded();
  const raw = await readFile(USERS_PATH, "utf8");
  return JSON.parse(raw) as { users: DashboardUser[]; seededAt?: string };
}

async function writeUsersFile(file: { users: DashboardUser[]; seededAt?: string }): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(USERS_PATH, JSON.stringify(file, null, 2), "utf8");
}

function toProfile(user: DashboardUser): UserProfileSummary {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    dmName: user.dmName,
    territoryStates: user.territoryStates,
    active: user.active,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function listUserProfiles(includeInactive = false): Promise<UserProfileSummary[]> {
  const file = await readUsersFile();
  const users = includeInactive ? file.users : file.users.filter((user) => user.active);
  return users.map(toProfile);
}

export async function createManagedUser(input: {
  email: string;
  name: string;
  role: UserRole;
  password: string;
  territoryStates?: string[];
  dmName?: string;
}): Promise<UserPublic> {
  const file = await readUsersFile();
  const normalized = input.email.trim().toLowerCase();
  if (file.users.some((user) => user.email.toLowerCase() === normalized)) {
    throw new Error("User with this email already exists");
  }
  const now = new Date().toISOString();
  const user: DashboardUser = {
    id: randomUUID(),
    email: normalized,
    name: input.name.trim(),
    role: input.role,
    passwordHash: hashPassword(input.password),
    dmName: input.dmName,
    territoryStates: input.territoryStates ?? [],
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  file.users.push(user);
  await writeUsersFile(file);
  return toPublicUser(user);
}

export async function updateManagedUser(
  userId: string,
  patch: Partial<Pick<DashboardUser, "name" | "role" | "territoryStates" | "active" | "dmName">>,
): Promise<UserProfileSummary | null> {
  const file = await readUsersFile();
  const index = file.users.findIndex((user) => user.id === userId);
  if (index < 0) return null;
  const updated: DashboardUser = {
    ...file.users[index]!,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  file.users[index] = updated;
  await writeUsersFile(file);
  return toProfile(updated);
}

export async function getManagedUserProfile(userId: string): Promise<UserProfileSummary | null> {
  const user = await findUserById(userId);
  if (!user) {
    const file = await readUsersFile();
    const inactive = file.users.find((row) => row.id === userId);
    return inactive ? toProfile(inactive) : null;
  }
  return toProfile(user);
}
