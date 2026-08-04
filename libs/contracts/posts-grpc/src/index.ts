import { existsSync } from 'node:fs';
import { join } from 'node:path';

export * from './generated/posts.js';
export * from './post-policy.js';

/** Metadata key used to carry a stable application error code through gRPC. */
export const POSTS_APP_ERROR_CODE_METADATA_KEY = 'posts-error-code';

const distProtoPath = join(import.meta.dirname, 'proto/posts.proto');
const sourceProtoPath = join(
  import.meta.dirname,
  '../../../../../../../libs/contracts/posts-grpc/src/proto/posts.proto',
);

export const POSTS_GRPC_PROTO_PATH = existsSync(distProtoPath) ? distProtoPath : sourceProtoPath;
