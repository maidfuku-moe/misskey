/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { StoryEntityService } from '@/core/entities/StoryEntityService.js';
import { StoryService } from '@/core/StoryService.js';

export const meta = {
	tags: ['stories'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:account',

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'Story',
	},

	errors: {
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		text: { type: 'string', nullable: true, maxLength: 500 },
		layer: { type: 'object', nullable: true },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private storyEntityService: StoryEntityService,
		private storyService: StoryService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const story = await this.storyService.create(me, {
				text: ps.text,
				layer: ps.layer as Record<string, unknown> | null | undefined,
			});
			return await this.storyEntityService.pack(story, me);
		});
	}
}
