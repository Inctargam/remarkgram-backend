# Ручные integration-тесты DBOS

`dbos-create-post.workflow.integration.spec.ts` использует настоящий PostgreSQL и
настоящий runtime DBOS. В обычном `pnpm test` набор пропускается, чтобы unit-тесты и
CI не зависели от локального Docker или внешней базы.

## Подготовка

Нужна отдельная одноразовая PostgreSQL-база. Тест удаляет только созданные им посты
и workflow history, но DBOS создаёт в базе системную схему `dbos`, поэтому production
URL использовать нельзя.

```bash
export POSTS_DBOS_INTEGRATION_DATABASE_URL='postgresql://postgres:postgres@localhost:5432/posts_dbos_integration'
export POSTS_DATABASE_URL="$POSTS_DBOS_INTEGRATION_DATABASE_URL"

pnpm prisma:posts:migrate:deploy
pnpm vitest run apps/posts/test/integration/dbos-create-post.workflow.integration.spec.ts --no-file-parallelism
```

DBOS system schema и `dbos.transaction_completion` тест подготовит сам. Для этого
пользователь базы должен иметь право создавать schema и tables.

## Что проверяется

- два конкурентных и один последовательный вызов с одинаковым workflow ID создают
  один `Post`, один упорядоченный набор `PostImage` и возвращают один результат;
- `createUnpublishedPost` и `publishPost` оставляют два реальных datasource checkpoint;
- если Files зафиксировал reserve или attach, но gRPC-ответ потерялся, DBOS повторяет
  step с прежним `reservationId`, а агрегат резервации делает повтор безопасным;
- пост становится видимым (`publishedAt != NULL`) только после успешного attach.

## Ограничение harness

Тест честно имитирует ключевое сетевое окно «downstream commit → потеря ответа», но
не выполняет `SIGKILL` процесса Node.js. Настоящий crash/restart-тест требует второго
процесса-воркера и внешнего координатора, который убивает его строго в нужной точке,
после чего запускает новый executor с тем же ID. Эти сценарии следует добавить в
deployment/e2e-набор, когда для CI появится управляемый PostgreSQL и возможность
запускать несколько процессов. Наличие текущего теста нельзя трактовать как проверку
восстановления после OS-level crash.
