import { BaseRepository } from '../../core/database/BaseRepository.js';
import { ChatModel } from './chat.model.js';

export class ChatRepository extends BaseRepository {
  constructor() {
    super(ChatModel);
  }
}

export const chatRepository = new ChatRepository();
