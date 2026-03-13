export type TokenType = 'access' | 'refresh';

export interface JwtPayloadBase {
  sub: string;
  jti: string;
  type: TokenType;
}

export interface AccessTokenPayload extends JwtPayloadBase {
  type: 'access';
}

export interface RefreshTokenPayload extends JwtPayloadBase {
  type: 'refresh';
}

export interface AuthenticatedUser {
  userId: string;
  jti: string;
  tokenType: TokenType;
}
