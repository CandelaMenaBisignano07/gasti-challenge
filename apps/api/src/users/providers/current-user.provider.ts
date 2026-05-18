import { Inject, Injectable } from '@nestjs/common';
import { USERS_REPOSITORY, type UsersRepository } from '../domain/users.repository';
import type { User } from '../domain/user';

@Injectable()
export class CurrentUserProvider {
  constructor(@Inject(USERS_REPOSITORY) private readonly users: UsersRepository) {}
  /** v1: single user. `headerUserId` reserved for multi-tenant. */
  resolve(_headerUserId?: string): Promise<User> {
    return this.users.getCurrent();
  }
}
