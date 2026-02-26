/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const packedStorySchema = {
	type: 'object',
	properties: {
		id: {
			type: 'string',
			optional: false, nullable: false,
			format: 'id',
			example: 'xxxxxxxxxx',
		},
		createdAt: {
			type: 'string',
			optional: false, nullable: false,
			format: 'date-time',
		},
		expiresAt: {
			type: 'string',
			optional: false, nullable: false,
			format: 'date-time',
		},
		userId: {
			type: 'string',
			optional: false, nullable: false,
			format: 'id',
		},
		user: {
			type: 'object',
			ref: 'UserLite',
			optional: false, nullable: false,
		},
		text: {
			type: 'string',
			optional: false, nullable: true,
		},
		layer: {
			type: 'object',
			optional: false, nullable: true,
		},
		viewCount: {
			type: 'integer',
			optional: false, nullable: false,
		},
		isViewed: {
			type: 'boolean',
			optional: true, nullable: false,
		},
	},
} as const;
