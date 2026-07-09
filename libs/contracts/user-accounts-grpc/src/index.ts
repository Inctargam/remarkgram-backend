import { existsSync } from 'node:fs';
import { join } from 'node:path';

export * from './generated/user-accounts.js';

/** Metadata key used to carry a stable application error code through gRPC. */
export const USER_ACCOUNTS_APP_ERROR_CODE_METADATA_KEY = 'user-accounts-error-code';

// В production/build-сценарии Nest CLI копирует user-accounts.proto рядом со скомпилированной
// contract library внутри dist. Этот путь должен совпадать с настройкой assets в nest-cli.json.
const distProtoPath = join(import.meta.dirname, 'proto/user-accounts.proto');

// В dev/watch-сценарии приложение может стартовать раньше, чем Nest CLI успеет скопировать
// assets в dist. Поэтому держим fallback на исходный .proto в libs/contracts.
// Путь строится от import.meta.dirname, а не от process.cwd(), чтобы не зависеть от папки,
// из которой был запущен node-процесс.
const sourceProtoPath = join(
  import.meta.dirname,
  '../../../../../../../libs/contracts/user-accounts-grpc/src/proto/user-accounts.proto',
);

// Сначала используем dist-asset, если он уже есть. Если его ещё нет, читаем source .proto.
// Это закрывает холодный старт start:dev без предварительного build и сохраняет обычный build/prod путь.
export const USER_ACCOUNTS_GRPC_PROTO_PATH = existsSync(distProtoPath) ? distProtoPath : sourceProtoPath;
