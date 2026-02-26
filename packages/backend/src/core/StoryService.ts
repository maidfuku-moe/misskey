/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In, LessThan, MoreThan } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { StoriesRepository, StoryViewsRepository, FollowingsRepository } from '@/models/_.js';
import type { MiStory } from '@/models/Story.js';
import type { MiStoryView } from '@/models/StoryView.js';
import type { MiLocalUser } from '@/models/User.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { StoryEntityService } from '@/core/entities/StoryEntityService.js';

const STORY_EXPIRY_HOURS = 24;

@Injectable()
export class StoryService {
	public static NoSuchStoryError = class extends Error {};
	public static AccessDeniedError = class extends Error {};

	constructor(
		@Inject(DI.storiesRepository)
		private storiesRepository: StoriesRepository,

		@Inject(DI.storyViewsRepository)
		private storyViewsRepository: StoryViewsRepository,

		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		private idService: IdService,
		private globalEventService: GlobalEventService,
		private storyEntityService: StoryEntityService,
	) {
	}

	@bindThis
	public async create(
		me: MiLocalUser,
		params: {
			text?: string | null;
			layer?: Record<string, unknown> | null;
		},
	): Promise<MiStory> {
		const now = new Date();
		const expiresAt = new Date(now.getTime() + STORY_EXPIRY_HOURS * 60 * 60 * 1000);

		const story = await this.storiesRepository.insertOne({
			id: this.idService.gen(),
			userId: me.id,
			text: params.text ?? null,
			layer: params.layer ?? null,
			expiresAt,
			viewCount: 0,
		});

		// Notify followers in real-time
		const followers = await this.followingsRepository.findBy({ followeeId: me.id });
		const packed = await this.storyEntityService.pack(story, me);
		for (const follower of followers) {
			this.globalEventService.publishMainStream(follower.followerId, 'storyCreated', packed);
		}
		// Also notify the creator themselves
		this.globalEventService.publishMainStream(me.id, 'storyCreated', packed);

		return story;
	}

	@bindThis
	public async update(
		me: MiLocalUser,
		storyId: MiStory['id'],
		params: {
			text?: string | null;
			layer?: Record<string, unknown> | null;
		},
	): Promise<void> {
		const story = await this.storiesRepository.findOneBy({ id: storyId, userId: me.id });
		if (story == null) {
			throw new StoryService.NoSuchStoryError();
		}

		await this.storiesRepository.update(story.id, {
			text: params.text,
			layer: params.layer,
		});
	}

	@bindThis
	public async delete(me: MiLocalUser, storyId: MiStory['id']): Promise<void> {
		const story = await this.storiesRepository.findOneBy({ id: storyId, userId: me.id });
		if (story == null) {
			throw new StoryService.NoSuchStoryError();
		}

		await this.storiesRepository.delete(story.id);
	}

	@bindThis
	public async view(me: MiLocalUser, storyId: MiStory['id']): Promise<void> {
		const story = await this.storiesRepository.findOneBy({
			id: storyId,
			expiresAt: MoreThan(new Date()),
		});

		if (story == null) {
			throw new StoryService.NoSuchStoryError();
		}

		// Don't count views on own stories
		if (story.userId === me.id) return;

		const existing = await this.storyViewsRepository.findOneBy({ storyId, userId: me.id });
		if (existing != null) return;

		await this.storyViewsRepository.insertOne({
			id: this.idService.gen(),
			storyId,
			userId: me.id,
			viewedAt: new Date(),
		});

		await this.storiesRepository.increment({ id: storyId }, 'viewCount', 1);
	}

	@bindThis
	public async listForUser(me: MiLocalUser): Promise<MiStory[]> {
		const followings = await this.followingsRepository.findBy({ followerId: me.id });
		const followeeIds = followings.map(f => f.followeeId);

		// Include own stories + followees' stories
		const userIds = [...followeeIds, me.id];

		if (userIds.length === 0) return [];

		const now = new Date();
		const stories = await this.storiesRepository.find({
			where: {
				userId: In(userIds),
				expiresAt: MoreThan(now),
			},
			relations: ['user'],
			order: { id: 'DESC' },
		});

		return stories;
	}

	@bindThis
	public async getViewers(
		me: MiLocalUser,
		storyId: MiStory['id'],
	): Promise<MiStoryView[]> {
		const story = await this.storiesRepository.findOneBy({ id: storyId, userId: me.id });
		if (story == null) {
			throw new StoryService.NoSuchStoryError();
		}

		return this.storyViewsRepository.find({
			where: { storyId },
			relations: ['user'],
			order: { viewedAt: 'DESC' },
		});
	}

	@bindThis
	public async cleanup(): Promise<void> {
		await this.storiesRepository.delete({
			expiresAt: LessThan(new Date()),
		});
	}
}
