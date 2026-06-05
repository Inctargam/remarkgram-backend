type PostProps = {
  id?: number;
  title: string;
  content: string;
};

export type PostCreate = {
  title: string;
  content: string;
};

export class Post {
  private constructor(private readonly props: PostProps) {}

  static create(props: PostCreate): Post {
    return new Post({ ...props });
  }

  static restore(props: PostProps): Post {
    const resorepost = new Post({
      id: props.id,
      title: props.title,
      content: props.content,
    });
    console.log('restore', resorepost);
    return resorepost;
  }

  get id(): number | null {
    return this.props?.id ?? null;
  }

  get title(): string {
    return this.props.title;
  }

  get content(): string {
    return this.props.content;
  }
}
