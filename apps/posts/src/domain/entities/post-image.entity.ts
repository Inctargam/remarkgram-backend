export type PostImageProps = {
  fileId: string;
  position: number;
};

export class PostImage {
  readonly fileId: string;
  readonly position: number;

  private constructor(props: PostImageProps) {
    this.fileId = props.fileId;
    this.position = props.position;
  }

  static restore(props: PostImageProps): PostImage {
    return new PostImage(props);
  }
}
