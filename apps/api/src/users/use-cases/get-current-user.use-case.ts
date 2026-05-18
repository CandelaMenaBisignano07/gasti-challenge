import { Inject, Injectable } from '@nestjs/common';
import { USERS_REPOSITORY, type UsersRepository } from '../domain/users.repository';
import type { User } from '../domain/user';

@Injectable()
export class GetCurrentUser {
  constructor(@Inject(USERS_REPOSITORY) private readonly users: UsersRepository) {}
  execute(): Promise<User> {
    return this.users.getCurrent();
  }
}
