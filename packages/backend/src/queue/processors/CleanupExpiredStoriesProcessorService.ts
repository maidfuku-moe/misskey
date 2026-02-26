/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { StoryService } from '@/core/StoryService.js';
import { QueueLoggerService } from '../QueueLoggerService.js';

@Injectable()
export class CleanupExpiredStoriesProcessorService {
	private logger: Logger;

	constructor(
		private storyService: StoryService,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('cleanup-expired-stories');
	}

	@bindThis
	public async process(): Promise<void> {
		this.logger.info('Cleaning up expired stories...');
		await this.storyService.cleanup();
		this.logger.succ('Expired stories cleaned up.');
	}
}
