import { Controller } from '@nestjs/common';
import { EventPattern } from '@nestjs/microservices';
import { POST_DELETED_V1_EVENT_NAME, type PostDeletedV1Event } from '@app/message-broker';

@Controller()
export class PostDeletedConsumer {
  @EventPattern(POST_DELETED_V1_EVENT_NAME)
  handle(data: PostDeletedV1Event) {
    console.log('PostDeletedConsumer', data);
  }
}
