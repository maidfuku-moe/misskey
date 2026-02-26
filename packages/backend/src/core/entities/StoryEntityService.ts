/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { StoriesRepository, StoryViewsRepository, MiUser } from '@/models/_.js';
import { awaitAll } from '@/misc/prelude/await-all.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiStory } from '@/models/Story.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { UserEntityService } from './UserEntityService.js';

@Injectable()
export class StoryEntityService {
	constructor(
		@Inject(DI.storiesRepository)
		private storiesRepository: StoriesRepository,

		@Inject(DI.storyViewsRepository)
		private storyViewsRepository: StoryViewsRepository,

		private userEntityService: UserEntityService,
		private idService: IdService,
	) {
	}

	@bindThis
	public async pack(
		src: MiStory['id'] | MiStory,
		me?: { id: MiUser['id'] } | null | undefined,
	): Promise<Packed<'Story'>> {
		const meId = me ? me.id : null;
		const story = typeof src === 'object' ? src : await this.storiesRepository.findOneByOrFail({ id: src });

		return await awaitAll({
			id: story.id,
			createdAt: this.idService.parse(story.id).date.toISOString(),
			expiresAt: story.expiresAt.toISOString(),
			userId: story.userId,
			user: this.userEntityService.pack(story.user ?? story.userId, me),
			text: story.text,
			layer: story.layer,
			viewCount: story.viewCount,
			isViewed: meId
				? this.storyViewsRepository.exists({ where: { storyId: story.id, userId: meId } })
				: undefined,
		});
	}

	@bindThis
	public async packMany(
		stories: MiStory[],
		me?: { id: MiUser['id'] } | null | undefined,
	) {
		const _users = stories.map(({ user, userId }) => user ?? userId);
		const _userMap = await this.userEntityService.packMany(_users, me)
			.then(users => new Map(users.map(u => [u.id, u])));
		return Promise.all(stories.map(story => this.pack(story, me)));
	}
}
