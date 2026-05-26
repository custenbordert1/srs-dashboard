import { DISTRICT_MANAGERS, getAssignedStatesForDm } from "@/lib/dm-territory-map";
import { getConfiguredDefaultPassword } from "@/lib/auth/auth-env";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import type { DashboardUser, UserPublic, UsersFile } from "@/lib/auth/types";
import { toPublicUser } from "@/lib/auth/session";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), ".data");
const USERS_PATH = path.join(DATA_DIR, "users.json");

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

async function readUsersFile(): Promise<UsersFile> {
  try {
    const raw = await readFile(USERS_PATH, "utf8");
    const parsed = JSON.parse(raw) as UsersFile;
    if (!parsed.users || !Array.isArray(parsed.users)) return { users: [] };
    return parsed;
  } catch {
    return { users: [] };
  }
}

async function writeUsersFile(file: UsersFile): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(USERS_PATH, JSON.stringify(file, null, 2), "utf8");
}

function defaultPassword(): string {
  return getConfiguredDefaultPassword();
}

function buildSeedUsers(): DashboardUser[] {
  const now = new Date().toISOString();
  const passwordHash = hashPassword(defaultPassword());
  const users: DashboardUser[] = [
    {
      id: "user-admin",
      email: "admin@srsmerchandising.com",
      name: "Admin",
      role: "admin",
      passwordHash,
      territoryStates: [],
      active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "user-executive",
      email: "executive@srsmerchandising.com",
      name: "Executive Admin",
      role: "executive",
      passwordHash,
      territoryStates: [],
      active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "user-recruiter",
      email: "recruiter@srsmerchandising.com",
      name: "Recruiting Team",
      role: "recruiter",
      passwordHash,
      territoryStates: [],
      active: true,
      createdAt: now,
      updatedAt: now,
    },
  ];

  for (const dmName of DISTRICT_MANAGERS) {
    users.push({
      id: `user-dm-${slugify(dmName)}`,
      email: `${slugify(dmName)}@srsmerchandising.com`,
      name: dmName,
      role: "dm",
      passwordHash,
      dmName,
      territoryStates: getAssignedStatesForDm(dmName),
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  return users;
}

export async function ensureUsersSeeded(): Promise<void> {
  const file = await readUsersFile();
  if (file.users.length > 0) return;
  await writeUsersFile({
    users: buildSeedUsers(),
    seededAt: new Date().toISOString(),
  });
}

export async function findUserByEmail(email: string): Promise<DashboardUser | null> {
  await ensureUsersSeeded();
  const normalized = email.trim().toLowerCase();
  const file = await readUsersFile();
  return file.users.find((user) => user.email.toLowerCase() === normalized && user.active) ?? null;
}

async function updateUserPasswordHash(userId: string, passwordHash: string): Promise<void> {
  const file = await readUsersFile();
  const index = file.users.findIndex((user) => user.id === userId);
  if (index < 0) return;
  file.users[index] = {
    ...file.users[index],
    passwordHash,
    updatedAt: new Date().toISOString(),
  };
  await writeUsersFile(file);
}

/** Verifies password against stored hash only (no shared demo password). */
export async function authenticateUser(email: string, password: string): Promise<DashboardUser | null> {
  const user = await findUserByEmail(email);
  if (!user) return null;
  if (verifyPassword(password, user.passwordHash)) return user;
  return null;
}

export async function updateUserPassword(userId: string, newPassword: string): Promise<void> {
  const passwordHash = hashPassword(newPassword);
  await updateUserPasswordHash(userId, passwordHash);
}

export async function findUserById(id: string): Promise<DashboardUser | null> {
  await ensureUsersSeeded();
  const file = await readUsersFile();
  return file.users.find((user) => user.id === id && user.active) ?? null;
}

export async function listUsers(): Promise<UserPublic[]> {
  await ensureUsersSeeded();
  const file = await readUsersFile();
  return file.users.filter((user) => user.active).map((user) => toPublicUser(user));
}
