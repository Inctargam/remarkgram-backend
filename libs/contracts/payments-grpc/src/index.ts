import { existsSync } from 'node:fs';
import { join } from 'node:path';

//Повторно экспортирует всё из сгенерированного модуля payments.js: интерфейсы, типы, enum, клиентские и серверные gRPC-контракты
export * from './generated/payments.js';

//Proto береться либо из скомпилированного файла в dist, либо из исходного файла в src, если dist отсутствует
const distProtoPath = join(import.meta.dirname, 'proto', 'payments.proto');

const sourceProtoPath = join(
  import.meta.dirname,
  '../../../../../../../libs/contracts/payments-grpc/src/proto/payments.proto',
);

//Если файл не найден ни по одному пути, приложение завершит загрузку модуля с понятной ошибкой ещё до инициализации gRPC
function resolvePaymentsProtoPath(): string {
  if (existsSync(distProtoPath)) {
    return distProtoPath;
  }

  if (existsSync(sourceProtoPath)) {
    return sourceProtoPath;
  }

  throw new Error(
    `Payments gRPC proto file was not found. Checked paths:\n` +
      `- ${distProtoPath}\n` +
      `- ${sourceProtoPath}`,
  );
}

export const PAYMENTS_GRPC_PROTO_PATH = resolvePaymentsProtoPath();
