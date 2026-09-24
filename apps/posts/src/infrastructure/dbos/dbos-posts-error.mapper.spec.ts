import {
  ImageUploadsServiceUnavailableError,
  PostImageAlreadyAttachedError,
  PostImageNotFoundError,
  PostImagesNotAvailableError,
} from '../../application/errors/create-post.errors.js';
import { PostsError, PostsErrorCode } from '../../application/errors/posts.error.js';
import { getPostsErrorCode, restorePostsError } from './dbos-posts-error.mapper.js';

const cases = [
  { ErrorType: PostImageNotFoundError, code: PostsErrorCode.POST_IMAGE_NOT_FOUND },
  { ErrorType: PostImagesNotAvailableError, code: PostsErrorCode.POST_IMAGES_NOT_AVAILABLE },
  { ErrorType: PostImageAlreadyAttachedError, code: PostsErrorCode.POST_IMAGE_ALREADY_ATTACHED },
  { ErrorType: ImageUploadsServiceUnavailableError, code: PostsErrorCode.IMAGE_UPLOADS_SERVICE_UNAVAILABLE },
];

describe('DBOS Posts error recovery', () => {
  it.each(cases)('restores $code from a checkpoint with its code', ({ ErrorType, code }) => {
    const restored = restorePostsError({ code });
    expect(restored).toBeInstanceOf(ErrorType);
    expect(restored).toBeInstanceOf(PostsError);
    expect(restored).toMatchObject({ code, message: new ErrorType().message });
  });

  it.each(cases)('restores $code by name when the checkpoint lost code', ({ ErrorType, code }) => {
    const replay = Object.assign(new Error(new ErrorType().message), { name: ErrorType.name });
    expect(restorePostsError(replay)).toBeInstanceOf(ErrorType);
    expect(restorePostsError(replay)).toMatchObject({ code });
  });

  it.each(cases)('preserves the original $code instance and stack', ({ ErrorType }) => {
    const error = new ErrorType();
    expect(restorePostsError(error)).toBe(error);
  });

  it.each([
    null,
    undefined,
    'unexpected',
    new Error('One or more images are already attached to a post'),
    Object.assign(new Error('disconnected'), { code: 'P1017' }),
    Object.assign(new Error('unknown code'), { code: 'UNKNOWN', name: 'PostImageAlreadyAttachedError' }),
  ])('preserves unknown errors: %s', (error) => {
    expect(restorePostsError(error)).toBe(error);
  });
});

describe('getPostsErrorCode', () => {
  it.each(cases)('reads $code from an original error and both checkpoint forms', ({ ErrorType, code }) => {
    expect(getPostsErrorCode(new ErrorType())).toBe(code);
    expect(getPostsErrorCode({ code })).toBe(code);
    expect(getPostsErrorCode(Object.assign(new Error('stored'), { name: ErrorType.name }))).toBe(code);
  });

  it('preserves an unknown code instead of falling back to a known name', () => {
    const error = Object.assign(new Error('unexpected'), {
      code: 'P1017',
      name: 'PostImageAlreadyAttachedError',
    });
    expect(getPostsErrorCode(error)).toBe('P1017');
  });

  it('does not classify a transport error by a matching name', () => {
    const error = Object.assign(new Error('transport'), { code: 14, name: 'PostImageAlreadyAttachedError' });
    expect(getPostsErrorCode(error)).toBeUndefined();
  });

  it.each([null, undefined, 'unexpected', new Error('unexpected')])(
    'ignores unrecognized values: %s',
    (error) => {
      expect(getPostsErrorCode(error)).toBeUndefined();
    },
  );
});
