import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SessionsService } from '../../../sessions/application/sessions.service.js';
import { AuthService } from '../auth.service.js';
import {
  EmailNotConfirmedError,
  IncorrectCredentialsError,
  UserAlreadyLoggedInError,
} from '../errors/auth.errors.js';
import type { JwtPair, LoginParams } from '../types/auth.types.js';

export class LoginCommand extends Command<JwtPair> {
  constructor(public readonly params: LoginParams) {
    super();
  }
}

@CommandHandler(LoginCommand)
export class LoginUseCase implements ICommandHandler<LoginCommand> {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionsService: SessionsService,
  ) {}

  async execute(command: LoginCommand) {
    const { email, password, currentSession, deviceName, ip } = command.params;
    if (currentSession && (await this.sessionsService.checkSession(currentSession))) {
      throw new UserAlreadyLoggedInError();
    }

    const user = await this.authService.verifyCredentials(email, password);
    if (!user.confirmation.isConfirmed) {
      throw new EmailNotConfirmedError();
    }

    // verifyCredentials only returns a password user, so the hash is present here.
    if (!user.hash) {
      throw new IncorrectCredentialsError();
    }

    const sessionId = crypto.randomUUID();
    const userId = user.id.toString();
    const { accessToken, refreshToken, refreshTokenPayload } = await this.authService.generateTokenPair({
      userId,
      sessionId,
    });

    // При одновременных запросах с одного устройства (двойной клик, нестабильная сеть)
    // оба запроса пройдут все проверки и создадут разные сессии с одинаковым userId+deviceName.
    // Первая сессия станет «мусорной» — у клиента будет только последний refresh-токен.
    // Решения: rate limiting на уровне API Gateway (рекомендуется) или уникальный индекс
    // на (userId, deviceName) с upsert, если deviceName однозначно идентифицирует устройство.

    // Пароль уже проверен по user.hash, но между этой проверкой и созданием сессии другой запрос может
    // сбросить пароль, изменить hash и удалить все существующие сессии. Поэтому передаём в репозиторий
    // именно тот hash, по которому были подтверждены credentials. Репозиторий атомарно сверяет его с
    // текущим значением под блокировкой строки User и создаёт сессию только при совпадении.
    const wasCreated = await this.sessionsService.createSession({
      userId,
      expectedPasswordHash: user.hash,
      sessionId,
      deviceName,
      ip,
      jti: refreshTokenPayload.jti,
      lastActiveAt: new Date(refreshTokenPayload.iat * 1000),
      expiresAt: new Date(refreshTokenPayload.exp * 1000),
    });

    if (!wasCreated) {
      // false означает, что после проверки credentials пользователь был удалён или его пароль изменился.
      // Выпущенные выше токены клиенту не возвращаются и не связаны ни с одной сохранённой сессией.
      throw new IncorrectCredentialsError();
    }

    return { accessToken, refreshToken };
  }
}
