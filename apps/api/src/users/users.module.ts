import { Module } from '@nestjs/common';
import { createTokenCipher } from '../shared/security/token-cipher';
import { TOKEN_CIPHER } from '../shared/security/token-cipher.token';
import { USERS_REPOSITORY } from './domain/users.repository';
import { JsonUsersRepository } from './repositories/json-users.repository';
import { GetCurrentUser } from './use-cases/get-current-user.use-case';
import { CurrentUserProvider } from './providers/current-user.provider';

@Module({
  providers: [
    {
      provide: TOKEN_CIPHER,
      useFactory: () => {
        const key = process.env.TOKEN_ENCRYPTION_KEY;
        if (!key) throw new Error('TOKEN_ENCRYPTION_KEY is required to start the API');
        return createTokenCipher(key);
      },
    },
    { provide: USERS_REPOSITORY, useClass: JsonUsersRepository },
    GetCurrentUser,
    CurrentUserProvider,
  ],
  exports: [USERS_REPOSITORY, TOKEN_CIPHER, GetCurrentUser, CurrentUserProvider],
})
export class UsersModule {}
