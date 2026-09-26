import type { CurrentUserView, MyProfileView, PublicUserProfileView } from '../types/users.types.js';

export abstract class UsersQueryRepository {
  abstract findCurrentById(userId: number): Promise<CurrentUserView | null>;
  abstract findPublicProfileByUserId(userId: number): Promise<PublicUserProfileView | null>;
  abstract findMyProfileByUserId(userId: number): Promise<MyProfileView | null>;
}
