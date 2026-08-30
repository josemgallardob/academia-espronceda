export interface LocalDemoCredentials {
  identifier: string;
  password: string;
}

export interface AppEnvironment {
  production: boolean;
  apiBaseUrl: string;
  localDemo: LocalDemoCredentials | null;
}
