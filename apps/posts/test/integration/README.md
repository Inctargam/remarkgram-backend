# Интеграционные проверки CreatePost

Использовать только одноразовую PostgreSQL. Без переменных окружения наборы пропускаются.

`dbos-create-post.workflow.integration.spec.ts` проверяет настоящий SDK DBOS и транзакции
Posts; транспорт Files подменён для управляемой потери ответа. База должна содержать миграции Posts:

```bash
export POSTS_DBOS_INTEGRATION_DATABASE_URL='postgresql://postgres:postgres@localhost:5432/posts_test'
POSTS_DATABASE_URL="$POSTS_DBOS_INTEGRATION_DATABASE_URL" pnpm prisma:posts:migrate:deploy
pnpm exec vitest run apps/posts/test/integration/dbos-create-post.workflow.integration.spec.ts
```

`create-post-recovery.integration.spec.ts` создаёт и удаляет две отдельные базы. Он запускает
собранный код Posts и Files в дочернем процессе, убивает его через SIGKILL и проверяет recovery
до/после транзакций создания и публикации, после прикрепления и на этапах компенсации.
Проверяются стабильность operationId, отсутствие повторных эффектов и сохранение порядка файлов.

```bash
pnpm build:posts
pnpm build:files
export POST_ATTACHMENT_INTEGRATION_DATABASE_URL='postgresql://postgres:postgres@localhost:5432/postgres'
pnpm exec vitest run apps/posts/test/integration/create-post-recovery.integration.spec.ts apps/files/test/integration/post-image-attachment.integration.spec.ts
```

Пользователь административного тестового подключения должен иметь право создавать и удалять
тестовые базы. Проверки Files также тестируют миграцию старых статусов, хеши, атомарный откат,
конкуренцию Attach/Cancel, двух постов, аватара и очистки. Обе тестовые программы удаляют
только базы со сгенерированными ими именами.
