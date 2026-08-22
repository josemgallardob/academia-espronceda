import { Injectable } from '@nestjs/common';
import { count, eq, or, sql } from 'drizzle-orm';
import { DatabaseConnection } from '../database.connection';
import { type NewUserRow, type UserRow, users } from '../schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class UsersRepository extends BaseRepository {
  constructor(connection: DatabaseConnection) {
    super(connection);
  }

  async insert(user: NewUserRow): Promise<UserRow> {
    const [created] = await this.db.insert(users).values(user).returning();
    return created;
  }

  async count(): Promise<number> {
    const [result] = await this.db.select({ value: count() }).from(users);
    return result.value;
  }

  async insertInitialUsers(
    initialUsers: NewUserRow[],
  ): Promise<UserRow[] | undefined> {
    return this.db.transaction(async (transaction) => {
      const [result] = await transaction.select({ value: count() }).from(users);
      if (result.value !== 0) {
        return undefined;
      }

      return transaction.insert(users).values(initialUsers).returning();
    });
  }

  async findById(id: string): Promise<UserRow | undefined> {
    return this.db.query.users.findFirst({ where: eq(users.id, id) });
  }

  async findByIdentity(identity: string): Promise<UserRow | undefined> {
    const normalizedIdentity = identity.trim().toLowerCase();
    return this.db.query.users.findFirst({
      where: or(
        sql`lower(${users.username}) = ${normalizedIdentity}`,
        sql`lower(${users.email}) = ${normalizedIdentity}`,
      ),
    });
  }

  async recordLogin(id: string, occurredAt: string): Promise<void> {
    await this.db
      .update(users)
      .set({ lastLoginAt: occurredAt, updatedAt: occurredAt })
      .where(eq(users.id, id));
  }

  async incrementTokenVersion(id: string, occurredAt: string): Promise<void> {
    await this.db
      .update(users)
      .set({
        tokenVersion: sql`${users.tokenVersion} + 1`,
        updatedAt: occurredAt,
      })
      .where(eq(users.id, id));
  }

  async updatePasswordAndTokenVersion(
    id: string,
    passwordHash: string,
    occurredAt: string,
  ): Promise<UserRow | undefined> {
    const [updated] = await this.db
      .update(users)
      .set({
        passwordHash,
        tokenVersion: sql`${users.tokenVersion} + 1`,
        updatedAt: occurredAt,
      })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }
}
