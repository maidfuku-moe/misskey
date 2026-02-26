/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { StoryService } from '@/core/StoryService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { DI } from '@/di-symbols.js';
import type { StoryViewsRepository } from '@/models/_.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['stories'],

	requireCredential: true,

	kind: 'read:account',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				userId: { type: 'string', format: 'id', optional: false, nullable: false },
				user: { type: 'object', ref: 'UserLite', optional: false, nullable: false },
				viewedAt: { type: 'string', format: 'date-time', optional: false, nullable: false },
			},
		},
	},

	errors: {
		noSuchStory: {
			message: 'No such story.',
			code: 'NO_SUCH_STORY',
			id: 'e4f5a6b7-c8d9-0e1f-2a3b-4c5d6e7f8a9b',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		storyId: { type: 'string', format: 'misskey:id' },
	},
	required: ['storyId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private storyService: StoryService,
		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			try {
				const views = await this.storyService.getViewers(me, ps.storyId);
				return Promise.all(views.map(async (v) => ({
					userId: v.userId,
					user: await this.userEntityService.pack(v.user ?? v.userId, me),
					viewedAt: v.viewedAt.toISOString(),
				})));
			} catch (e) {
				if (e instanceof StoryService.NoSuchStoryError) {
					throw new ApiError(meta.errors.noSuchStory);
				}
				throw e;
			}
		});
	}
}
