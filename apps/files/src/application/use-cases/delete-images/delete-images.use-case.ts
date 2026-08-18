//
// export class DeleteImagesCommand extends Command<void> {
//   constructor(public readonly imageIds: string[]) {
//     super();
//   }
// }
//
// @CommandHandler(DeleteImagesCommand)
// export class DeleteImagesUseCase implements ICommandHandler<DeleteImagesCommand> {
//   constructor() {}
//
//   execute(command: DeleteImagesCommand): void {
//     const { imageIds } = command;
//     console.log(imageIds);
//   }
// }
