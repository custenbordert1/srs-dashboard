/** Stored session roles. Portal-facing labels (Admin / Recruiter / DistrictManager) live in `@/lib/dm-portal/roles`. */
export type UserRole = "admin" | "executive" | "recruiter" | "dm";

export type DashboardUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  passwordHash: string;
  /** DM display name aligned with dm-territory-map values. */
  dmName?: string;
  /** Two-letter state codes this user may access (DM territory). */
  territoryStates: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UserPublic = Omit<DashboardUser, "passwordHash">;

export type AuthSession = {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  dmName?: string;
  territoryStates: string[];
  expiresAt: string;
};

export type UsersFile = {
  users: DashboardUser[];
  seededAt?: string;
};
