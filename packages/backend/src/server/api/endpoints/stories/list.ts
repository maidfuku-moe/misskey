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

	kind: 'read:account',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Story',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private storyEntityService: StoryEntityService,
		private storyService: StoryService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const stories = await this.storyService.listForUser(me);
			return this.storyEntityService.packMany(stories, me);
		});
	}
}
