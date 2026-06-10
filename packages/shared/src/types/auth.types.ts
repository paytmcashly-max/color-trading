import type { EntityId, ISODateString, UserRole, UserStatus } from "./game.types.js";

export interface AuthUser {
  id: EntityId;
  email: string;
  displayName: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface AuthTokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresInSeconds: number;
}

export interface AuthSession {
  user: AuthUser;
  tokens: AuthTokenPair;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  data: AuthSession;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface CurrentUserResponse {
  success: boolean;
  message: string;
  data: {
    user: AuthUser;
  };
}

export interface LogoutResponse {
  success: boolean;
  message: string;
  data: null;
}
