import {
  defineRailway,
  github,
  group,
  preserve,
  project,
  service,
} from "railway/iac";

const REPOSITORY = "jmgallardob/academia-espronceda";
const REGION = "europe-west4";

export default defineRailway(() => {
  const solver = service("academia-espronceda-solver", {
    source: github(REPOSITORY, { branch: "main" }),
    start: "python -m academia_espronceda_solver",
    healthcheck: "/health",
    healthcheckTimeout: 120,
    replicas: { [REGION]: 1 },
    env: {
      NODE_ENV: "production",
      SOLVER_HOST: "0.0.0.0",
      RAILWAY_DOCKERFILE_PATH: "Dockerfile.solver",
      INTERNAL_SERVICE_TOKEN: preserve(),
    },
  });

  const web = service("academia-espronceda-web", {
    source: github(REPOSITORY, { branch: "main" }),
    start: "npm run db:migrate:prod && npm run start:prod:api",
    healthcheck: "/health",
    healthcheckTimeout: 30,
    replicas: { [REGION]: 1 },
    env: {
      NODE_ENV: "production",
      API_HOST: "0.0.0.0",
      COOKIE_SECURE: "true",
      TRUST_PROXY: "true",
      AUTH_COOKIE_NAME: "__Host-academia_session",
      XSRF_COOKIE_NAME: "XSRF-TOKEN",
      JWT_ISSUER: "academia-espronceda-api",
      JWT_AUDIENCE: "academia-espronceda-web",
      JWT_TTL_SECONDS: "36000",
      RAILWAY_DOCKERFILE_PATH: "Dockerfile.web",
      SOLVER_URL: `http://${solver.env.RAILWAY_PRIVATE_DOMAIN}:${solver.env.PORT}`,
      DATABASE_URL: preserve(),
      DATABASE_AUTH_TOKEN: preserve(),
      JWT_SECRET: preserve(),
      INTERNAL_SERVICE_TOKEN: preserve(),
      API_CORS_ORIGINS: preserve(),
    },
  });

  return project("academia-espronceda", {
    resources: [group("Production", [web, solver])],
  });
});
