/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { StoryService } from '@/core/StoryService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['stories'],

	requireCredential: true,

	kind: 'write:account',

	errors: {
		noSuchStory: {
			message: 'No such story.',
			code: 'NO_SUCH_STORY',
			id: 'b1c2d3e4-f5a6-7b8c-9d0e-1f2a3b4c5d6e',
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
	) {
		super(meta, paramDef, async (ps, me) => {
			try {
				await this.storyService.delete(me, ps.storyId);
			} catch (e) {
				if (e instanceof StoryService.NoSuchStoryError) {
					throw new ApiError(meta.errors.noSuchStory);
				}
				throw e;
			}
		});
	}
}
