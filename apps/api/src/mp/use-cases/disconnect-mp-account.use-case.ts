import { Inject, Injectable } from '@nestjs/common';
import { USERS_REPOSITORY, type UsersRepository } from '../../users/domain/users.repository';

@Injectable()
export class DisconnectMpAccount {
  constructor(@Inject(USERS_REPOSITORY) private readonly users: UsersRepository) {}

  async execute(): Promise<void> {
    const user = await this.users.getCurrent();
    await this.users.unlinkMpAccount(user.id);
  }
}
