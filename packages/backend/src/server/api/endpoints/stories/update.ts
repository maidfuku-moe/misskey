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
			id: 'c2d3e4f5-a6b7-8c9d-0e1f-2a3b4c5d6e7f',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		storyId: { type: 'string', format: 'misskey:id' },
		text: { type: 'string', nullable: true, maxLength: 500 },
		layer: { type: 'object', nullable: true },
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
				await this.storyService.update(me, ps.storyId, {
					text: ps.text,
					layer: ps.layer as Record<string, unknown> | null | undefined,
				});
			} catch (e) {
				if (e instanceof StoryService.NoSuchStoryError) {
					throw new ApiError(meta.errors.noSuchStory);
				}
				throw e;
			}
		});
	}
}
