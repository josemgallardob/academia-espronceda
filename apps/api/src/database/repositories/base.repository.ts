import type { DatabaseConnection } from '../database.connection';

export abstract class BaseRepository {
  protected constructor(protected readonly connection: DatabaseConnection) {}

  protected get db(): DatabaseConnection['db'] {
    return this.connection.db;
  }
}
